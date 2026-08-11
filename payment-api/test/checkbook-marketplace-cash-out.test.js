import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  completeMarketplaceCashOutSandbox,
  createMarketplaceCashOut,
  refreshMarketplaceCashOutStatus,
} from "../dist/checkbook-marketplace.js";
import {
  saveMarketplaceParticipant,
  saveMarketplacePaymentMethod,
  saveMarketplaceTreasury,
  saveMarketplaceTreasuryUser,
  saveMarketplaceWallet,
  findOrCreateMarketplaceCashOut,
  recordMarketplaceCashOutOperation,
} from "../dist/checkbook-marketplace-repository.js";
import { createFixturePaymentMethod, freshDatabase } from "./support/fixtures.js";
import {
  listDemoCashOutsForEntity,
  markDemoCashOutSubmitted,
  reserveDemoCashOut,
} from "../dist/demo-cash-out-repository.js";
import { getIsdLedgerBalance } from "../dist/isd-ledger-repository.js";

let cleanup;
let originalFetch;

beforeEach(() => {
  cleanup = freshDatabase();
  originalFetch = globalThis.fetch;
  process.env.CHECKBOOK_BASE_URL = "https://sandbox.checkbook.io";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

function setupMarketplace() {
  const paymentMethodId = createFixturePaymentMethod("owner1");
  saveMarketplaceParticipant({
    demoEntityId: "owner1", userId: "participant-user", userRef: "tfulton+owner1@isheepdog.com",
    key: "participant-key", secret: "participant-secret", status: "VERIFIED",
  });
  saveMarketplaceWallet({ demoEntityId: "owner1", id: "participant-wallet", name: "Owner wallet", balanceMinor: 0 });
  saveMarketplacePaymentMethod({ demoEntityId: "owner1", paymentMethodId, bankId: "participant-bank", status: "VERIFIED" });
  saveMarketplaceTreasuryUser({
    userId: "treasury-user", userRef: "tfulton+master@isheepdog.com",
    key: "treasury-key", secret: "treasury-secret", status: "VERIFIED",
  });
  saveMarketplaceTreasury({ id: "treasury-wallet", name: "ISD Treasury", balanceMinor: 31_600_000 });
  return paymentMethodId;
}

test("Marketplace cash-out pays the requested amount directly from treasury to the linked bank", async () => {
  const paymentMethodId = setupMarketplace();
  const posts = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const authorization = new Headers(init.headers).get("authorization");
    if ((init.method ?? "GET") === "GET" && url.pathname === "/v3/account/wallet") {
      return Response.json({ wallets: authorization?.startsWith("treasury-key")
        ? [{ id: "treasury-wallet", name: "ISD Treasury", balance: 316_000 }]
        : [{ id: "participant-wallet", name: "Owner wallet", balance: 0 }] });
    }
    const body = init.body ? JSON.parse(String(init.body)) : null;
    posts.push({ path: url.pathname, authorization, body });
    if (url.pathname === "/v3/check/digital" && body.account === "treasury-wallet") {
      return Response.json({ id: "payout-check", status: "UNPAID" });
    }
    if (url.pathname === "/v3/check/deposit/payout-check") {
      return Response.json({ id: "payout-check", status: "IN_PROCESS" });
    }
    return Response.json({ message: "Unexpected request" }, { status: 500 });
  };

  const idempotencyKey = randomUUID();
  const result = await createMarketplaceCashOut({
    demoEntityId: "owner1", paymentMethodId, amountMinor: 1_000, idempotencyKey,
  });

  assert.equal(result.walletFunding, null);
  assert.equal(result.walletReversal, null);
  assert.deepEqual(result.bankPayout, { id: "payout-check", status: "IN_PROCESS" });
  assert.equal(result.intent.status, "submitted");
  assert.deepEqual(posts.map((request) => request.body?.amount).filter(Boolean), [10]);
  assert.equal(posts[0].body.account, "treasury-wallet");
  assert.equal(posts[0].body.recipient, "tfulton+owner1@isheepdog.com");
  assert.deepEqual(posts[0].body.deposit_options, ["BANK"]);
  assert.equal(posts[0].authorization, "treasury-key:treasury-secret");
  assert.equal(posts[1].body.account, "participant-bank");

  const postCount = posts.length;
  const replay = await createMarketplaceCashOut({
    demoEntityId: "owner1", paymentMethodId, amountMinor: 1_000, idempotencyKey,
  });
  assert.equal(replay.intent.id, result.intent.id);
  assert.equal(posts.length, postCount, "durable replay must not resubmit either provider leg");
});

test("retry reverses legacy staged funds before submitting the direct bank payout", async () => {
  const paymentMethodId = setupMarketplace();
  const idempotencyKey = randomUUID();
  const intent = findOrCreateMarketplaceCashOut({
    demoEntityId: "owner1", amountMinor: 1_000, paymentMethodId,
    bankId: "participant-bank", idempotencyKey,
  });
  recordMarketplaceCashOutOperation({
    intentId: intent.id, operationType: "wallet_funding",
    externalId: "funding-check", providerStatus: "UNPAID",
  });
  const posts = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const authorization = new Headers(init.headers).get("authorization");
    const method = init.method ?? "GET";
    if (method === "GET" && url.pathname === "/v3/account/wallet") {
      return Response.json({ wallets: authorization?.startsWith("treasury-key")
        ? [{ id: "treasury-wallet", balance: 316_000 }]
        : [{ id: "participant-wallet", balance: 10 }] });
    }
    if (method === "GET" && url.pathname === "/v3/check/funding-check") {
      return Response.json({ id: "funding-check", status: "PAID" });
    }
    const body = init.body ? JSON.parse(String(init.body)) : null;
    posts.push({ path: url.pathname, authorization, body });
    if (url.pathname === "/v3/check/digital" && body.account === "participant-wallet") {
      return Response.json({ id: "reversal-check", status: "UNPAID" });
    }
    if (url.pathname === "/v3/check/deposit/reversal-check") {
      return Response.json({ id: "reversal-check", status: "PAID" });
    }
    if (url.pathname === "/v3/check/digital" && body.account === "treasury-wallet") {
      return Response.json({ id: "payout-check", status: "UNPAID" });
    }
    if (url.pathname === "/v3/check/deposit/payout-check") {
      return Response.json({ id: "payout-check", status: "IN_PROCESS" });
    }
    return Response.json({ message: "Unexpected request" }, { status: 500 });
  };

  const result = await createMarketplaceCashOut({
    demoEntityId: "owner1", paymentMethodId, amountMinor: 1_000, idempotencyKey,
  });

  assert.equal(result.walletFunding.status, "PAID");
  assert.equal(result.walletReversal.status, "PAID");
  assert.equal(result.bankPayout.status, "IN_PROCESS");
  assert.equal(posts.filter((request) => request.path === "/v3/check/digital").length, 2);
  assert.equal(posts[0].body.account, "participant-wallet");
  assert.equal(posts[2].body.account, "treasury-wallet");
});

