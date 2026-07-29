import {
  findOrCreateCheckbookPaymentIntent,
  recordCheckbookPaymentOperation,
  updatePaymentIntentStatus,
  type CheckbookPaymentIntent,
} from "./payment-repository.js";
import { findStoredPlaidPaymentMethod } from "./payment-method-repository.js";

const allowedSandboxHosts = new Set([
  "sandbox.checkbook.io",
  "api.sandbox.checkbook.io",
]);

export class CheckbookIntegrationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 502) {
    super(message);
    this.name = "CheckbookIntegrationError";
    this.code = code;
    this.status = status;
  }
}

export interface CreateCheckbookDigitalPaymentRequest {
  readonly clientUserId: string;
  readonly paymentMethodId: string;
  readonly recipientName: string;
  readonly recipientEmail: string;
  readonly amount: string;
  readonly idempotencyKey: string;
}

export interface CheckbookDigitalPayment {
  readonly id: string;
  readonly providerPaymentId: string;
  readonly providerStatus: string;
  readonly amountMinor: number;
  readonly currency: "USD";
  readonly recipientEmail: string;
  readonly status: CheckbookPaymentIntent["status"];
}

interface CheckbookBank {
  readonly status?: unknown;
}

interface CheckbookUserResponse {
  readonly status?: unknown;
  readonly user?: {
    readonly status?: unknown;
  };
}

interface CheckbookPaymentResponse {
  readonly id?: unknown;
  readonly status?: unknown;
}

export interface CheckbookSandboxPaymentStatus {
  readonly paymentId: string;
  readonly providerStatus: string;
}

export async function createCheckbookDigitalPayment(
  request: CreateCheckbookDigitalPaymentRequest,
): Promise<CheckbookDigitalPayment> {
  const clientUserId = nonEmpty(request.clientUserId, "clientUserId");
  const paymentMethodId = nonEmpty(request.paymentMethodId, "paymentMethodId");
  const recipientName = bounded(request.recipientName, "recipientName", 128);
  const recipientEmail = email(request.recipientEmail);
  const amountMinor = parseUsdAmount(request.amount);
  const idempotencyKey = bounded(
    request.idempotencyKey,
    "idempotencyKey",
    255,
  );
  const paymentMethod = findStoredPlaidPaymentMethod(
    paymentMethodId,
    "sandbox",
  );

  if (!paymentMethod || paymentMethod.clientUserId !== clientUserId) {
    throw new CheckbookIntegrationError(
      "Plaid payment method is not available for this test session",
      "PAYMENT_METHOD_NOT_FOUND",
      404,
    );
  }

  const intent = findOrCreateCheckbookPaymentIntent({
    testUserId: clientUserId,
    amountMinor,
    paymentMethodId,
    recipient: recipientEmail,
    idempotencyKey,
  });

  if (intent.externalId && intent.providerStatus) {
    return toDigitalPayment(intent);
  }

  const user = await checkbookRequest<CheckbookUserResponse>("/v3/user");
  const senderStatus = user.user?.status ?? user.status;

  if (senderStatus !== "VERIFIED") {
    updatePaymentIntentStatus(intent.id, "action_required");
    throw new CheckbookIntegrationError(
      `The configured Checkbook Sandbox sender is ${checkbookStatus(senderStatus)}; complete Checkbook KYC/KYB before sending digital payments`,
      "CHECKBOOK_SENDER_NOT_VERIFIED",
      409,
    );
  }

  const banks = await checkbookRequest<{ readonly banks?: CheckbookBank[] }>(
    "/v3/account/bank",
  );
  const hasVerifiedBank =
    banks.banks?.some((bank) => bank.status === "VERIFIED") ?? false;

  if (!hasVerifiedBank) {
    updatePaymentIntentStatus(intent.id, "action_required");
    throw new CheckbookIntegrationError(
      "The configured Checkbook Sandbox sender has no verified funding bank",
      "CHECKBOOK_FUNDING_SOURCE_REQUIRED",
      409,
    );
  }

  const response = await checkbookRequest<CheckbookPaymentResponse>(
    "/v3/check/digital",
    {
      method: "POST",
      idempotencyKey,
      body: {
        account: required("CHECKBOOK_ACCOUNT_ID"),
        amount: amountMinor / 100,
        name: recipientName,
        recipient: recipientEmail,
      },
    },
  );
  const externalId = stringField(response.id, "payment id");
  const providerStatus = stringField(response.status, "payment status");
  const saved = recordCheckbookPaymentOperation({
    paymentIntentId: intent.id,
    externalId,
    providerStatus,
  });

  return toDigitalPayment(saved);
}

