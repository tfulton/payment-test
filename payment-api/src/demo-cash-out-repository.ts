import { randomUUID } from "node:crypto";

import { getDatabase } from "./database.js";
import { recordIsdLedgerEntry } from "./isd-ledger-repository.js";

export type DemoEntityType = "owner_operator" | "broker";
export type DemoProviderPath =
  | "plaid_transfer"
  | "checkbook_standard"
  | "checkbook_marketplace";
export type DemoCashOutStatus =
  | "reserved"
  | "submitted"
  | "succeeded"
  | "failed"
  | "returned"
  | "canceled"
  | "action_required";

export class DemoCashOutError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "DemoCashOutError";
    this.code = code;
  }
}

export interface DemoEntityBalance {
  readonly availableMinor: number;
  readonly reservedMinor: number;
  readonly paidMinor: number;
}

export interface DemoEntity {
  readonly id: string;
  readonly displayName: string;
  readonly entityType: DemoEntityType;
  readonly email: string;
  readonly accountHolderType: "personal" | "business";
  readonly balance: DemoEntityBalance;
}

export interface DemoCashOut {
  readonly id: string;
  readonly demoEntityId: string;
  readonly providerPath: DemoProviderPath;
  readonly amountMinor: number;
  readonly currency: "USD";
  readonly status: DemoCashOutStatus;
  readonly idempotencyKey: string;
  readonly providerIntentId: string | null;
}

