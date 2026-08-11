import { getDatabase } from "./database.js";
import {
  addIsdLedgerAdjustment,
  getExpectedMarketplaceWalletBalance,
  listIsdLedgerEntries,
  recordIsdLedgerEntry,
  type IsdLedgerEntry,
} from "./isd-ledger-repository.js";
import { randomUUID } from "node:crypto";

export interface MarketplaceParticipant {
  readonly demoEntityId: string;
  readonly checkbookUserId: string;
  readonly checkbookUserRef: string;
  readonly status: string;
  readonly wallet: null | {
    readonly id: string;
    readonly name: string | null;
    readonly providerBalanceMinor: number | null;
    readonly lastSyncedAt: string | null;
  };
  readonly attachedPaymentMethod: null | {
    readonly id: string;
    readonly checkbookBankId: string;
    readonly label: string;
    readonly mask: string | null;
    readonly status: string;
  };
}

export type MarketplaceLedgerEntry = IsdLedgerEntry;

export interface MarketplaceTreasury {
  readonly id: string;
  readonly name: string | null;
  readonly providerBalanceMinor: number | null;
  readonly lastSyncedAt: string | null;
}

export interface MarketplaceTreasuryUser {
  readonly checkbookUserId: string;
  readonly checkbookUserRef: string;
  readonly status: string;
}

export interface MarketplaceWalletSyncIntent {
  readonly id: string;
  readonly amountMinor: number;
  readonly status: string;
  readonly externalId: string | null;
  readonly providerStatus: string | null;
}

export interface MarketplaceCashOutOperation {
  readonly externalId: string;
  readonly providerStatus: string;
}

export interface MarketplaceCashOutIntent {
  readonly id: string;
  readonly demoEntityId: string;
  readonly amountMinor: number;
  readonly paymentMethodId: string;
  readonly bankId: string;
  readonly status: string;
  readonly idempotencyKey: string;
  readonly walletFunding: MarketplaceCashOutOperation | null;
  readonly walletReversal: MarketplaceCashOutOperation | null;
  readonly bankPayout: MarketplaceCashOutOperation | null;
}

interface ParticipantRow {
  demo_entity_id: string;
  checkbook_user_id: string;
  checkbook_user_ref: string;
  checkbook_publishable_key: string;
  checkbook_api_secret: string;
  status: string;
  wallet_id: string | null;
  wallet_name: string | null;
  provider_balance_minor: number | null;
  last_synced_at: string | null;
  payment_method_id: string | null;
  checkbook_bank_id: string | null;
  payment_method_status: string | null;
  institution_name: string | null;
  account_name: string | null;
  mask: string | null;
}

const participantQuery = `
  SELECT p.*,
    w.checkbook_wallet_id AS wallet_id, w.name AS wallet_name,
    w.provider_balance_minor, w.last_synced_at,
    m.payment_method_id, m.checkbook_bank_id,
    m.status AS payment_method_status,
    i.institution_name, pm.name AS account_name, pm.mask
  FROM marketplace_participants p
  LEFT JOIN marketplace_wallets w ON w.demo_entity_id = p.demo_entity_id
  LEFT JOIN marketplace_payment_methods m ON m.demo_entity_id = p.demo_entity_id
  LEFT JOIN payment_methods pm ON pm.id = m.payment_method_id
  LEFT JOIN plaid_items i ON i.id = pm.plaid_item_id
`;

export function getMarketplaceParticipant(id: string): MarketplaceParticipant | null {
  const row = getDatabase("sandbox")
    .prepare(`${participantQuery} WHERE p.demo_entity_id = ?`)
    .get(id) as ParticipantRow | undefined;
  return row ? toParticipant(row) : null;
}

export function getMarketplaceCredentials(id: string): { key: string; secret: string } | null {
  const row = getDatabase("sandbox")
    .prepare("SELECT checkbook_publishable_key AS key, checkbook_api_secret AS secret FROM marketplace_participants WHERE demo_entity_id = ?")
    .get(id) as { key: string; secret: string } | undefined;
  return row ?? null;
}