export async function completeCheckbookSandboxPayment(
  paymentId: string,
): Promise<CheckbookSandboxPaymentStatus> {
  const normalizedPaymentId = bounded(paymentId, "paymentId", 128);

  await checkbookRequest<void>(
    `/v3/check/webhook/${encodeURIComponent(normalizedPaymentId)}`,
    {
      method: "PUT",
      body: { status: "PAID" },
    },
  );
  const payment = await checkbookRequest<CheckbookPaymentResponse>(
    `/v3/check/${encodeURIComponent(normalizedPaymentId)}`,
  );
  const providerStatus = stringField(payment.status, "payment status");

  if (providerStatus !== "PAID") {
    throw new CheckbookIntegrationError(
      `Checkbook Sandbox payment is ${providerStatus}, not PAID`,
      "CHECKBOOK_SANDBOX_STATUS_NOT_CONFIRMED",
      409,
    );
  }

  return { paymentId: normalizedPaymentId, providerStatus };
}

async function checkbookRequest<T>(
  path: string,
  options: {
    readonly method?: "POST" | "PUT";
    readonly idempotencyKey?: string;
    readonly body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const baseUrl = checkbookBaseUrl();
  const response = await fetch(new URL(path, baseUrl), {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `${required("CHECKBOOK_PUBLISHABLE_KEY")}:${required("CHECKBOOK_API_SECRET")}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.idempotencyKey
        ? { "idempotency-key": options.idempotencyKey }
        : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = checkbookErrorMessage(data) || "Checkbook rejected the request";
    throw new CheckbookIntegrationError(
      message,
      "CHECKBOOK_REQUEST_FAILED",
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }

  return data as T;
}

function checkbookBaseUrl(): URL {
  let url: URL;

  try {
    url = new URL(required("CHECKBOOK_BASE_URL"));
  } catch {
    throw new CheckbookIntegrationError(
      "CHECKBOOK_BASE_URL must be an absolute URL",
      "CHECKBOOK_CONFIGURATION_ERROR",
      500,
    );
  }

  if (url.protocol !== "https:" || !allowedSandboxHosts.has(url.hostname)) {
    throw new CheckbookIntegrationError(
      "Only Checkbook Sandbox is enabled in this payment lab",
      "CHECKBOOK_CONFIGURATION_ERROR",
      500,
    );
  }

  return url;
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new CheckbookIntegrationError(
      `Missing required environment variable: ${name}`,
      "CHECKBOOK_CONFIGURATION_ERROR",
      500,
    );
  }

  return value;
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new CheckbookIntegrationError(
      `${name} is required`,
      "INVALID_REQUEST",
      400,
    );
  }

  return normalized;
}

function bounded(value: string, name: string, max: number): string {
  const normalized = nonEmpty(value, name);

  if (normalized.length > max) {
    throw new CheckbookIntegrationError(
      `${name} must be ${max} characters or fewer`,
      "INVALID_REQUEST",
      400,
    );
  }

  return normalized;
}

function email(value: string): string {
  const normalized = bounded(value, "recipientEmail", 254).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CheckbookIntegrationError(
      "recipientEmail must be a valid email address",
      "INVALID_REQUEST",
      400,
    );
  }

  return normalized;
}

function parseUsdAmount(value: string): number {
  const normalized = value.trim();

  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new CheckbookIntegrationError(
      "amount must be a positive USD amount with at most two decimal places",
      "INVALID_REQUEST",
      400,
    );
  }

  const [dollars = "0", cents = ""] = normalized.split(".");
  const amountMinor = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));

  if (amountMinor <= 0) {
    throw new CheckbookIntegrationError(
      "amount must be greater than zero",
      "INVALID_REQUEST",
      400,
    );
  }

  return amountMinor;
}

function stringField(value: unknown, description: string): string {
  if (typeof value !== "string" || !value) {
    throw new CheckbookIntegrationError(
      `Checkbook response did not include a ${description}`,
      "CHECKBOOK_INVALID_RESPONSE",
    );
  }

  return value;
}

function checkbookStatus(value: unknown): string {
  return typeof value === "string" && value ? value : "not verified";
}

function checkbookErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  for (const field of ["message", "error", "detail"]) {
    if (typeof candidate[field] === "string") {
      return candidate[field];
    }
  }

  return null;
}

function toDigitalPayment(
  intent: CheckbookPaymentIntent,
): CheckbookDigitalPayment {
  if (!intent.externalId || !intent.providerStatus) {
    throw new Error("Checkbook payment has not been submitted");
  }

  return {
    id: intent.id,
    providerPaymentId: intent.externalId,
    providerStatus: intent.providerStatus,
    amountMinor: intent.amountMinor,
    currency: "USD",
    recipientEmail: intent.recipient,
    status: intent.status,
  };
}