export interface DemoCashOutHistoryEntry {
  readonly id: string;
  readonly providerPath: DemoProviderPath;
  readonly amountMinor: number;
  readonly currency: "USD";
  readonly status: DemoCashOutStatus;
  readonly providerStatus: string | null;
  readonly providerExternalId: string | null;
  readonly paymentMethodLabel: string | null;
  readonly paymentMethodMask: string | null;
  readonly requestedNetwork: string | null;
  readonly effectiveNetwork: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DemoCashOutProviderContext extends DemoCashOut {
  readonly providerStatus: string;
  readonly providerExternalId: string;
}

interface EntityRow {
  readonly id: string;
  readonly display_name: string;
  readonly entity_type: DemoEntityType;
  readonly email: string;
  readonly account_holder_type: "personal" | "business";
  readonly available_minor: number;
  readonly reserved_minor: number;
  readonly paid_minor: number;
}

interface CashOutRow {
  readonly id: string;
  readonly demo_entity_id: string;
  readonly provider_path: DemoProviderPath;
  readonly amount_minor: number;
  readonly currency: "USD";
  readonly status: DemoCashOutStatus;
  readonly idempotency_key: string;
  readonly provider_intent_id: string | null;
}

interface CashOutHistoryRow {
  readonly id: string;
  readonly provider_path: DemoProviderPath;
  readonly amount_minor: number;
  readonly currency: "USD";
  readonly status: DemoCashOutStatus;
  readonly provider_status: string | null;
  readonly provider_external_id: string | null;
  readonly payment_method_label: string | null;
  readonly payment_method_mask: string | null;
  readonly requested_network: string | null;
  readonly effective_network: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface CashOutProviderContextRow extends CashOutRow {
  readonly provider_status: string;
  readonly provider_external_id: string;
}

const entityQuery = `
  SELECT
    e.id,
    e.display_name,
    e.entity_type,
    e.email,
    e.account_holder_type,
    COALESCE(SUM(CASE WHEN b.bucket = 'available' THEN b.amount_minor ELSE 0 END), 0) AS available_minor,
    COALESCE(SUM(CASE WHEN b.bucket = 'reserved' THEN b.amount_minor ELSE 0 END), 0) AS reserved_minor,
    COALESCE(SUM(CASE WHEN b.bucket = 'paid' THEN b.amount_minor ELSE 0 END), 0) AS paid_minor
  FROM demo_entities e
  LEFT JOIN isd_ledger_entries b ON b.demo_entity_id = e.id
`;

export function listDemoEntities(): DemoEntity[] {
  const rows = getDatabase("sandbox")
    .prepare(`${entityQuery} GROUP BY e.id ORDER BY e.entity_type DESC, e.id`)
    .all() as EntityRow[];

  return rows.map(toEntity);
}

export function getDemoEntity(id: string): DemoEntity | null {
  const row = getDatabase("sandbox")
    .prepare(`${entityQuery} WHERE e.id = ? GROUP BY e.id`)
    .get(id) as EntityRow | undefined;

  return row ? toEntity(row) : null;
}

export function listDemoCashOutsForEntity(
  demoEntityId: string,
): DemoCashOutHistoryEntry[] {
  const rows = getDatabase("sandbox")
    .prepare(
      `
        SELECT
          cash_outs.id,
          cash_outs.provider_path,
          cash_outs.amount_minor,
          cash_outs.currency,
          cash_outs.status,
          operation.provider_status,
          operation.external_id AS provider_external_id,
          TRIM(COALESCE(item.institution_name || ' · ', '') || COALESCE(method.name, '')) AS payment_method_label,
          method.mask AS payment_method_mask,
          intent.requested_network,
          intent.effective_network,
          cash_outs.created_at,
          cash_outs.updated_at
        FROM demo_cash_outs AS cash_outs
        LEFT JOIN provider_operations AS operation
          ON operation.id = (
            SELECT candidate.id
            FROM provider_operations AS candidate
            WHERE candidate.payment_intent_id = cash_outs.provider_intent_id
            ORDER BY
              CASE
                WHEN candidate.operation_type IN ('transfer', 'digital_payment') THEN 0
                ELSE 1
              END,
              candidate.updated_at DESC
            LIMIT 1
          )
        LEFT JOIN payment_intents AS intent
          ON intent.id = cash_outs.provider_intent_id
        LEFT JOIN payment_methods AS method
          ON method.id = intent.payment_method_id
        LEFT JOIN plaid_items AS item
          ON item.id = method.plaid_item_id
        WHERE cash_outs.demo_entity_id = ?
        ORDER BY cash_outs.created_at DESC, cash_outs.id DESC
      `,
    )
    .all(demoEntityId) as CashOutHistoryRow[];

  return rows.map((row) => ({
    id: row.id,
    providerPath: row.provider_path,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    providerStatus: row.provider_status,
    providerExternalId: row.provider_external_id,
    paymentMethodLabel: row.payment_method_label || null,
    paymentMethodMask: row.payment_method_mask,
    requestedNetwork: row.requested_network,
    effectiveNetwork: row.effective_network,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getDemoCashOutProviderContext(
  id: string,
): DemoCashOutProviderContext {
  const row = getDatabase("sandbox")
    .prepare(
      `
        SELECT
          cash_outs.*,
          operation.provider_status,
          operation.external_id AS provider_external_id
        FROM demo_cash_outs AS cash_outs
        JOIN provider_operations AS operation
          ON operation.payment_intent_id = cash_outs.provider_intent_id
          AND operation.operation_type = CASE cash_outs.provider_path
            WHEN 'plaid_transfer' THEN 'transfer'
            WHEN 'checkbook_standard' THEN 'digital_payment'
            WHEN 'checkbook_marketplace' THEN 'digital_payment'
          END
        WHERE cash_outs.id = ?
      `,
    )
    .get(id) as CashOutProviderContextRow | undefined;

  if (!row) {
    throw new DemoCashOutError(
      "Demo cash-out provider operation not found",
      "DEMO_CASH_OUT_NOT_FOUND",
    );
  }

  return {
    ...toCashOut(row),
    providerStatus: row.provider_status,
    providerExternalId: row.provider_external_id,
  };
}

export function reserveDemoCashOut(input: {
  readonly demoEntityId: string;
  readonly providerPath: DemoProviderPath;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
  readonly paymentMethodId?: string;
}): DemoCashOut {
  const database = getDatabase("sandbox");
  const reserve = database.transaction(() => {
    const existing = database
      .prepare("SELECT * FROM demo_cash_outs WHERE idempotency_key = ?")
      .get(input.idempotencyKey) as CashOutRow | undefined;

    if (existing) {
      if (
        existing.demo_entity_id !== input.demoEntityId ||
        existing.provider_path !== input.providerPath ||
        existing.amount_minor !== input.amountMinor
      ) {
        throw new DemoCashOutError(
          "Idempotency key was already used for another cash-out",
          "IDEMPOTENCY_CONFLICT",
        );
      }

      if (existing.status === "failed") {
        throw new DemoCashOutError(
          "This cash-out attempt failed; retry with a new idempotency key",
          "IDEMPOTENCY_CONFLICT",
        );
      }

      return toCashOut(existing);
    }

    const entity = getDemoEntity(input.demoEntityId);

    if (!entity) {
      throw new DemoCashOutError("Demo entity not found", "DEMO_ENTITY_NOT_FOUND");
    }

    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new DemoCashOutError("Cash-out amount is invalid", "INVALID_AMOUNT");
    }

    if (entity.balance.availableMinor < input.amountMinor) {
      throw new DemoCashOutError(
        "Cash-out amount exceeds the entity's available earnings",
        "INSUFFICIENT_DEMO_BALANCE",
      );
    }

    const now = new Date().toISOString();
    const cashOutId = randomUUID();
    database
      .prepare(`
        INSERT INTO demo_cash_outs (
          id, demo_entity_id, provider_path, amount_minor, currency, status,
          idempotency_key, provider_intent_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'USD', 'reserved', ?, NULL, ?, ?)
      `)
      .run(
        cashOutId,
        input.demoEntityId,
        input.providerPath,
        input.amountMinor,
        input.idempotencyKey,
        now,
        now,
      );
    recordIsdLedgerEntry({
      demoEntityId: input.demoEntityId, bucket: "available",
      amountMinor: -input.amountMinor, entryType: "cash_out_reserved",
      reason: "Cash-out reserved", cashOutId, providerPath: input.providerPath,
      ...(input.paymentMethodId ? { paymentMethodId: input.paymentMethodId } : {}), createdAt: now,
    });
    recordIsdLedgerEntry({
      demoEntityId: input.demoEntityId, bucket: "reserved",
      amountMinor: input.amountMinor, entryType: "cash_out_reserved",
      reason: "Cash-out reserved", cashOutId, providerPath: input.providerPath,
      ...(input.paymentMethodId ? { paymentMethodId: input.paymentMethodId } : {}), createdAt: now,
    });

    return toCashOut(
      database
        .prepare("SELECT * FROM demo_cash_outs WHERE id = ?")
        .get(cashOutId) as CashOutRow,
    );
  });

  return reserve.immediate();
}

export function markDemoCashOutSubmitted(
  id: string,
  providerIntentId: string,
): DemoCashOut {
  const database = getDatabase("sandbox");
  database
    .prepare(`
      UPDATE demo_cash_outs
      SET status = 'submitted', provider_intent_id = ?, updated_at = ?
      WHERE id = ? AND status IN ('reserved', 'submitted', 'action_required')
    `)
    .run(providerIntentId, new Date().toISOString(), id);

  return requiredCashOut(id);
}

export function markDemoCashOutActionRequired(id: string): DemoCashOut {
  getDatabase("sandbox")
    .prepare(`
      UPDATE demo_cash_outs SET status = 'action_required', updated_at = ?
      WHERE id = ? AND status IN ('reserved', 'submitted', 'action_required')
    `)
    .run(new Date().toISOString(), id);

  return requiredCashOut(id);
}

export function releaseDemoCashOut(id: string): DemoCashOut {
  const database = getDatabase("sandbox");
  const release = database.transaction(() => {
    const cashOut = requiredCashOut(id);

    if (cashOut.status !== "reserved" && cashOut.status !== "action_required") {
      return cashOut;
    }

    const now = new Date().toISOString();
    recordIsdLedgerEntry({
      demoEntityId: cashOut.demoEntityId, bucket: "reserved",
      amountMinor: -cashOut.amountMinor, entryType: "cash_out_released",
      reason: "Cash-out reservation released", cashOutId: cashOut.id,
      providerPath: cashOut.providerPath, createdAt: now,
    });
    recordIsdLedgerEntry({
      demoEntityId: cashOut.demoEntityId, bucket: "available",
      amountMinor: cashOut.amountMinor, entryType: "cash_out_released",
      reason: "Cash-out reservation released", cashOutId: cashOut.id,
      providerPath: cashOut.providerPath, createdAt: now,
    });
    database
      .prepare("UPDATE demo_cash_outs SET status = 'failed', updated_at = ? WHERE id = ?")
      .run(now, id);

    return requiredCashOut(id);
  });

  return release.immediate();
}

export function settleDemoCashOut(input: {
  readonly id: string;
  readonly providerExternalId: string;
  readonly providerStatus: string;
  readonly requestId?: string;
}): DemoCashOut {
  const database = getDatabase("sandbox");
  const settle = database.transaction(() => {
    const cashOut = requiredCashOut(input.id);

    if (cashOut.status === "succeeded") {
      return cashOut;
    }

    if (cashOut.status !== "submitted" || !cashOut.providerIntentId) {
      throw new DemoCashOutError(
        `Cash-out cannot be completed from ${cashOut.status}`,
        "INVALID_CASH_OUT_STATUS",
      );
    }

    const now = new Date().toISOString();
    const operationType =
      cashOut.providerPath === "plaid_transfer" ? "transfer" : "digital_payment";
    const operationUpdate = database
      .prepare(
        `
          UPDATE provider_operations
          SET provider_status = ?, request_id = COALESCE(?, request_id), updated_at = ?
          WHERE payment_intent_id = ?
            AND operation_type = ?
            AND external_id = ?
        `,
      )
      .run(
        input.providerStatus,
        input.requestId ?? null,
        now,
        cashOut.providerIntentId,
        operationType,
        input.providerExternalId,
      );

    if (operationUpdate.changes !== 1) {
      throw new DemoCashOutError(
        "Cash-out provider operation no longer matches",
        "PROVIDER_OPERATION_MISMATCH",
      );
    }

    database
      .prepare(
        "UPDATE payment_intents SET status = 'succeeded', updated_at = ? WHERE id = ?",
      )
      .run(now, cashOut.providerIntentId);

    const paymentMethodId = database.prepare(
      "SELECT payment_method_id FROM payment_intents WHERE id = ?",
    ).get(cashOut.providerIntentId) as { payment_method_id: string | null } | undefined;
    const operation = database.prepare(
      "SELECT id FROM provider_operations WHERE payment_intent_id = ? AND external_id = ?",
    ).get(cashOut.providerIntentId, input.providerExternalId) as { id: string } | undefined;
    recordIsdLedgerEntry({
      demoEntityId: cashOut.demoEntityId, bucket: "reserved",
      amountMinor: -cashOut.amountMinor, entryType: "cash_out_settled",
      reason: "Cash-out settled", cashOutId: cashOut.id,
      providerPath: cashOut.providerPath,
      ...(operation ? { providerOperationId: operation.id } : {}),
      ...(paymentMethodId?.payment_method_id ? { paymentMethodId: paymentMethodId.payment_method_id } : {}), createdAt: now,
    });
    recordIsdLedgerEntry({
      demoEntityId: cashOut.demoEntityId, bucket: "paid",
      amountMinor: cashOut.amountMinor, entryType: "cash_out_settled",
      reason: "Cash-out settled", cashOutId: cashOut.id,
      providerPath: cashOut.providerPath,
      ...(operation ? { providerOperationId: operation.id } : {}),
      ...(paymentMethodId?.payment_method_id ? { paymentMethodId: paymentMethodId.payment_method_id } : {}), createdAt: now,
    });
    database
      .prepare(
        "UPDATE demo_cash_outs SET status = 'succeeded', updated_at = ? WHERE id = ?",
      )
      .run(now, cashOut.id);

    return requiredCashOut(cashOut.id);
  });

  return settle.immediate();
}

function requiredCashOut(id: string): DemoCashOut {
  const row = getDatabase("sandbox")
    .prepare("SELECT * FROM demo_cash_outs WHERE id = ?")
    .get(id) as CashOutRow | undefined;

  if (!row) {
    throw new DemoCashOutError("Demo cash-out not found", "DEMO_CASH_OUT_NOT_FOUND");
  }

  return toCashOut(row);
}

function toEntity(row: EntityRow): DemoEntity {
  return {
    id: row.id,
    displayName: row.display_name,
    entityType: row.entity_type,
    email: row.email,
    accountHolderType: row.account_holder_type,
    balance: {
      availableMinor: row.available_minor,
      reservedMinor: row.reserved_minor,
      paidMinor: row.paid_minor,
    },
  };
}

function toCashOut(row: CashOutRow): DemoCashOut {
  return {
    id: row.id,
    demoEntityId: row.demo_entity_id,
    providerPath: row.provider_path,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    providerIntentId: row.provider_intent_id,
  };
}
