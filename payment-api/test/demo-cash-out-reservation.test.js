// Characterization tests for demo cash-out reservation (HLD P0-S3).
//
// These capture the *current* behavior of reserveDemoCashOut and the ISD
// ledger without refactoring the repositories. If a future slice changes
// this behavior intentionally, update the assertions here alongside it.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { freshDatabase, createFixturePaymentMethod } from "./support/fixtures.js";
import {
  reserveDemoCashOut,
  releaseDemoCashOut,
  getDemoEntity,
  DemoCashOutError,
} from "../dist/demo-cash-out-repository.js";
import { getIsdLedgerBalance, listIsdLedgerEntries } from "../dist/isd-ledger-repository.js";

let cleanup;

beforeEach(() => {
  cleanup = freshDatabase();
});

afterEach(() => {
  cleanup();
});

test("reserving a cash-out moves available earnings into reserved", () => {
  const before = getDemoEntity("owner1").balance;
  assert.equal(before.availableMinor, 2_500_000);
  assert.equal(before.reservedMinor, 0);

  const cashOut = reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 500_000,
    idempotencyKey: randomUUID(),
  });

  assert.equal(cashOut.status, "reserved");
  assert.equal(cashOut.amountMinor, 500_000);

  const after = getDemoEntity("owner1").balance;
  assert.equal(after.availableMinor, 2_000_000);
  assert.equal(after.reservedMinor, 500_000);

  const balance = getIsdLedgerBalance("owner1");
  assert.equal(balance.availableMinor, 2_000_000);
  assert.equal(balance.reservedMinor, 500_000);
});

test("reservation rejects an amount exceeding available earnings and posts no ledger entries", () => {
  assert.throws(
    () =>
      reserveDemoCashOut({
        demoEntityId: "owner1",
        providerPath: "plaid_transfer",
        amountMinor: 2_500_001,
        idempotencyKey: randomUUID(),
      }),
    (error) => error instanceof DemoCashOutError && error.code === "INSUFFICIENT_DEMO_BALANCE",
  );

  const balance = getIsdLedgerBalance("owner1");
  assert.equal(balance.availableMinor, 2_500_000);
  assert.equal(balance.reservedMinor, 0);
  assert.deepEqual(listIsdLedgerEntries("owner1"), []);
});

test("reservation rejects a zero or negative amount", () => {
  for (const amountMinor of [0, -1]) {
    assert.throws(
      () =>
        reserveDemoCashOut({
          demoEntityId: "owner1",
          providerPath: "plaid_transfer",
          amountMinor,
          idempotencyKey: randomUUID(),
        }),
      (error) => error instanceof DemoCashOutError && error.code === "INVALID_AMOUNT",
    );
  }
});

test("reservation rejects an unknown demo entity", () => {
  assert.throws(
    () =>
      reserveDemoCashOut({
        demoEntityId: "not-a-real-entity",
        providerPath: "plaid_transfer",
        amountMinor: 1_000,
        idempotencyKey: randomUUID(),
      }),
    (error) => error instanceof DemoCashOutError && error.code === "DEMO_ENTITY_NOT_FOUND",
  );
});

test("replaying the same idempotency key returns the original cash-out without reserving twice", () => {
  const idempotencyKey = randomUUID();
  const first = reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 500_000,
    idempotencyKey,
  });

  const second = reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 500_000,
    idempotencyKey,
  });

  assert.equal(second.id, first.id);

  const balance = getIsdLedgerBalance("owner1");
  assert.equal(balance.availableMinor, 2_000_000);
  assert.equal(balance.reservedMinor, 500_000);
});

test("reusing an idempotency key with different payment details is a conflict", () => {
  const idempotencyKey = randomUUID();
  reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 500_000,
    idempotencyKey,
  });

  assert.throws(
    () =>
      reserveDemoCashOut({
        demoEntityId: "owner1",
        providerPath: "plaid_transfer",
        amountMinor: 750_000,
        idempotencyKey,
      }),
    (error) => error instanceof DemoCashOutError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("releasing a reserved cash-out restores available earnings and marks it failed", () => {
  const cashOut = reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 500_000,
    idempotencyKey: randomUUID(),
  });

  const released = releaseDemoCashOut(cashOut.id);

  assert.equal(released.status, "failed");

  const balance = getIsdLedgerBalance("owner1");
  assert.equal(balance.availableMinor, 2_500_000);
  assert.equal(balance.reservedMinor, 0);
});

test("releasing an already-released cash-out is a no-op and does not double-credit", () => {
  const cashOut = reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 500_000,
    idempotencyKey: randomUUID(),
  });

  releaseDemoCashOut(cashOut.id);
  const second = releaseDemoCashOut(cashOut.id);

  assert.equal(second.status, "failed");

  const balance = getIsdLedgerBalance("owner1");
  assert.equal(balance.availableMinor, 2_500_000);
  assert.equal(balance.reservedMinor, 0);
});

test("reservation records a payment-method snapshot on the ledger entry when provided", () => {
  const paymentMethodId = createFixturePaymentMethod("owner1");
  reserveDemoCashOut({
    demoEntityId: "owner1",
    providerPath: "plaid_transfer",
    amountMinor: 500_000,
    idempotencyKey: randomUUID(),
    paymentMethodId,
  });

  const entries = listIsdLedgerEntries("owner1");
  const reservedEntry = entries.find((entry) => entry.bucket === "reserved");
  assert.ok(reservedEntry);
  assert.equal(reservedEntry.paymentMethodId, paymentMethodId);
  assert.equal(reservedEntry.paymentMethodProvider, "plaid");
  assert.match(reservedEntry.paymentMethodLabel ?? "", /Fixture Test Bank/);
});
