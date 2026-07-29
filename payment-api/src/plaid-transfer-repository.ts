import { randomUUID } from "node:crypto";

import { getDatabase } from "./database.js";
import type { PaymentIntentStatus } from "./payment-repository.js";

export type PlaidTransferDirection = "send" | "receive";
export type PlaidTransferNetwork = "ach";
export type PlaidAccountHolderType = "personal" | "business";

export interface PlaidTransferIntent {
  readonly id: string;
  readonly testUserId: string;
  readonly direction: PlaidTransferDirection;
  readonly amountMinor: number;
  readonly paymentMethodId: string;
  readonly legalName: string;
  readonly accountHolderType: PlaidAccountHolderType;
  readonly requestedNetwork: PlaidTransferNetwork;
  readonly effectiveNetwork: string | null;
  readonly status: PaymentIntentStatus;
  readonly idempotencyKey: string;
  readonly authorizationId: string | null;
  readonly authorizationDecision: string | null;
  readonly authorizationRationaleCode: string | null;
  readonly authorizationRationaleDescription: string | null;
  readonly transferId: string | null;
  readonly transferStatus: string | null;
  readonly createdAt: string;
}

interface PlaidTransferIntentRow {
  readonly id: string;
  readonly test_user_id: string;
  readonly movement_type: "external_debit" | "external_credit";
  readonly amount_minor: number;
  readonly payment_method_id: string;
  readonly counterparty_type: string;
  readonly counterparty_ref: string;
  readonly requested_network: PlaidTransferNetwork;
  readonly effective_network: string | null;
  readonly status: PaymentIntentStatus;
  readonly idempotency_key: string;
  readonly created_at: string;
  readonly authorization_id: string | null;
  readonly authorization_status: string | null;
  readonly authorization_metadata: string | null;
  readonly transfer_id: string | null;
  readonly transfer_status: string | null;
}

interface AuthorizationMetadata {
  readonly accountHolderType?: unknown;
  readonly authorizationAcceptedAt?: unknown;
  readonly authorizationTextVersion?: unknown;
  readonly rationaleCode?: unknown;
  readonly rationaleDescription?: unknown;
}

export function findOrCreatePlaidTransferIntent(request: {
  readonly testUserId: string;
  readonly direction: PlaidTransferDirection;
  readonly amountMinor: number;
  readonly paymentMethodId: string;
  readonly legalName: string;
  readonly accountHolderType: PlaidAccountHolderType;
  readonly network: PlaidTransferNetwork;
  readonly idempotencyKey: string;
}): PlaidTransferIntent {
  const existing = findPlaidTransferIntentByIdempotencyKey(
    request.idempotencyKey,
  );
  const movementType =
    request.direction === "send" ? "external_debit" : "external_credit";
  const counterpartyType = `plaid_linked_${request.accountHolderType}`;

  if (existing) {
    if (
      existing.testUserId !== request.testUserId ||
      existing.direction !== request.direction ||
      existing.amountMinor !== request.amountMinor ||
      existing.paymentMethodId !== request.paymentMethodId ||
      existing.legalName !== request.legalName ||
      existing.accountHolderType !== request.accountHolderType ||
      existing.requestedNetwork !== request.network
    ) {
      throw new Error("Idempotency key was already used for another transfer");
    }

    return existing;
  }

  const database = getDatabase("sandbox");
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
          requested_network,
          status,
          idempotency_key,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 'plaid_transfer', ?, 'USD', ?, ?, ?, ?, 'ready', ?, ?, ?)
      `,
    )
    .run(
      id,
      request.testUserId,
      movementType,
      request.amountMinor,
      request.paymentMethodId,
      counterpartyType,
      request.legalName,
      request.network,
      request.idempotencyKey,
      now,
      now,
    );

  const created = findPlaidTransferIntentByIdempotencyKey(
    request.idempotencyKey,
  );

  if (!created) {
    throw new Error("Unable to persist Plaid transfer intent");
  }

  return created;
}

export function recordPlaidTransferAuthorization(request: {
  readonly paymentIntentId: string;
  readonly authorizationId: string;
  readonly decision: string;
  readonly rationaleCode: string | null;
  readonly rationaleDescription: string | null;
  readonly requestId: string;
  readonly accountHolderType: PlaidAccountHolderType;
  readonly debitAuthorizationAccepted: boolean;
}): PlaidTransferIntent {
  const database = getDatabase("sandbox");
  const now = new Date().toISOString();
  const status: PaymentIntentStatus =
    request.decision === "approved"
      ? "ready"
      : request.decision === "user_action_required"
        ? "action_required"
        : "failed";
  const metadata = JSON.stringify({
    accountHolderType: request.accountHolderType,
    authorizationAcceptedAt: request.debitAuthorizationAccepted ? now : null,
    authorizationTextVersion: request.debitAuthorizationAccepted
      ? "sandbox-one-time-ach-debit-v1"
      : null,
    rationaleCode: request.rationaleCode,
    rationaleDescription: request.rationaleDescription,
  });
  const save = database.transaction(() => {
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
            request_id,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (?, ?, 'plaid', 'transfer_authorization', ?, ?, ?, ?, ?, ?)
          ON CONFLICT (provider, external_id) DO UPDATE SET
            provider_status = excluded.provider_status,
            request_id = excluded.request_id,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        randomUUID(),
        request.paymentIntentId,
        request.authorizationId,
        request.decision,
        request.requestId,
        metadata,
        now,
        now,
      );
    database
      .prepare(
        "UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?",
      )
      .run(status, now, request.paymentIntentId);
  });

  save();
  return requiredIntent(request.paymentIntentId);
}

export function recordPlaidTransferOperation(request: {
  readonly paymentIntentId: string;
  readonly transferId: string;
  readonly providerStatus: string;
  readonly effectiveNetwork: string;
  readonly requestId: string;
}): PlaidTransferIntent {
  const database = getDatabase("sandbox");
  const now = new Date().toISOString();
  const save = database.transaction(() => {
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
            request_id,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (?, ?, 'plaid', 'transfer', ?, ?, ?, ?, ?, ?)
          ON CONFLICT (provider, external_id) DO UPDATE SET
            provider_status = excluded.provider_status,
            request_id = excluded.request_id,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        randomUUID(),
        request.paymentIntentId,
        request.transferId,
        request.providerStatus,
        request.requestId,
        JSON.stringify({ network: request.effectiveNetwork }),
        now,
        now,
      );
    database
      .prepare(
        `
          UPDATE payment_intents
          SET status = 'submitted', effective_network = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(request.effectiveNetwork, now, request.paymentIntentId);
  });

  save();
  return requiredIntent(request.paymentIntentId);
}

