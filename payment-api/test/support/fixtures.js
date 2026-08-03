// Shared test support for payment-api characterization tests.
//
// These tests import the *built* dist output (the same artifact payment-ui
// consumes) rather than TypeScript sources, so no test-only compiler step is
// needed. Run `npm run build:packages` before `npm test`.
//
// Each test gets its own throwaway SQLite file under the OS temp directory
// via `freshDatabase()`, so tests never touch the operator's real
// data/payment-test.sqlite and can run in any order without shared state.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { getDatabase, resetDatabaseForTests } from "../../dist/database.js";
import { savePlaidPaymentMethod } from "../../dist/payment-method-repository.js";

const activeTempDirs = new Set();

/**
 * Point the payment-api database singleton at a brand-new temporary SQLite
 * file and run migrations against it. Returns a `cleanup()` function that
 * must be called (e.g. from an `afterEach`) to remove the temp directory.
 */
export function freshDatabase() {
  const tempDir = mkdtempSync(join(tmpdir(), "payment-test-db-"));
  activeTempDirs.add(tempDir);
  resetDatabaseForTests(join(tempDir, "test.sqlite"));
  // Force the connection open (and migrations to run) immediately so test
  // setup failures surface before the test body runs.
  getDatabase("sandbox");

  return function cleanup() {
    activeTempDirs.delete(tempDir);
    rmSync(tempDir, { recursive: true, force: true });
  };
}

/** Safety net in case a test forgets to call its cleanup function. */
export function cleanupAllTempDatabases() {
  for (const tempDir of activeTempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  activeTempDirs.clear();
}

/**
 * Create a fixture Plaid-linked payment method for a demo entity, mirroring
 * what `completePlaidPaymentMethod` persists after a real Sandbox Link
 * exchange, without calling Plaid. Returns the stored payment method's id.
 */
export function createFixturePaymentMethod(clientUserId, overrides = {}) {
  const unique = randomUUID().slice(0, 8);
  const method = savePlaidPaymentMethod({
    environment: "sandbox",
    clientUserId,
    plaidItemId: overrides.plaidItemId ?? `fixture-item-${unique}`,
    accessToken: overrides.accessToken ?? `fixture-access-token-${unique}`,
    institutionId: overrides.institutionId ?? "ins_fixture",
    institutionName: overrides.institutionName ?? "Fixture Test Bank",
    account: {
      id: overrides.accountId ?? `fixture-account-${unique}`,
      name: overrides.accountName ?? "Fixture Checking",
      officialName: null,
      mask: overrides.mask ?? "0000",
      type: "depository",
      subtype: "checking",
      verificationStatus: null,
      canTransferIn: true,
      canTransferOut: true,
    },
  });

  return method.id;
}
