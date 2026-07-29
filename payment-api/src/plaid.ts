import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  ProcessorTokenCreateRequestProcessorEnum,
  Products,
} from "plaid";

import {
  findLatestPlaidPaymentMethodForUser,
  findStoredPlaidPaymentMethod,
  removePlaidPaymentMethod,
  savePlaidPaymentMethod,
  type PlaidPaymentMethodRecord,
  type StoredPlaidPaymentMethod,
} from "./payment-method-repository.js";

const plaidEnvironments = ["sandbox", "production"] as const;

export type PlaidEnvironment = (typeof plaidEnvironments)[number];

export interface CreatePlaidLinkTokenRequest {
  readonly clientUserId: string;
}

export interface PlaidLinkToken {
  readonly linkToken: string;
  readonly expiration: string;
  readonly requestId: string;
}

export interface CompletePlaidPaymentMethodRequest {
  readonly publicToken: string;
  readonly accountId: string;
  readonly clientUserId: string;
  readonly institutionName: string | null;
}

export interface PlaidAccountSummary {
  readonly id: string;
  readonly name: string;
  readonly officialName: string | null;
  readonly mask: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly verificationStatus: string | null;
  readonly canTransferIn: boolean | null;
  readonly canTransferOut: boolean | null;
}

export type PlaidPaymentMethod = PlaidPaymentMethodRecord;

export class PlaidIntegrationError extends Error {
  readonly code: string;
  readonly requestId: string | null;

  constructor(message: string, code: string, requestId: string | null = null) {
    super(message);
    this.name = "PlaidIntegrationError";
    this.code = code;
    this.requestId = requestId;
  }
}

let client: PlaidApi | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new PlaidIntegrationError(
      `Missing required environment variable: ${name}`,
      "PLAID_CONFIGURATION_ERROR",
    );
  }

  return value;
}

function environment(): PlaidEnvironment {
  const value = required("PLAID_ENV");

  if (!(plaidEnvironments as readonly string[]).includes(value)) {
    throw new PlaidIntegrationError(
      `PLAID_ENV must be one of: ${plaidEnvironments.join(", ")}`,
      "PLAID_CONFIGURATION_ERROR",
    );
  }

  if (value === "production") {
    throw new PlaidIntegrationError(
      "Production Plaid token storage requires encryption and is not enabled",
      "PLAID_CONFIGURATION_ERROR",
    );
  }

  return "sandbox";
}

export function getPlaidClient(): PlaidApi {
  if (client) {
    return client;
  }

  const plaidEnvironment = environment();
  const basePath = PlaidEnvironments[plaidEnvironment];

  if (!basePath) {
    throw new PlaidIntegrationError(
      `Plaid SDK does not support environment: ${plaidEnvironment}`,
      "PLAID_CONFIGURATION_ERROR",
    );
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": required("PLAID_CLIENT_ID"),
        "PLAID-SECRET": required("PLAID_SECRET"),
      },
    },
  });

  client = new PlaidApi(configuration);
  return client;
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new PlaidIntegrationError(`${name} is required`, "INVALID_REQUEST");
  }

  return normalized;
}

function plaidError(error: unknown): PlaidIntegrationError {
  if (error instanceof PlaidIntegrationError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;

    if (typeof response === "object" && response !== null && "data" in response) {
      const data = response.data;

      if (typeof data === "object" && data !== null) {
        const code = "error_code" in data ? String(data.error_code) : "PLAID_ERROR";
        const message =
          "error_message" in data
            ? String(data.error_message)
            : "Plaid rejected the request";
        const requestId =
          "request_id" in data ? String(data.request_id) : null;

        return new PlaidIntegrationError(message, code, requestId);
      }
    }
  }

  return new PlaidIntegrationError(
    "Plaid request failed",
    "PLAID_REQUEST_FAILED",
  );
}

export async function createPlaidLinkToken(
  request: CreatePlaidLinkTokenRequest,
): Promise<PlaidLinkToken> {
  try {
    const response = await getPlaidClient().linkTokenCreate({
      client_name: "Payment Flow Lab",
      country_codes: [CountryCode.Us],
      language: "en",
      products: [Products.Auth],
      user: {
        client_user_id: nonEmpty(request.clientUserId, "clientUserId"),
      },
    });

    return {
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
      requestId: response.data.request_id,
    };
  } catch (error) {
    throw plaidError(error);
  }
}

export async function completePlaidPaymentMethod(
  request: CompletePlaidPaymentMethodRequest,
): Promise<PlaidPaymentMethod> {
  try {
    const publicToken = nonEmpty(request.publicToken, "publicToken");
    const accountId = nonEmpty(request.accountId, "accountId");
    const plaidEnvironment = environment();
    const exchange = await getPlaidClient().itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchange.data.access_token;
    const auth = await getPlaidClient().authGet({
      access_token: accessToken,
      options: { account_ids: [accountId] },
    });
    const account = auth.data.accounts.find(
      (candidate) => candidate.account_id === accountId,
    );
    const ach = auth.data.numbers.ach.find(
      (candidate) => candidate.account_id === accountId,
    );

    if (!account || !ach) {
      throw new PlaidIntegrationError(
        "The selected account is not available for US ACH payments",
        "PLAID_AUTH_ACCOUNT_UNAVAILABLE",
        auth.data.request_id,
      );
    }

    const paymentMethod = savePlaidPaymentMethod({
      environment: plaidEnvironment,
      clientUserId: nonEmpty(request.clientUserId, "clientUserId"),
      plaidItemId: exchange.data.item_id,
      accessToken,
      institutionId: auth.data.item.institution_id ?? null,
      institutionName: request.institutionName?.trim() || null,
      account: {
        id: account.account_id,
        name: account.name,
        officialName: account.official_name,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        verificationStatus: account.verification_status ?? null,
        canTransferIn: ach.can_transfer_in ?? null,
        canTransferOut: ach.can_transfer_out ?? null,
      },
    });

    return paymentMethod;
  } catch (error) {
    throw plaidError(error);
  }
}

export function getStoredPlaidPaymentMethod(
  id: string,
): StoredPlaidPaymentMethod | undefined {
  return findStoredPlaidPaymentMethod(id, environment());
}

export function getPlaidPaymentMethodForUser(
  clientUserId: string,
): PlaidPaymentMethod | undefined {
  return findLatestPlaidPaymentMethodForUser(
    nonEmpty(clientUserId, "clientUserId"),
    environment(),
  );
}

export function disconnectPlaidPaymentMethod(
  id: string,
  clientUserId: string,
): boolean {
  return removePlaidPaymentMethod(
    nonEmpty(id, "paymentMethodId"),
    nonEmpty(clientUserId, "clientUserId"),
    environment(),
  );
}

export async function createCheckbookProcessorToken(
  paymentMethodId: string,
  clientUserId: string,
): Promise<string> {
  try {
    const method = findStoredPlaidPaymentMethod(
      nonEmpty(paymentMethodId, "paymentMethodId"),
      environment(),
    );
    if (!method || method.clientUserId !== nonEmpty(clientUserId, "clientUserId")) {
      throw new PlaidIntegrationError("Plaid payment method not found", "PAYMENT_METHOD_NOT_FOUND");
    }
    const response = await getPlaidClient().processorTokenCreate({
      access_token: method.accessToken,
      account_id: method.account.id,
      processor: ProcessorTokenCreateRequestProcessorEnum.Checkbook,
    });
    return response.data.processor_token;
  } catch (error) {
    throw plaidError(error);
  }
}