export function saveMarketplaceParticipant(input: {
  demoEntityId: string; userId: string; userRef: string; key: string; secret: string; status: string;
}): void {
  const now = new Date().toISOString();
  getDatabase("sandbox").prepare(`
    INSERT INTO marketplace_participants (
      demo_entity_id, checkbook_user_id, checkbook_user_ref,
      checkbook_publishable_key, checkbook_api_secret, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.demoEntityId, input.userId, input.userRef, input.key, input.secret, input.status, now, now);
}

export function updateMarketplaceParticipantStatus(demoEntityId: string, status: string): void {
  getDatabase("sandbox").prepare(
    "UPDATE marketplace_participants SET status = ?, updated_at = ? WHERE demo_entity_id = ?",
  ).run(status, new Date().toISOString(), demoEntityId);
}

export function getMarketplaceTreasury(): MarketplaceTreasury | null {
  const row = getDatabase("sandbox").prepare(
    "SELECT checkbook_wallet_id AS id, name, provider_balance_minor, last_synced_at FROM marketplace_treasury_wallets ORDER BY created_at LIMIT 1",
  ).get() as { id: string; name: string | null; provider_balance_minor: number | null; last_synced_at: string | null } | undefined;
  return row ? { id: row.id, name: row.name, providerBalanceMinor: row.provider_balance_minor, lastSyncedAt: row.last_synced_at } : null;
}

export function getMarketplaceTreasuryUser(): MarketplaceTreasuryUser | null {
  const row = getDatabase("sandbox").prepare(`
    SELECT checkbook_user_id, checkbook_user_ref, status
    FROM marketplace_treasury_users WHERE id = 'primary'
  `).get() as { checkbook_user_id: string; checkbook_user_ref: string; status: string } | undefined;
  return row ? {
    checkbookUserId: row.checkbook_user_id,
    checkbookUserRef: row.checkbook_user_ref,
    status: row.status,
  } : null;
}

export function getMarketplaceTreasuryCredentials(): { key: string; secret: string } | null {
  const row = getDatabase("sandbox").prepare(`
    SELECT checkbook_publishable_key AS key, checkbook_api_secret AS secret
    FROM marketplace_treasury_users WHERE id = 'primary'
  `).get() as { key: string; secret: string } | undefined;
  return row ?? null;
}

export function saveMarketplaceTreasuryUser(input: {
  userId: string; userRef: string; key: string; secret: string; status: string;
}): void {
  const now = new Date().toISOString();
  getDatabase("sandbox").prepare(`
    INSERT INTO marketplace_treasury_users (
      id, checkbook_user_id, checkbook_user_ref, checkbook_publishable_key,
      checkbook_api_secret, status, created_at, updated_at
    ) VALUES ('primary', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      checkbook_user_id = excluded.checkbook_user_id,
      checkbook_user_ref = excluded.checkbook_user_ref,
      checkbook_publishable_key = excluded.checkbook_publishable_key,
      checkbook_api_secret = excluded.checkbook_api_secret,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(input.userId, input.userRef, input.key, input.secret, input.status, now, now);
}

export function saveMarketplaceTreasury(input: { id: string; name: string | null; balanceMinor: number | null }): void {
  const now = new Date().toISOString();
  getDatabase("sandbox").prepare(`
    INSERT INTO marketplace_treasury_wallets (
      id, checkbook_wallet_id, name, provider_balance_minor, last_synced_at, created_at, updated_at
    ) VALUES ('primary', ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      checkbook_wallet_id = excluded.checkbook_wallet_id, name = excluded.name,
      provider_balance_minor = excluded.provider_balance_minor,
      last_synced_at = excluded.last_synced_at, updated_at = excluded.updated_at
  `).run(input.id, input.name, input.balanceMinor, now, now, now);
}

export function saveMarketplaceWallet(input: {
  demoEntityId: string; id: string; name: string | null; balanceMinor: number | null;
}): void {
  const now = new Date().toISOString();
  getDatabase("sandbox").prepare(`
    INSERT INTO marketplace_wallets (
      demo_entity_id, checkbook_wallet_id, name, provider_balance_minor,
      last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (demo_entity_id) DO UPDATE SET
      checkbook_wallet_id = excluded.checkbook_wallet_id,
      name = excluded.name,
      provider_balance_minor = excluded.provider_balance_minor,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).run(input.demoEntityId, input.id, input.name, input.balanceMinor, now, now, now);
}

export function saveMarketplacePaymentMethod(input: {
  demoEntityId: string; paymentMethodId: string; bankId: string; status: string;
}): void {
  const now = new Date().toISOString();
  getDatabase("sandbox").prepare(`
    INSERT INTO marketplace_payment_methods (
      demo_entity_id, payment_method_id, checkbook_bank_id, status, attached_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (demo_entity_id) DO UPDATE SET
      payment_method_id = excluded.payment_method_id,
      checkbook_bank_id = excluded.checkbook_bank_id,
      status = excluded.status,
      attached_at = excluded.attached_at,
      updated_at = excluded.updated_at
  `).run(input.demoEntityId, input.paymentMethodId, input.bankId, input.status, now, now);
}

export function findOrCreateMarketplaceWalletSync(input: {
  demoEntityId: string; walletId: string; amountMinor: number; idempotencyKey: string;
}): MarketplaceWalletSyncIntent {
  const database = getDatabase("sandbox");
  const existing = findMarketplaceWalletSync(input.idempotencyKey);
  if (existing) {
    if (existing.amountMinor !== input.amountMinor) throw new Error("Idempotency key was already used for another wallet sync");
    return existing;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO payment_intents (
      id, test_user_id, movement_type, provider_path, amount_minor, currency,
      payment_method_id, counterparty_type, counterparty_ref, status,
      idempotency_key, created_at, updated_at
    ) VALUES (?, ?, 'internal_transfer', 'checkbook_marketplace', ?, 'USD',
      NULL, 'marketplace_wallet', ?, 'ready', ?, ?, ?)
  `).run(id, input.demoEntityId, input.amountMinor, input.walletId, input.idempotencyKey, now, now);
  return findMarketplaceWalletSync(input.idempotencyKey)!;
}

export function completeMarketplaceWalletSync(input: {
  intentId: string; demoEntityId: string; amountMinor: number;
  externalId: string; providerStatus: string;
}): MarketplaceWalletSyncIntent {
  const database = getDatabase("sandbox");
  const complete = database.transaction(() => {
    const now = new Date().toISOString();
    const operationId = randomUUID();
    database.prepare(`
      INSERT INTO provider_operations (
        id, payment_intent_id, provider, operation_type, external_id,
        provider_status, created_at, updated_at
      ) VALUES (?, ?, 'checkbook', 'wallet_funding', ?, ?, ?, ?)
      ON CONFLICT (provider, external_id) DO UPDATE SET
        provider_status = excluded.provider_status, updated_at = excluded.updated_at
    `).run(operationId, input.intentId, input.externalId, input.providerStatus, now, now);
    const operation = database.prepare(
      "SELECT id FROM provider_operations WHERE provider = 'checkbook' AND external_id = ?",
    ).get(input.externalId) as { id: string };
    database.prepare(
      "UPDATE payment_intents SET status = 'succeeded', updated_at = ? WHERE id = ?",
    ).run(now, input.intentId);
    const alreadyRecorded = database.prepare(
      "SELECT 1 FROM isd_ledger_entries WHERE provider_operation_id = ? AND entry_type = 'wallet_funded'",
    ).get(operation.id);
    if (!alreadyRecorded) recordIsdLedgerEntry({
      demoEntityId: input.demoEntityId, bucket: "manifestation",
      amountMinor: input.amountMinor, entryType: "wallet_funded",
      reason: "ISD balance manifested in Checkbook wallet",
      providerPath: "checkbook_marketplace", providerOperationId: operation.id,
      createdAt: now,
    });
  });
  complete.immediate();
  return findMarketplaceWalletSyncById(input.intentId)!;
}

export function recordMarketplaceWalletSyncOperation(input: {
  intentId: string; externalId: string; providerStatus: string;
}): MarketplaceWalletSyncIntent {
  const database = getDatabase("sandbox");
  const now = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`
      INSERT INTO provider_operations (
        id, payment_intent_id, provider, operation_type, external_id,
        provider_status, created_at, updated_at
      ) VALUES (?, ?, 'checkbook', 'wallet_funding', ?, ?, ?, ?)
      ON CONFLICT (provider, external_id) DO UPDATE SET
        provider_status = excluded.provider_status, updated_at = excluded.updated_at
    `).run(randomUUID(), input.intentId, input.externalId, input.providerStatus, now, now);
    database.prepare(
      "UPDATE payment_intents SET status = 'submitted', updated_at = ? WHERE id = ? AND status <> 'succeeded'",
    ).run(now, input.intentId);
  })();
  return findMarketplaceWalletSyncById(input.intentId)!;
}

