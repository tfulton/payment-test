import { randomUUID } from "node:crypto";

import { getDatabase } from "./database.js";

export type PaymentIntentStatus =
  | "ready"
  | "submitted"
  | "processing"
  | "succeeded"
  | "failed"
  | "returned"
  | "canceled"
  | "action_required";

export interface CheckbookPaymentIntent {
  readonly id: string;
  readonly testUserId: string;
  readonly amountMinor: number;
  readonly paymentMethodId: string;
  readonly recipient: string;
  readonly status: PaymentIntentStatus;
  readonly idempotencyKey: string;
  readonly externalId: string | null;
  readonly providerStatus: string | null;
  readonly createdAt: string;
}

interface PaymentIntentRow {
  readonly id: string;
  readonly test_user_id: string;
  readonly amount_minor: number;
  readonly payment_method_id: string;
  readonly counterparty_ref: string;
  readonly status: PaymentIntentStatus;
  readonly idempotency_key: string;
  readonly created_at: string;
  readonly external_id: string | null;
  readonly provider_status: string | null;
}

export function findOrCreateCheckbookPaymentIntent(request: {
  readonly testUserId: string;
  readonly amountMinor: number;
  readonly paymentMethodId: string;
  readonly recipient: string;
  readonly idempotencyKey: string;
}): CheckbookPaymentIntent {
  const database = getDatabase("sandbox");
  const existing = findByIdempotencyKey(request.idempotencyKey);

  if (existing) {
    if (
      existing.testUserId !== request.testUserId ||
      existing.amountMinor !== request.amountMinor ||
      existing.paymentMethodId !== request.paymentMethodId ||
      existing.recipient !== request.recipient
    ) {
      throw new Error("Idempotency key was already used for another payment");
    }

    return existing;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `
        INSERT INTO payment_intents (
          id,
          test_user_id,
          movement_type,
          provider_path,
          amount_minor,
          currency,
          payment_method_id,
          counterparty_type,
          counterparty_ref,
          status,
          idempotency_key,
          created_at,
          updated_at
        ) VALUES (?, ?, 'external_credit', 'checkbook_standard', ?, 'USD', ?, 'email', ?, 'ready', ?, ?, ?)
      `,
    )
    .run(
      id,
      request.testUserId,
      request.amountMinor,
      request.paymentMethodId,
      request.recipient,
      request.idempotencyKey,
      now,
      now,
    );

  const created = findByIdempotencyKey(request.idempotencyKey);

  if (!created) {
    throw new Error("Unable to persist payment intent");
  }

  return created;
}

export function updatePaymentIntentStatus(
  id: string,
  status: PaymentIntentStatus,
): void {
  getDatabase("sandbox")
    .prepare(
      "UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?",
    )
    .run(status, new Date().toISOString(), id);
}

export function recordCheckbookPaymentOperation(request: {
  readonly paymentIntentId: string;
  readonly externalId: string;
  readonly providerStatus: string;
}): CheckbookPaymentIntent {
  const database = getDatabase("sandbox");
  const now = new Date().toISOString();
  const record = database.transaction(() => {
    database
      .prepare(
        `
          INSERT INTO provider_operations (
            id,
            payment_intent_id,
            provider,
            operation_type,
            external_id,
            provider_status,
            created_at,
            updated_at
          ) VALUES (?, ?, 'checkbook', 'digital_payment', ?, ?, ?, ?)
          ON CONFLICT (provider, external_id) DO UPDATE SET
            provider_status = excluded.provider_status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        randomUUID(),
        request.paymentIntentId,
        request.externalId,
        request.providerStatus,
        now,
        now,
      );
    database
      .prepare(
        "UPDATE payment_intents SET status = 'submitted', updated_at = ? WHERE id = ?",
      )
      .run(now, request.paymentIntentId);
  });

  record();
  const result = findById(request.paymentIntentId);

  if (!result) {
    throw new Error("Unable to resolve persisted payment");
  }

  return result;
}

function findByIdempotencyKey(
  idempotencyKey: string,
): CheckbookPaymentIntent | undefined {
  const row = getDatabase("sandbox")
    .prepare(intentSelect("payment_intents.idempotency_key = ?"))
    .get(idempotencyKey) as PaymentIntentRow | undefined;

  return row ? toIntent(row) : undefined;
}

function findById(id: string): CheckbookPaymentIntent | undefined {
  const row = getDatabase("sandbox")
    .prepare(intentSelect("payment_intents.id = ?"))
    .get(id) as PaymentIntentRow | undefined;

  return row ? toIntent(row) : undefined;
}

function intentSelect(where: string): string {
  return `
    SELECT
      payment_intents.*,
      provider_operations.external_id,
      provider_operations.provider_status
    FROM payment_intents
    LEFT JOIN provider_operations
      ON provider_operations.payment_intent_id = payment_intents.id
    WHERE ${where}
  `;
}

function toIntent(row: PaymentIntentRow): CheckbookPaymentIntent {
  return {
    id: row.id,
    testUserId: row.test_user_id,
    amountMinor: row.amount_minor,
    paymentMethodId: row.payment_method_id,
    recipient: row.counterparty_ref,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    externalId: row.external_id,
    providerStatus: row.provider_status,
    createdAt: row.created_at,
  };
}