function requiredIntent(id: string): PlaidTransferIntent {
  const intent = findPlaidTransferIntentById(id);

  if (!intent) {
    throw new Error("Unable to resolve persisted Plaid transfer");
  }

  return intent;
}

function findPlaidTransferIntentByIdempotencyKey(
  idempotencyKey: string,
): PlaidTransferIntent | undefined {
  return findPlaidTransferIntent("payment_intents.idempotency_key = ?", idempotencyKey);
}

function findPlaidTransferIntentById(
  id: string,
): PlaidTransferIntent | undefined {
  return findPlaidTransferIntent("payment_intents.id = ?", id);
}

function findPlaidTransferIntent(
  where: string,
  value: string,
): PlaidTransferIntent | undefined {
  const row = getDatabase("sandbox")
    .prepare(
      `
        SELECT
          payment_intents.*,
          authorization.external_id AS authorization_id,
          authorization.provider_status AS authorization_status,
          authorization.metadata_json AS authorization_metadata,
          transfer.external_id AS transfer_id,
          transfer.provider_status AS transfer_status
        FROM payment_intents
        LEFT JOIN provider_operations AS authorization
          ON authorization.payment_intent_id = payment_intents.id
          AND authorization.provider = 'plaid'
          AND authorization.operation_type = 'transfer_authorization'
        LEFT JOIN provider_operations AS transfer
          ON transfer.payment_intent_id = payment_intents.id
          AND transfer.provider = 'plaid'
          AND transfer.operation_type = 'transfer'
        WHERE ${where}
          AND payment_intents.provider_path = 'plaid_transfer'
      `,
    )
    .get(value) as PlaidTransferIntentRow | undefined;

  return row ? toIntent(row) : undefined;
}

function toIntent(row: PlaidTransferIntentRow): PlaidTransferIntent {
  const metadata = parseAuthorizationMetadata(row.authorization_metadata);
  const accountHolderType = row.counterparty_type.endsWith("_business")
    ? "business"
    : "personal";

  return {
    id: row.id,
    testUserId: row.test_user_id,
    direction: row.movement_type === "external_debit" ? "send" : "receive",
    amountMinor: row.amount_minor,
    paymentMethodId: row.payment_method_id,
    legalName: row.counterparty_ref,
    accountHolderType,
    requestedNetwork: row.requested_network,
    effectiveNetwork: row.effective_network,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    authorizationId: row.authorization_id,
    authorizationDecision: row.authorization_status,
    authorizationRationaleCode: stringOrNull(metadata.rationaleCode),
    authorizationRationaleDescription: stringOrNull(
      metadata.rationaleDescription,
    ),
    transferId: row.transfer_id,
    transferStatus: row.transfer_status,
    createdAt: row.created_at,
  };
}

function parseAuthorizationMetadata(value: string | null): AuthorizationMetadata {
  if (!value) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