export function findOrCreateMarketplaceCashOut(input: {
  demoEntityId: string;
  amountMinor: number;
  paymentMethodId: string;
  bankId: string;
  idempotencyKey: string;
}): MarketplaceCashOutIntent {
  const existing = findMarketplaceCashOutByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (
      existing.demoEntityId !== input.demoEntityId ||
      existing.amountMinor !== input.amountMinor ||
      existing.paymentMethodId !== input.paymentMethodId ||
      existing.bankId !== input.bankId
    ) throw new Error("Idempotency key was already used for another Marketplace cash-out");
    return existing;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  getDatabase("sandbox").prepare(`
    INSERT INTO payment_intents (
      id, test_user_id, movement_type, provider_path, amount_minor, currency,
      payment_method_id, counterparty_type, counterparty_ref, status,
      idempotency_key, requested_network, created_at, updated_at
    ) VALUES (?, ?, 'external_credit', 'checkbook_marketplace', ?, 'USD',
      ?, 'bank', ?, 'ready', ?, 'ach', ?, ?)
  `).run(
    id, input.demoEntityId, input.amountMinor, input.paymentMethodId,
    input.bankId, input.idempotencyKey, now, now,
  );
  return findMarketplaceCashOutById(id)!;
}

export function getMarketplaceCashOutByIdempotencyKey(idempotencyKey: string): MarketplaceCashOutIntent | null {
  return findMarketplaceCashOutByIdempotencyKey(idempotencyKey);
}

