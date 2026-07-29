import { randomUUID } from "node:crypto";

import { getDatabase } from "./database.js";

export interface PlaidPaymentMethodRecord {
  readonly id: string;
  readonly provider: "plaid";
  readonly institutionName: string | null;
  readonly account: {
    readonly id: string;
    readonly name: string;
    readonly officialName: string | null;
    readonly mask: string | null;
    readonly type: string;
    readonly subtype: string | null;
    readonly verificationStatus: string | null;
    readonly canTransferIn: boolean | null;
    readonly canTransferOut: boolean | null;
  };
  readonly createdAt: string;
}

export interface SavePlaidPaymentMethodRequest {
  readonly environment: "sandbox" | "production";
  readonly clientUserId: string;
  readonly plaidItemId: string;
  readonly accessToken: string;
  readonly institutionId: string | null;
  readonly institutionName: string | null;
  readonly account: PlaidPaymentMethodRecord["account"];
}

export interface StoredPlaidPaymentMethod extends PlaidPaymentMethodRecord {
  readonly environment: "sandbox" | "production";
  readonly clientUserId: string;
  readonly plaidItemId: string;
  readonly accessToken: string;
  readonly institutionId: string | null;
}

interface PaymentMethodRow {
  readonly id: string;
  readonly provider: "plaid";
  readonly institution_name: string | null;
  readonly plaid_account_id: string;
  readonly name: string;
  readonly official_name: string | null;
  readonly mask: string | null;
  readonly account_type: string;
  readonly account_subtype: string | null;
  readonly verification_status: string | null;
  readonly can_transfer_in: number | null;
  readonly can_transfer_out: number | null;
  readonly created_at: string;
}

interface StoredPaymentMethodRow extends PaymentMethodRow {
  readonly plaid_environment: "sandbox" | "production";
  readonly test_user_id: string;
  readonly external_item_id: string;
  readonly access_token: string;
  readonly institution_id: string | null;
}

export function savePlaidPaymentMethod(
  request: SavePlaidPaymentMethodRequest,
): PlaidPaymentMethodRecord {
  const database = getDatabase(request.environment);
  const now = new Date().toISOString();
  const itemRecordId = randomUUID();
  const paymentMethodId = randomUUID();
  const save = database.transaction(() => {
    database
      .prepare(
        `
          INSERT INTO plaid_items (
            id,
            test_user_id,
            plaid_environment,
            plaid_item_id,
            access_token,
            institution_id,
            institution_name,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
          ON CONFLICT (plaid_environment, plaid_item_id) DO UPDATE SET
            test_user_id = excluded.test_user_id,
            access_token = excluded.access_token,
            institution_id = excluded.institution_id,
            institution_name = excluded.institution_name,
            status = 'active',
            updated_at = excluded.updated_at
        `,
      )
      .run(
        itemRecordId,
        request.clientUserId,
        request.environment,
        request.plaidItemId,
        request.accessToken,
        request.institutionId,
        request.institutionName,
        now,
        now,
      );

    const item = database
      .prepare(
        `
          SELECT id
          FROM plaid_items
          WHERE plaid_environment = ? AND plaid_item_id = ?
        `,
      )
      .get(request.environment, request.plaidItemId) as
      | { readonly id: string }
      | undefined;

    if (!item) {
      throw new Error("Unable to resolve persisted Plaid Item");
    }

    database
      .prepare(
        `
          INSERT INTO payment_methods (
            id,
            plaid_item_id,
            provider,
            plaid_account_id,
            name,
            official_name,
            mask,
            account_type,
            account_subtype,
            verification_status,
            can_transfer_in,
            can_transfer_out,
            created_at,
            updated_at
          ) VALUES (?, ?, 'plaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (plaid_item_id, plaid_account_id) DO UPDATE SET
            name = excluded.name,
            official_name = excluded.official_name,
            mask = excluded.mask,
            account_type = excluded.account_type,
            account_subtype = excluded.account_subtype,
            verification_status = excluded.verification_status,
            can_transfer_in = excluded.can_transfer_in,
            can_transfer_out = excluded.can_transfer_out,
            status = 'active',
            updated_at = excluded.updated_at
        `,
      )
      .run(
        paymentMethodId,
        item.id,
        request.account.id,
        request.account.name,
        request.account.officialName,
        request.account.mask,
        request.account.type,
        request.account.subtype,
        request.account.verificationStatus,
        toSqlBoolean(request.account.canTransferIn),
        toSqlBoolean(request.account.canTransferOut),
        now,
        now,
      );

    const saved = database
      .prepare(
        `
          SELECT
            payment_methods.*,
            plaid_items.institution_name
          FROM payment_methods
          JOIN plaid_items ON plaid_items.id = payment_methods.plaid_item_id
          WHERE payment_methods.plaid_item_id = ?
            AND payment_methods.plaid_account_id = ?
        `,
      )
      .get(item.id, request.account.id) as PaymentMethodRow;

    database
      .prepare(
        `
          UPDATE payment_methods
          SET status = 'removed', updated_at = ?
          WHERE id <> ?
            AND status = 'active'
            AND plaid_item_id IN (
              SELECT id
              FROM plaid_items
              WHERE test_user_id = ? AND plaid_environment = ?
            )
        `,
      )
      .run(now, saved.id, request.clientUserId, request.environment);

    return saved;
  });

  return toPaymentMethod(save());
}

