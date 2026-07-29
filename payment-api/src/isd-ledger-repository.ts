import { randomUUID } from "node:crypto";

import { getDatabase } from "./database.js";
import { findStoredPlaidPaymentMethod } from "./payment-method-repository.js";

export type IsdLedgerBucket = "available" | "reserved" | "paid" | "fees" | "manifestation";

export interface IsdLedgerEntry {
  readonly id: string;
  readonly bucket: IsdLedgerBucket;
  readonly entryType: string;
  readonly amountMinor: number;
  readonly reason: string;
  readonly cashOutId: string | null;
  readonly providerPath: string | null;
  readonly providerOperationId: string | null;
  readonly paymentMethodId: string | null;
  readonly paymentMethodProvider: string | null;
  readonly paymentMethodLabel: string | null;
  readonly paymentMethodMask: string | null;
  readonly createdAt: string;
}

export interface IsdLedgerBalance {
  readonly availableMinor: number;
  readonly reservedMinor: number;
  readonly paidMinor: number;
  readonly feesMinor: number;
}

interface LedgerRow {
  id: string; bucket: IsdLedgerBucket; entry_type: string; amount_minor: number;
  reason: string; cash_out_id: string | null; provider_path: string | null;
  provider_operation_id: string | null; payment_method_id: string | null;
  payment_method_provider: string | null; payment_method_label: string | null;
  payment_method_mask: string | null; created_at: string;
}

export function getIsdLedgerBalance(demoEntityId: string): IsdLedgerBalance {
  const row = getDatabase("sandbox").prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN bucket = 'available' THEN amount_minor ELSE 0 END), 0) AS available_minor,
      COALESCE(SUM(CASE WHEN bucket = 'reserved' THEN amount_minor ELSE 0 END), 0) AS reserved_minor,
      COALESCE(SUM(CASE WHEN bucket = 'paid' THEN amount_minor ELSE 0 END), 0) AS paid_minor,
      COALESCE(SUM(CASE WHEN bucket = 'fees' THEN amount_minor ELSE 0 END), 0) AS fees_minor
    FROM isd_ledger_entries WHERE demo_entity_id = ?
  `).get(demoEntityId) as Record<string, number>;
  return { availableMinor: row.available_minor!, reservedMinor: row.reserved_minor!, paidMinor: row.paid_minor!, feesMinor: row.fees_minor! };
}

export function getExpectedMarketplaceWalletBalance(demoEntityId: string): number {
  const balance = getIsdLedgerBalance(demoEntityId);
  return balance.availableMinor + balance.reservedMinor;
}

export function listIsdLedgerEntries(demoEntityId: string): IsdLedgerEntry[] {
  const rows = getDatabase("sandbox").prepare(`
    SELECT * FROM isd_ledger_entries
    WHERE demo_entity_id = ? ORDER BY created_at DESC, id DESC
  `).all(demoEntityId) as LedgerRow[];
  return rows.map((row) => ({
    id: row.id, bucket: row.bucket, entryType: row.entry_type,
    amountMinor: row.amount_minor, reason: row.reason, cashOutId: row.cash_out_id,
    providerPath: row.provider_path, providerOperationId: row.provider_operation_id,
    paymentMethodId: row.payment_method_id,
    paymentMethodProvider: row.payment_method_provider,
    paymentMethodLabel: row.payment_method_label,
    paymentMethodMask: row.payment_method_mask, createdAt: row.created_at,
  }));
}

export function recordIsdLedgerEntry(input: {
  demoEntityId: string; bucket: IsdLedgerBucket; amountMinor: number;
  entryType: string; reason: string; cashOutId?: string; providerPath?: string;
  providerOperationId?: string; paymentMethodId?: string; createdAt?: string;
}): IsdLedgerEntry {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor === 0) throw new Error("Ledger amount is invalid");
  const snapshot = input.paymentMethodId ? paymentMethodSnapshot(input.paymentMethodId) : null;
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  getDatabase("sandbox").prepare(`
    INSERT INTO isd_ledger_entries (
      id, demo_entity_id, bucket, amount_minor, entry_type, reason,
      cash_out_id, provider_path, provider_operation_id,
      payment_method_id, payment_method_provider, payment_method_label,
      payment_method_mask, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.demoEntityId, input.bucket, input.amountMinor, input.entryType,
    input.reason, input.cashOutId ?? null, input.providerPath ?? null,
    input.providerOperationId ?? null, input.paymentMethodId ?? null,
    snapshot?.provider ?? null, snapshot?.label ?? null, snapshot?.mask ?? null,
    createdAt,
  );
  return listIsdLedgerEntries(input.demoEntityId).find((entry) => entry.id === id)!;
}

export function addIsdLedgerAdjustment(input: { demoEntityId: string; amountMinor: number; reason: string }): IsdLedgerEntry {
  return recordIsdLedgerEntry({
    ...input, bucket: "available",
    entryType: input.amountMinor > 0 ? "admin_credit" : "admin_debit",
  });
}

function paymentMethodSnapshot(id: string): { provider: string; label: string; mask: string | null } {
  const method = findStoredPlaidPaymentMethod(id, "sandbox");
  if (!method) throw new Error("Payment method not found");
  return {
    provider: method.provider,
    label: [method.institutionName, method.account.name].filter(Boolean).join(" · "),
    mask: method.account.mask,
  };
}