export function recordMarketplaceCashOutOperation(input: {
  intentId: string;
  operationType: "wallet_funding" | "wallet_reversal" | "digital_payment";
  externalId: string;
  providerStatus: string;
}): MarketplaceCashOutIntent {
  const database = getDatabase("sandbox");
  const now = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`
      INSERT INTO provider_operations (
        id, payment_intent_id, provider, operation_type, external_id,
        provider_status, created_at, updated_at
      ) VALUES (?, ?, 'checkbook', ?, ?, ?, ?, ?)
      ON CONFLICT (provider, external_id) DO UPDATE SET
        provider_status = excluded.provider_status,
        updated_at = excluded.updated_at
    `).run(
      randomUUID(), input.intentId, input.operationType, input.externalId,
      input.providerStatus, now, now,
    );
    database.prepare(`
      UPDATE payment_intents
      SET status = CASE WHEN ? = 'digital_payment' THEN 'submitted' ELSE status END,
          updated_at = ?
      WHERE id = ?
    `).run(input.operationType, now, input.intentId);
  })();
  return findMarketplaceCashOutById(input.intentId)!;
}

export function updateMarketplaceCashOutIntentStatus(
  intentId: string,
  status: "submitted" | "processing" | "action_required",
): MarketplaceCashOutIntent {
  getDatabase("sandbox").prepare(
    "UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?",
  ).run(status, new Date().toISOString(), intentId);
  return findMarketplaceCashOutById(intentId)!;
}

export function addMarketplaceAdjustment(input: {
  demoEntityId: string; amountMinor: number; reason: string;
}): MarketplaceLedgerEntry {
  return addIsdLedgerAdjustment(input);
}

export function listMarketplaceLedger(demoEntityId: string): MarketplaceLedgerEntry[] {
  return listIsdLedgerEntries(demoEntityId);
}

export function marketplaceLedgerBalance(demoEntityId: string): number {
  return getExpectedMarketplaceWalletBalance(demoEntityId);
}