export function findStoredPlaidPaymentMethod(
  id: string,
  environment: "sandbox" | "production",
): StoredPlaidPaymentMethod | undefined {
  const row = getDatabase(environment)
    .prepare(
      `
        SELECT
          payment_methods.*,
          plaid_items.plaid_environment,
          plaid_items.test_user_id,
          plaid_items.plaid_item_id AS external_item_id,
          plaid_items.access_token,
          plaid_items.institution_id,
          plaid_items.institution_name
        FROM payment_methods
        JOIN plaid_items ON plaid_items.id = payment_methods.plaid_item_id
        WHERE payment_methods.id = ?
          AND payment_methods.status = 'active'
          AND plaid_items.status = 'active'
      `,
    )
    .get(id) as StoredPaymentMethodRow | undefined;

  if (!row) {
    return undefined;
  }

  return {
    ...toPaymentMethod(row),
    environment: row.plaid_environment,
    clientUserId: row.test_user_id,
    plaidItemId: row.external_item_id,
    accessToken: row.access_token,
    institutionId: row.institution_id,
  };
}

export function findLatestPlaidPaymentMethodForUser(
  clientUserId: string,
  environment: "sandbox" | "production",
): PlaidPaymentMethodRecord | undefined {
  const row = getDatabase(environment)
    .prepare(
      `
        SELECT
          payment_methods.*,
          plaid_items.institution_name
        FROM payment_methods
        JOIN plaid_items ON plaid_items.id = payment_methods.plaid_item_id
        WHERE plaid_items.test_user_id = ?
          AND plaid_items.plaid_environment = ?
          AND plaid_items.status = 'active'
          AND payment_methods.status = 'active'
        ORDER BY payment_methods.updated_at DESC
        LIMIT 1
      `,
    )
    .get(clientUserId, environment) as PaymentMethodRow | undefined;

  return row ? toPaymentMethod(row) : undefined;
}

export function removePlaidPaymentMethod(
  id: string,
  clientUserId: string,
  environment: "sandbox" | "production",
): boolean {
  const database = getDatabase(environment);
  const remove = database.transaction(() => {
    const result = database
      .prepare(
        `
          UPDATE payment_methods
          SET status = 'removed', updated_at = ?
          WHERE id = ?
            AND status = 'active'
            AND plaid_item_id IN (
              SELECT id
              FROM plaid_items
              WHERE test_user_id = ?
                AND plaid_environment = ?
                AND status = 'active'
            )
        `,
      )
      .run(new Date().toISOString(), id, clientUserId, environment);

    return result.changes === 1;
  });

  return remove.immediate();
}

function toPaymentMethod(row: PaymentMethodRow): PlaidPaymentMethodRecord {
  return {
    id: row.id,
    provider: row.provider,
    institutionName: row.institution_name,
    account: {
      id: row.plaid_account_id,
      name: row.name,
      officialName: row.official_name,
      mask: row.mask,
      type: row.account_type,
      subtype: row.account_subtype,
      verificationStatus: row.verification_status,
      canTransferIn: fromSqlBoolean(row.can_transfer_in),
      canTransferOut: fromSqlBoolean(row.can_transfer_out),
    },
    createdAt: row.created_at,
  };
}

function toSqlBoolean(value: boolean | null): number | null {
  return value === null ? null : Number(value);
}

function fromSqlBoolean(value: number | null): boolean | null {
  return value === null ? null : Boolean(value);
}
