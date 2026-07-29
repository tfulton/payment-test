import {
  ACHClass,
  TransferAuthorizationDecision,
  TransferNetwork,
  TransferType,
} from "plaid";

import { findStoredPlaidPaymentMethod } from "./payment-method-repository.js";
import {
  findOrCreatePlaidTransferIntent,
  recordPlaidTransferAuthorization,
  recordPlaidTransferOperation,
  type PlaidAccountHolderType,
  type PlaidTransferDirection,
  type PlaidTransferIntent,
  type PlaidTransferNetwork,
} from "./plaid-transfer-repository.js";
import { PlaidIntegrationError, getPlaidClient } from "./plaid.js";

export interface CreatePlaidTransferRequest {
  readonly clientUserId: string;
  readonly paymentMethodId: string;
  readonly direction: PlaidTransferDirection;
  readonly legalName: string;
  readonly accountHolderType: PlaidAccountHolderType;
  readonly amount: string;
  readonly network: PlaidTransferNetwork;
  readonly idempotencyKey: string;
  readonly debitAuthorizationAccepted: boolean;
}

export interface PlaidTransferPayment {
  readonly id: string;
  readonly direction: PlaidTransferDirection;
  readonly amountMinor: number;
  readonly currency: "USD";
  readonly requestedNetwork: PlaidTransferNetwork;
  readonly effectiveNetwork: string | null;
  readonly authorizationId: string;
  readonly authorizationDecision: string;
  readonly authorizationRationaleCode: string | null;
  readonly transferId: string;
  readonly transferStatus: string;
  readonly status: PlaidTransferIntent["status"];
}