function toParticipant(row: ParticipantRow): MarketplaceParticipant {
  return {
    demoEntityId: row.demo_entity_id, checkbookUserId: row.checkbook_user_id,
    checkbookUserRef: row.checkbook_user_ref, status: row.status,
    wallet: row.wallet_id ? { id: row.wallet_id, name: row.wallet_name, providerBalanceMinor: row.provider_balance_minor, lastSyncedAt: row.last_synced_at } : null,
    attachedPaymentMethod: row.payment_method_id && row.checkbook_bank_id ? {
      id: row.payment_method_id, checkbookBankId: row.checkbook_bank_id,
      label: [row.institution_name, row.account_name].filter(Boolean).join(" · "),
      mask: row.mask, status: row.payment_method_status ?? "unknown",
    } : null,
  };
}

function findMarketplaceWalletSync(idempotencyKey: string): MarketplaceWalletSyncIntent | null {
  return findMarketplaceWalletSyncWhere("intent.idempotency_key = ?", idempotencyKey);
}

function findMarketplaceWalletSyncById(id: string): MarketplaceWalletSyncIntent | null {
  return findMarketplaceWalletSyncWhere("intent.id = ?", id);
}

function findMarketplaceWalletSyncWhere(where: string, value: string): MarketplaceWalletSyncIntent | null {
  const row = getDatabase("sandbox").prepare(`
    SELECT intent.id, intent.amount_minor, intent.status,
      operation.external_id, operation.provider_status
    FROM payment_intents intent
    LEFT JOIN provider_operations operation ON operation.payment_intent_id = intent.id
    WHERE ${where} AND intent.provider_path = 'checkbook_marketplace'
  `).get(value) as { id: string; amount_minor: number; status: string; external_id: string | null; provider_status: string | null } | undefined;
  return row ? { id: row.id, amountMinor: row.amount_minor, status: row.status, externalId: row.external_id, providerStatus: row.provider_status } : null;
}

function findMarketplaceCashOutByIdempotencyKey(idempotencyKey: string): MarketplaceCashOutIntent | null {
  return findMarketplaceCashOutWhere("intent.idempotency_key = ?", idempotencyKey);
}

function findMarketplaceCashOutById(id: string): MarketplaceCashOutIntent | null {
  return findMarketplaceCashOutWhere("intent.id = ?", id);
}

function findMarketplaceCashOutWhere(where: string, value: string): MarketplaceCashOutIntent | null {
  const row = getDatabase("sandbox").prepare(`
    SELECT intent.id, intent.test_user_id, intent.amount_minor,
      intent.payment_method_id, intent.counterparty_ref, intent.status,
      intent.idempotency_key,
      funding.external_id AS funding_external_id,
      funding.provider_status AS funding_provider_status,
      reversal.external_id AS reversal_external_id,
      reversal.provider_status AS reversal_provider_status,
      payout.external_id AS payout_external_id,
      payout.provider_status AS payout_provider_status
    FROM payment_intents intent
    LEFT JOIN provider_operations funding
      ON funding.payment_intent_id = intent.id
      AND funding.operation_type = 'wallet_funding'
    LEFT JOIN provider_operations payout
      ON payout.payment_intent_id = intent.id
      AND payout.operation_type = 'digital_payment'
    LEFT JOIN provider_operations reversal
      ON reversal.payment_intent_id = intent.id
      AND reversal.operation_type = 'wallet_reversal'
    WHERE ${where}
      AND intent.provider_path = 'checkbook_marketplace'
      AND intent.movement_type = 'external_credit'
  `).get(value) as {
    id: string; test_user_id: string; amount_minor: number;
    payment_method_id: string; counterparty_ref: string; status: string;
    idempotency_key: string; funding_external_id: string | null;
    funding_provider_status: string | null; reversal_external_id: string | null;
    reversal_provider_status: string | null; payout_external_id: string | null;
    payout_provider_status: string | null;
  } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    demoEntityId: row.test_user_id,
    amountMinor: row.amount_minor,
    paymentMethodId: row.payment_method_id,
    bankId: row.counterparty_ref,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    walletFunding: row.funding_external_id && row.funding_provider_status
      ? { externalId: row.funding_external_id, providerStatus: row.funding_provider_status }
      : null,
    walletReversal: row.reversal_external_id && row.reversal_provider_status
      ? { externalId: row.reversal_external_id, providerStatus: row.reversal_provider_status }
      : null,
    bankPayout: row.payout_external_id && row.payout_provider_status
      ? { externalId: row.payout_external_id, providerStatus: row.payout_provider_status }
      : null,
  };
}
