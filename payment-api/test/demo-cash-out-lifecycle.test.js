// Characterization tests for the submit -> settle lifecycle across the two
// live provider paths (HLD P0-S3). These exercise the same repository calls
// the Plaid Transfer and Checkbook Standard flows make, without performing
// any real network call to Plaid or Checkbook.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { freshDatabase, createFixturePaymentMethod } from "./support/fixtures.js";
import {
  reserveDemoCashOut,
  markDemoCashOutSubmitted,
  settleDemoCashOut,
  DemoCashOutError,
} from "../dist/demo-cash-out-repository.js";
import { getIsdLedgerBalance, listIsdLedgerEntries } from "../dist/isd-ledger-repository.js";
import {
  findOrCreatePlaidTransferIntent,
  recordPlaidTransferOperation,
} from "../dist/plaid-transfer-repository.js";
import {
  findOrCreateCheckbookPaymentIntent,
  recordCheckbookPaymentOperation,
} from "../dist/payment-repository.js";

let cleanup;

beforeEach(() => {
  cleanup = freshDatabase();
});

afterEach(() => {
  cleanup();
});

/** Reserve, then walk a demo cash-out through the Plaid Transfer submission path. */
function submitPlaidTransfer({ demoEntityId, amountMinor, transferId, providerStatus }) {
  const paymentMethodId = createFixturePaymentMethod(demoEntityId);
  const cashOut = reserveDemoCashOut({
    demoEntityId,
    providerPath: "plaid_transfer",
    amountMinor,
    idempotencyKey: randomUUID(),
    paymentMethodId,
  });

  const intent = findOrCreatePlaidTransferIntent({
    testUserId: demoEntityId,
    direction: "receive",
    amountMinor,
    paymentMethodId,
    legalName: "Fixture Legal Name",
    accountHolderType: "personal",
    network: "ach",
    idempotencyKey: cashOut.idempotencyKey,
  });

  markDemoCashOutSubmitted(cashOut.id, intent.id);
  recordPlaidTransferOperation({
    paymentIntentId: intent.id,
    transferId,
    providerStatus,
    effectiveNetwork: "ach",
    requestId: `req-${transferId}`,
  });

  return cashOut;
}

/** Reserve, then walk a demo cash-out through the Checkbook Standard submission path. */
function submitCheckbookStandard({ demoEntityId, amountMinor, externalId, providerStatus }) {
  const paymentMethodId = createFixturePaymentMethod(demoEntityId);
  const cashOut = reserveDemoCashOut({
    demoEntityId,
    providerPath: "checkbook_standard",
    amountMinor,
    idempotencyKey: randomUUID(),
    paymentMethodId,
  });

  const intent = findOrCreateCheckbookPaymentIntent({
    testUserId: demoEntityId,
    amountMinor,
    paymentMethodId,
    recipient: "fixture@example.com",
    idempotencyKey: cashOut.idempotencyKey,
  });

  markDemoCashOutSubmitted(cashOut.id, intent.id);
  recordCheckbookPaymentOperation({
    paymentIntentId: intent.id,
    externalId,
    providerStatus,
  });

  return cashOut;
}

test("a settled Plaid Transfer cash-out moves reserved earnings to paid", () => {
  const cashOut = submitPlaidTransfer({
    demoEntityId: "owner1",
    amountMinor: 500_000,
    transferId: "sandbox-transfer-1",
    providerStatus: "pending",
  });

  const settled = settleDemoCashOut({
    id: cashOut.id,
    providerExternalId: "sandbox-transfer-1",
    providerStatus: "settled",
  });

  assert.equal(settled.status, "succeeded");

  const balance = getIsdLedgerBalance("owner1");
  assert.equal(balance.availableMinor, 2_000_000);
  assert.equal(balance.reservedMinor, 0);
  assert.equal(balance.paidMinor, 500_000);
});

test("a settled Checkbook Standard cash-out moves reserved earnings to paid", () => {
  const cashOut = submitCheckbookStandard({
    demoEntityId: "broker1",
    amountMinor: 1_000_000,
    externalId: "sandbox-checkbook-1",
    providerStatus: "UNPAID",
  });

  const settled = settleDemoCashOut({
    id: cashOut.id,
    providerExternalId: "sandbox-checkbook-1",
    providerStatus: "PAID",
  });

  assert.equal(settled.status, "succeeded");

  const balance = getIsdLedgerBalance("broker1");
  assert.equal(balance.availableMinor, 6_500_000);
  assert.equal(balance.reservedMinor, 0);
  assert.equal(balance.paidMinor, 1_000_000);
});

test("repeating settlement on an already-succeeded cash-out does not double-post the ledger", () => {
  const cashOut = submitPlaidTransfer({
    demoEntityId: "owner2",
    amountMinor: 300_000,
    transferId: "sandbox-transfer-2",
    providerStatus: "pending",
  });

  settleDemoCashOut({
    id: cashOut.id,
    providerExternalId: "sandbox-transfer-2",
    providerStatus: "settled",
  });
  const entriesAfterFirstSettle = listIsdLedgerEntries("owner2").length;

  const secondAttempt = settleDemoCashOut({
    id: cashOut.id,
    providerExternalId: "sandbox-transfer-2",
    providerStatus: "settled",
  });

  assert.equal(secondAttempt.status, "succeeded");
  assert.equal(listIsdLedgerEntries("owner2").length, entriesAfterFirstSettle);

  const balance = getIsdLedgerBalance("owner2");
  assert.equal(balance.paidMinor, 300_000);
  assert.equal(balance.reservedMinor, 0);
});

test("settlement cannot be applied to a cash-out that was never submitted", () => {
  const cashOut = reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 100_000,
    idempotencyKey: randomUUID(),
  });

  assert.throws(
    () =>
      settleDemoCashOut({
        id: cashOut.id,
        providerExternalId: "does-not-exist",
        providerStatus: "settled",
      }),
    (error) => error instanceof DemoCashOutError && error.code === "INVALID_CASH_OUT_STATUS",
  );
});

test("settlement rejects a provider operation reference that does not match", () => {
  const cashOut = submitPlaidTransfer({
    demoEntityId: "owner1",
    amountMinor: 100_000,
    transferId: "sandbox-transfer-3",
    providerStatus: "pending",
  });

  assert.throws(
    () =>
      settleDemoCashOut({
        id: cashOut.id,
        providerExternalId: "a-different-transfer-id",
        providerStatus: "settled",
      }),
    (error) => error instanceof DemoCashOutError && error.code === "PROVIDER_OPERATION_MISMATCH",
  );

  // The reservation must remain untouched by the rejected settlement attempt.
  const balance = getIsdLedgerBalance("owner1");
  assert.equal(balance.reservedMinor, 100_000);
  assert.equal(balance.paidMinor, 0);
});

test("ledger buckets stay balanced against the original seed across a full lifecycle", () => {
  const seedAvailableMinor = 2_500_000; // owner1's seeded earnings
  const amountMinor = 750_000;

  const cashOut = submitPlaidTransfer({
    demoEntityId: "owner1",
    amountMinor,
    transferId: "sandbox-transfer-4",
    providerStatus: "pending",
  });
  settleDemoCashOut({
    id: cashOut.id,
    providerExternalId: "sandbox-transfer-4",
    providerStatus: "settled",
  });

  const balance = getIsdLedgerBalance("owner1");
  const totalMinor = balance.availableMinor + balance.reservedMinor + balance.paidMinor;
  assert.equal(totalMinor, seedAvailableMinor);
  assert.equal(balance.availableMinor, seedAvailableMinor - amountMinor);
  assert.equal(balance.paidMinor, amountMinor);
});