export async function createPlaidTransfer(
  request: CreatePlaidTransferRequest,
): Promise<PlaidTransferPayment> {
  const clientUserId = nonEmpty(request.clientUserId, "clientUserId");
  const paymentMethodId = nonEmpty(request.paymentMethodId, "paymentMethodId");
  const legalName = bounded(request.legalName, "legalName", 128);
  const direction = oneOf(request.direction, ["send", "receive"], "direction");
  const accountHolderType = oneOf(
    request.accountHolderType,
    ["personal", "business"],
    "accountHolderType",
  );
  const network = oneOf(request.network, ["ach"], "network");
  const amountMinor = parseUsdAmount(request.amount);
  const amount = (amountMinor / 100).toFixed(2);
  const idempotencyKey = bounded(
    request.idempotencyKey,
    "idempotencyKey",
    50,
  );

  if (direction === "send" && request.debitAuthorizationAccepted !== true) {
    throw new PlaidIntegrationError(
      "One-time ACH debit authorization is required",
      "INVALID_REQUEST",
    );
  }
  const paymentMethod = findStoredPlaidPaymentMethod(
    paymentMethodId,
    "sandbox",
  );

  if (!paymentMethod || paymentMethod.clientUserId !== clientUserId) {
    throw new PlaidIntegrationError(
      "Plaid payment method is not available for this test session",
      "PAYMENT_METHOD_NOT_FOUND",
    );
  }

  ensureDirectionSupported(paymentMethod, direction);
  let intent: PlaidTransferIntent;

  try {
    intent = findOrCreatePlaidTransferIntent({
      testUserId: clientUserId,
      direction,
      amountMinor,
      paymentMethodId,
      legalName,
      accountHolderType,
      network,
      idempotencyKey,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Idempotency key was already used for another transfer"
    ) {
      throw new PlaidIntegrationError(error.message, "IDEMPOTENCY_CONFLICT");
    }

    throw error;
  }

  if (intent.transferId && intent.transferStatus) {
    return toPayment(intent);
  }

  try {
    if (!intent.authorizationId) {
      const authorizationResponse = await getPlaidClient().transferAuthorizationCreate({
        access_token: paymentMethod.accessToken,
        account_id: paymentMethod.account.id,
        type: direction === "send" ? TransferType.Debit : TransferType.Credit,
        network: TransferNetwork.Ach,
        amount,
        ach_class: achClass(accountHolderType, direction),
        user: { legal_name: legalName },
        idempotency_key: idempotencyKey,
        user_present: true,
        ledger_id: plaidLedgerId(),
      });
      const authorization = authorizationResponse.data.authorization;
      intent = recordPlaidTransferAuthorization({
        paymentIntentId: intent.id,
        authorizationId: authorization.id,
        decision: authorization.decision,
        rationaleCode: authorization.decision_rationale?.code ?? null,
        rationaleDescription:
          authorization.decision_rationale?.description ?? null,
        requestId: authorizationResponse.data.request_id,
        accountHolderType,
        debitAuthorizationAccepted:
          direction === "send" && request.debitAuthorizationAccepted,
      });
    }

    if (intent.authorizationDecision !== TransferAuthorizationDecision.Approved) {
      const actionRequired =
        intent.authorizationDecision ===
        TransferAuthorizationDecision.UserActionRequired;
      throw new PlaidIntegrationError(
        intent.authorizationRationaleDescription ||
          (actionRequired
            ? "Plaid requires the linked account to be re-authenticated"
            : "Plaid declined the transfer authorization"),
        actionRequired
          ? "PLAID_TRANSFER_ACTION_REQUIRED"
          : "PLAID_TRANSFER_DECLINED",
      );
    }

    if (!intent.authorizationId) {
      throw new Error("Approved Plaid transfer authorization has no identifier");
    }

    const transferResponse = await getPlaidClient().transferCreate({
      access_token: paymentMethod.accessToken,
      account_id: paymentMethod.account.id,
      authorization_id: intent.authorizationId,
      description: "ISD PAYMENT",
      metadata: { payment_intent_id: intent.id },
    });
    const transfer = transferResponse.data.transfer;
    intent = recordPlaidTransferOperation({
      paymentIntentId: intent.id,
      transferId: transfer.id,
      providerStatus: transfer.status,
      effectiveNetwork: transfer.network,
      requestId: transferResponse.data.request_id,
    });

    return toPayment(intent);
  } catch (error) {
    throw plaidTransferError(error);
  }
}

function plaidLedgerId(): string {
  const value = process.env.PLAID_LEDGER_ID?.trim();

  if (!value) {
    throw new PlaidIntegrationError(
      "Missing required environment variable: PLAID_LEDGER_ID",
      "PLAID_CONFIGURATION_ERROR",
    );
  }

  return value;
}

function ensureDirectionSupported(
  paymentMethod: ReturnType<typeof findStoredPlaidPaymentMethod> & {},
  direction: PlaidTransferDirection,
): void {
  const supported =
    direction === "send"
      ? paymentMethod.account.canTransferOut
      : paymentMethod.account.canTransferIn;

  if (supported === false) {
    throw new PlaidIntegrationError(
      direction === "send"
        ? "The selected account cannot be debited through Plaid Transfer"
        : "The selected account cannot receive a Plaid Transfer credit",
      "PLAID_TRANSFER_DIRECTION_UNAVAILABLE",
    );
  }
}

function achClass(
  accountHolderType: PlaidAccountHolderType,
  direction: PlaidTransferDirection,
): ACHClass {
  if (accountHolderType === "business") {
    return ACHClass.Ccd;
  }

  return direction === "send" ? ACHClass.Web : ACHClass.Ppd;
}

function toPayment(intent: PlaidTransferIntent): PlaidTransferPayment {
  if (
    !intent.authorizationId ||
    !intent.authorizationDecision ||
    !intent.transferId ||
    !intent.transferStatus
  ) {
    throw new Error("Plaid transfer has not been submitted");
  }

  return {
    id: intent.id,
    direction: intent.direction,
    amountMinor: intent.amountMinor,
    currency: "USD",
    requestedNetwork: intent.requestedNetwork,
    effectiveNetwork: intent.effectiveNetwork,
    authorizationId: intent.authorizationId,
    authorizationDecision: intent.authorizationDecision,
    authorizationRationaleCode: intent.authorizationRationaleCode,
    transferId: intent.transferId,
    transferStatus: intent.transferStatus,
    status: intent.status,
  };
}

function plaidTransferError(error: unknown): PlaidIntegrationError {
  if (error instanceof PlaidIntegrationError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;

    if (typeof response === "object" && response !== null && "data" in response) {
      const data = response.data;

      if (typeof data === "object" && data !== null) {
        return new PlaidIntegrationError(
          "error_message" in data
            ? String(data.error_message)
            : "Plaid rejected the transfer request",
          "error_code" in data ? String(data.error_code) : "PLAID_TRANSFER_ERROR",
          "request_id" in data ? String(data.request_id) : null,
        );
      }
    }
  }

  return new PlaidIntegrationError(
    "Plaid Transfer request failed",
    "PLAID_TRANSFER_REQUEST_FAILED",
  );
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new PlaidIntegrationError(`${name} is required`, "INVALID_REQUEST");
  }

  return normalized;
}

function bounded(value: string, name: string, max: number): string {
  const normalized = nonEmpty(value, name);

  if (normalized.length > max) {
    throw new PlaidIntegrationError(
      `${name} must be ${max} characters or fewer`,
      "INVALID_REQUEST",
    );
  }

  return normalized;
}

function oneOf<const T extends string>(
  value: string,
  allowed: readonly T[],
  name: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new PlaidIntegrationError(
      `${name} must be one of: ${allowed.join(", ")}`,
      "INVALID_REQUEST",
    );
  }

  return value as T;
}

function parseUsdAmount(value: string): number {
  const normalized = value.trim();

  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new PlaidIntegrationError(
      "amount must be a positive USD amount with at most two decimal places",
      "INVALID_REQUEST",
    );
  }

  const [dollars = "0", cents = ""] = normalized.split(".");
  const amountMinor = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));

  if (amountMinor <= 0) {
    throw new PlaidIntegrationError(
      "amount must be greater than zero",
      "INVALID_REQUEST",
    );
  }

  return amountMinor;
}