test("Marketplace status refresh keeps IN_PROCESS reserved and settles only PAID", async () => {
  const paymentMethodId = setupMarketplace();
  const idempotencyKey = randomUUID();
  const cashOut = reserveDemoCashOut({
    demoEntityId: "owner1", providerPath: "checkbook_marketplace",
    amountMinor: 1_000, paymentMethodId, idempotencyKey,
  });
  const intent = findOrCreateMarketplaceCashOut({
    demoEntityId: "owner1", amountMinor: 1_000, paymentMethodId,
    bankId: "participant-bank", idempotencyKey,
  });
  recordMarketplaceCashOutOperation({
    intentId: intent.id, operationType: "wallet_funding",
    externalId: "funding-check", providerStatus: "PAID",
  });
  recordMarketplaceCashOutOperation({
    intentId: intent.id, operationType: "digital_payment",
    externalId: "payout-check", providerStatus: "IN_PROCESS",
  });
  markDemoCashOutSubmitted(cashOut.id, intent.id);

  let providerStatus = "IN_PROCESS";
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(new URL(String(input)).pathname, "/v3/check/payout-check");
    assert.equal(new Headers(init.headers).get("authorization"), "treasury-key:treasury-secret");
    return Response.json({ id: "payout-check", status: providerStatus });
  };

  const processing = await refreshMarketplaceCashOutStatus(cashOut.id);
  assert.equal(processing.normalizedStatus, "processing");
  assert.equal(processing.cashOut.status, "submitted");
  assert.equal(getIsdLedgerBalance("owner1").reservedMinor, 1_000);
  assert.equal(getIsdLedgerBalance("owner1").paidMinor, 0);

  providerStatus = "PAID";
  const settled = await refreshMarketplaceCashOutStatus(cashOut.id);
  assert.equal(settled.normalizedStatus, "succeeded");
  assert.equal(settled.cashOut.status, "succeeded");
  assert.equal(getIsdLedgerBalance("owner1").reservedMinor, 0);
  assert.equal(getIsdLedgerBalance("owner1").paidMinor, 1_000);

  const history = listDemoCashOutsForEntity("owner1").find((entry) => entry.id === cashOut.id);
  assert.equal(history.providerStatus, "PAID");
  assert.equal(history.paymentMethodMask, "0000");
  assert.equal(history.requestedNetwork, "ach");
});

test("Sandbox completion advances the payment with treasury credentials and settles once", async () => {
  const paymentMethodId = setupMarketplace();
  const idempotencyKey = randomUUID();
  const cashOut = reserveDemoCashOut({
    demoEntityId: "owner1", providerPath: "checkbook_marketplace",
    amountMinor: 1_000, paymentMethodId, idempotencyKey,
  });
  const intent = findOrCreateMarketplaceCashOut({
    demoEntityId: "owner1", amountMinor: 1_000, paymentMethodId,
    bankId: "participant-bank", idempotencyKey,
  });
  recordMarketplaceCashOutOperation({
    intentId: intent.id, operationType: "digital_payment",
    externalId: "payout-check", providerStatus: "IN_PROCESS",
  });
  markDemoCashOutSubmitted(cashOut.id, intent.id);

  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({
      path: url.pathname,
      method: init.method ?? "GET",
      authorization: new Headers(init.headers).get("authorization"),
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    if (url.pathname === "/v3/check/webhook/payout-check") {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/v3/check/payout-check") {
      return Response.json({ id: "payout-check", status: "PAID" });
    }
    return Response.json({ message: "Unexpected request" }, { status: 500 });
  };

  const completed = await completeMarketplaceCashOutSandbox(cashOut.id);

  assert.equal(completed.normalizedStatus, "succeeded");
  assert.deepEqual(requests, [
    {
      path: "/v3/check/webhook/payout-check", method: "PUT",
      authorization: "treasury-key:treasury-secret", body: { status: "PAID" },
    },
    {
      path: "/v3/check/payout-check", method: "GET",
      authorization: "treasury-key:treasury-secret", body: null,
    },
  ]);
  assert.equal(getIsdLedgerBalance("owner1").reservedMinor, 0);
  assert.equal(getIsdLedgerBalance("owner1").paidMinor, 1_000);

  const replay = await completeMarketplaceCashOutSandbox(cashOut.id);
  assert.equal(replay.normalizedStatus, "succeeded");
  assert.equal(requests.length, 2, "terminal replay must not call Checkbook again");
  assert.equal(getIsdLedgerBalance("owner1").paidMinor, 1_000);
});
