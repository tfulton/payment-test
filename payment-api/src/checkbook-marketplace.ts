import { getDemoEntity } from "./demo-cash-out-repository.js";
import {
  addMarketplaceAdjustment,
  completeMarketplaceWalletSync,
  findOrCreateMarketplaceWalletSync,
  getMarketplaceCredentials,
  getMarketplaceParticipant,
  getMarketplaceTreasury,
  getMarketplaceTreasuryCredentials,
  getMarketplaceTreasuryUser,
  listMarketplaceLedger,
  marketplaceLedgerBalance,
  recordMarketplaceWalletSyncOperation,
  saveMarketplaceParticipant,
  saveMarketplacePaymentMethod,
  saveMarketplaceWallet,
  saveMarketplaceTreasury,
  saveMarketplaceTreasuryUser,
  updateMarketplaceParticipantStatus,
  type MarketplaceParticipant,
} from "./checkbook-marketplace-repository.js";
import { createCheckbookProcessorToken, PlaidIntegrationError } from "./plaid.js";

const allowedSandboxHosts = new Set(["sandbox.checkbook.io", "api.sandbox.checkbook.io"]);

export class CheckbookMarketplaceError extends Error {
  constructor(message: string, readonly code: string, readonly status = 502) {
    super(message);
    this.name = "CheckbookMarketplaceError";
  }
}

interface UserResponse { id?: unknown; key?: unknown; secret?: unknown; user_id?: unknown; status?: unknown; user?: { status?: unknown }; }
interface WalletResponse { id?: unknown; name?: unknown; balance?: unknown; }
interface BankResponse { id?: unknown; status?: unknown; }
interface PlaidIavResponse {
  accounts?: Array<{ account?: unknown; name?: unknown; routing?: unknown }>;
}
interface DigitalPaymentResponse { id?: unknown; status?: unknown; }

export function getMarketplaceLabState(demoEntityId: string) {
  const entity = getDemoEntity(demoEntityId);
  if (!entity) throw new CheckbookMarketplaceError("Demo entity not found", "DEMO_ENTITY_NOT_FOUND", 404);
  const participant = getMarketplaceParticipant(demoEntityId);
  const expectedWalletBalanceMinor = marketplaceLedgerBalance(demoEntityId);
  const actualWalletBalanceMinor = participant?.wallet?.providerBalanceMinor ?? null;
  return {
    entity,
    participant,
    ledgerBalanceMinor: entity.balance.availableMinor,
    expectedWalletBalanceMinor,
    walletVarianceMinor:
      actualWalletBalanceMinor === null
        ? null
        : actualWalletBalanceMinor - expectedWalletBalanceMinor,
    ledger: listMarketplaceLedger(demoEntityId),
    treasury: getMarketplaceTreasury(),
    treasuryUser: getMarketplaceTreasuryUser(),
  };
}

export async function provisionMarketplaceParticipant(demoEntityId: string): Promise<MarketplaceParticipant> {
  const entity = getDemoEntity(demoEntityId);
  if (!entity) throw new CheckbookMarketplaceError("Demo entity not found", "DEMO_ENTITY_NOT_FOUND", 404);
  const existing = getMarketplaceParticipant(demoEntityId);
  if (existing) return refreshMarketplaceWallet(demoEntityId);

  const user = await request<UserResponse>("/v3/user", ownerCredentials(), {
    method: "POST", body: { name: entity.displayName, user_id: demoUserRef(entity.id) },
  });
  const key = field(user.key, "Marketplace user key");
  const secret = field(user.secret, "Marketplace user secret");
  const userId = field(user.id, "Marketplace user id");
  const userRef = field(user.user_id, "Marketplace user reference");
  saveMarketplaceParticipant({ demoEntityId, userId, userRef, key, secret, status: "CREATED" });

  const credentials = { key, secret };
  await request<void>("/v3/user/webhook", credentials, { method: "PUT", body: { status: "VERIFIED" } });
  updateMarketplaceParticipantStatus(demoEntityId, "VERIFIED");
  const wallet = await request<WalletResponse>("/v3/account/wallet", credentials, {
    method: "POST", body: { name: `${entity.displayName} Wallet`, type: "INTERNAL" },
  });
  saveMarketplaceWallet({
    demoEntityId, id: field(wallet.id, "wallet id"),
    name: typeof wallet.name === "string" ? wallet.name : null,
    balanceMinor: moneyMinor(wallet.balance),
  });
  return getMarketplaceParticipant(demoEntityId)!;
}

export async function provisionMarketplaceTreasury() {
  const existing = getMarketplaceTreasury();
  const credentials = treasuryCredentials();
  if (!existing) {
    const wallet = await request<WalletResponse>("/v3/account/wallet", credentials, {
      method: "POST", body: { name: "ISD Marketplace Treasury", type: "INTERNAL" },
    });
    saveMarketplaceTreasury({ id: field(wallet.id, "treasury wallet id"), name: typeof wallet.name === "string" ? wallet.name : null, balanceMinor: moneyMinor(wallet.balance) });
  }
  const wallets = await request<{ wallets?: WalletResponse[] }>("/v3/account/wallet", credentials);
  const id = getMarketplaceTreasury()?.id;
  const treasury = wallets.wallets?.find((wallet) => wallet.id === id);
  if (treasury) saveMarketplaceTreasury({ id: field(treasury.id, "treasury wallet id"), name: typeof treasury.name === "string" ? treasury.name : null, balanceMinor: moneyMinor(treasury.balance) });
  return getMarketplaceTreasury();
}

export async function registerMarketplaceTreasuryUser(input: {
  userId: string; userRef: string; key: string; secret: string;
}) {
  const userId = bounded(input.userId, "userId", 80);
  const userRef = bounded(input.userRef, "userRef", 80);
  const key = bounded(input.key, "key", 128);
  const secret = bounded(input.secret, "secret", 256);
  const ownerUsers = await request<{ users?: UserResponse[] }>("/v3/user/list", ownerCredentials());
  const ownedUser = ownerUsers.users?.find(
    (user) => user.id === userId && user.user_id === userRef,
  );
  if (!ownedUser) throw new CheckbookMarketplaceError(
    "The supplied treasury user is not owned by the configured Checkbook Marketplace account",
    "TREASURY_USER_MISMATCH", 409,
  );
  const credentials = { key, secret };
  const current = await request<UserResponse>("/v3/user", credentials);
  let status = stringStatus(current.user?.status ?? current.status);
  if (status !== "VERIFIED") {
    await request<void>("/v3/user/webhook", credentials, {
      method: "PUT", body: { status: "VERIFIED" },
    });
    status = "VERIFIED";
  }
  const wallets = await request<{ wallets?: WalletResponse[] }>("/v3/account/wallet", credentials);
  const wallet = wallets.wallets
    ?.filter((candidate) => typeof candidate.id === "string")
    .sort((left, right) => (moneyMinor(right.balance) ?? -1) - (moneyMinor(left.balance) ?? -1))[0];
  if (!wallet) throw new CheckbookMarketplaceError(
    "The treasury Marketplace user has no wallet",
    "TREASURY_WALLET_REQUIRED", 409,
  );
  saveMarketplaceTreasuryUser({ userId, userRef, key, secret, status });
  saveMarketplaceTreasury({
    id: field(wallet.id, "treasury wallet id"),
    name: typeof wallet.name === "string" ? wallet.name : null,
    balanceMinor: moneyMinor(wallet.balance),
  });
  return { treasuryUser: getMarketplaceTreasuryUser(), treasury: getMarketplaceTreasury() };
}

export async function refreshMarketplaceWallet(demoEntityId: string): Promise<MarketplaceParticipant> {
  const credentials = requiredParticipantCredentials(demoEntityId);
  const data = await request<{ wallets?: WalletResponse[] }>("/v3/account/wallet", credentials);
  const wallet = data.wallets?.[0];
  if (wallet) saveMarketplaceWallet({
    demoEntityId, id: field(wallet.id, "wallet id"),
    name: typeof wallet.name === "string" ? wallet.name : null,
    balanceMinor: moneyMinor(wallet.balance),
  });
  return getMarketplaceParticipant(demoEntityId)!;
}

export async function syncMarketplaceWallet(demoEntityId: string) {
  const entity = getDemoEntity(demoEntityId);
  if (!entity) throw new CheckbookMarketplaceError("Demo entity not found", "DEMO_ENTITY_NOT_FOUND", 404);
  await provisionMarketplaceTreasury();
  await refreshMarketplaceWallet(demoEntityId);
  const state = getMarketplaceLabState(demoEntityId);
  const participant = state.participant;
  const treasury = state.treasury;
  if (!participant?.wallet) throw new CheckbookMarketplaceError("Provision the Marketplace wallet first", "MARKETPLACE_WALLET_REQUIRED", 409);
  if (!treasury || treasury.providerBalanceMinor === null) throw new CheckbookMarketplaceError("The ISD treasury wallet balance is unavailable", "TREASURY_BALANCE_UNAVAILABLE", 409);
  const actual = participant.wallet.providerBalanceMinor ?? 0;
  const delta = state.expectedWalletBalanceMinor - actual;
  if (delta === 0) return state;
  if (delta < 0) throw new CheckbookMarketplaceError(
    `The Checkbook wallet exceeds the ISD target by ${usd(-delta)}. Return-to-treasury reconciliation is required.`,
    "WALLET_EXCEEDS_LEDGER", 409,
  );
  if (treasury.providerBalanceMinor < delta) throw new CheckbookMarketplaceError(
    `The ISD treasury needs ${usd(delta)} but has ${usd(treasury.providerBalanceMinor)}`,
    "INSUFFICIENT_TREASURY_BALANCE", 409,
  );

  const intent = findOrCreateMarketplaceWalletSync({
    demoEntityId, walletId: participant.wallet.id, amountMinor: delta,
    idempotencyKey: `marketplace-wallet-sync:${demoEntityId}:${state.expectedWalletBalanceMinor}`,
  });
  if (intent.status === "succeeded") return getMarketplaceLabState(demoEntityId);

  let paymentId = intent.externalId;
  let providerStatus = intent.providerStatus;
  if (!paymentId) {
    const payment = await request<DigitalPaymentResponse>("/v3/check/digital", treasuryCredentials(), {
      method: "POST",
      idempotencyKey: `marketplace-wallet-sync:${intent.id}`,
      body: {
        name: entity.displayName, amount: delta / 100, account: treasury.id,
        recipient: participant.checkbookUserRef, deposit_options: ["WALLET"],
      },
    });
    paymentId = field(payment.id, "wallet-funding payment id");
    providerStatus = field(payment.status, "wallet-funding payment status");
    recordMarketplaceWalletSyncOperation({ intentId: intent.id, externalId: paymentId, providerStatus });
  }

  if (providerStatus === "UNPAID") {
    const deposited = await request<DigitalPaymentResponse>(
      `/v3/check/deposit/${encodeURIComponent(paymentId)}`,
      requiredParticipantCredentials(demoEntityId),
      { method: "POST", body: { account: participant.wallet.id } },
    );
    providerStatus = field(deposited.status, "wallet deposit status");
  } else if (providerStatus !== "PAID") {
    const payment = await request<DigitalPaymentResponse>(
      `/v3/check/${encodeURIComponent(paymentId)}`,
      treasuryCredentials(),
    );
    providerStatus = field(payment.status, "wallet-funding payment status");
  }

  recordMarketplaceWalletSyncOperation({ intentId: intent.id, externalId: paymentId, providerStatus });
  if (providerStatus !== "PAID") throw new CheckbookMarketplaceError(
    `Checkbook wallet funding is ${providerStatus}; retry reconciliation after it completes`,
    "WALLET_FUNDING_PENDING", 409,
  );
  completeMarketplaceWalletSync({ intentId: intent.id, demoEntityId, amountMinor: delta, externalId: paymentId, providerStatus });
  await Promise.all([provisionMarketplaceTreasury(), refreshMarketplaceWallet(demoEntityId)]);
  return getMarketplaceLabState(demoEntityId);
}

export async function attachMarketplacePaymentMethod(demoEntityId: string, paymentMethodId: string): Promise<MarketplaceParticipant> {
  const credentials = requiredParticipantCredentials(demoEntityId);
  let token: string;
  try {
    token = await createCheckbookProcessorToken(paymentMethodId, demoEntityId);
  } catch (cause) {
    if (cause instanceof PlaidIntegrationError) {
      throw new CheckbookMarketplaceError(
        `${cause.message}${cause.requestId ? ` (Plaid request ${cause.requestId})` : ""}`,
        cause.code,
        cause.code === "PAYMENT_METHOD_NOT_FOUND" ? 404 : 409,
      );
    }
    throw cause;
  }
  const iav = await request<PlaidIavResponse>("/v3/account/bank/iav/plaid", credentials, {
    method: "POST", body: { processor_token: token },
  });
  const account = iav.accounts?.[0];
  if (!account) {
    throw new CheckbookMarketplaceError(
      "Checkbook did not return an account from Plaid IAV",
      "CHECKBOOK_INVALID_RESPONSE",
    );
  }
  const bank = await request<BankResponse>("/v3/account/bank", credentials, {
    method: "POST",
    body: {
      type: "CHECKING",
      account: field(account.account, "Plaid-IAV account"),
      routing: field(account.routing, "Plaid-IAV routing number"),
    },
  });
  const bankId = field(bank.id, "Checkbook bank id");
  const status = typeof bank.status === "string" ? bank.status : "VERIFIED";
  saveMarketplacePaymentMethod({ demoEntityId, paymentMethodId, bankId, status });
  return getMarketplaceParticipant(demoEntityId)!;
}

export function adjustMarketplaceBalance(input: { demoEntityId: string; amount: string; reason: string }) {
  getMarketplaceLabState(input.demoEntityId);
  const amountMinor = parseSignedUsd(input.amount);
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 240) throw new CheckbookMarketplaceError("Adjustment reason must be 3–240 characters", "INVALID_REQUEST", 400);
  addMarketplaceAdjustment({ demoEntityId: input.demoEntityId, amountMinor, reason });
  return getMarketplaceLabState(input.demoEntityId);
}

function ownerCredentials() { return { key: required("CHECKBOOK_PUBLISHABLE_KEY"), secret: required("CHECKBOOK_API_SECRET") }; }
function treasuryCredentials() { return getMarketplaceTreasuryCredentials() ?? ownerCredentials(); }
function requiredParticipantCredentials(id: string) {
  const credentials = getMarketplaceCredentials(id);
  if (!credentials) throw new CheckbookMarketplaceError("Provision the Marketplace user first", "MARKETPLACE_USER_REQUIRED", 409);
  return credentials;
}

async function request<T>(path: string, credentials: { key: string; secret: string }, options: { method?: "POST" | "PUT"; body?: Record<string, unknown>; idempotencyKey?: string } = {}): Promise<T> {
  const base = baseUrl();
  const response = await fetch(new URL(path, base), {
    method: options.method ?? "GET",
    headers: { accept: "application/json", authorization: `${credentials.key}:${credentials.secret}`, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data ? String(data.message) : "Checkbook rejected the Marketplace request";
    throw new CheckbookMarketplaceError(message, "CHECKBOOK_MARKETPLACE_REQUEST_FAILED", response.status >= 400 && response.status < 500 ? response.status : 502);
  }
  return data as T;
}

function baseUrl(): URL {
  const url = new URL(required("CHECKBOOK_BASE_URL"));
  if (url.protocol !== "https:" || !allowedSandboxHosts.has(url.hostname)) throw new CheckbookMarketplaceError("Only Checkbook Sandbox is enabled", "CHECKBOOK_CONFIGURATION_ERROR", 500);
  return url;
}
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new CheckbookMarketplaceError(`Missing required environment variable: ${name}`, "CHECKBOOK_CONFIGURATION_ERROR", 500); return value; }
function field(value: unknown, name: string): string { if (typeof value !== "string" || !value) throw new CheckbookMarketplaceError(`Checkbook response did not include ${name}`, "CHECKBOOK_INVALID_RESPONSE"); return value; }
function bounded(value: string, name: string, max: number): string { const normalized = value.trim(); if (!normalized || normalized.length > max) throw new CheckbookMarketplaceError(`${name} must be 1–${max} characters`, "INVALID_REQUEST", 400); return normalized; }
function stringStatus(value: unknown): string { return typeof value === "string" && value ? value : "UNVERIFIED"; }
function demoUserRef(id: string): string { return `tfulton+${id}@isheepdog.com`; }
function moneyMinor(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null; }
function parseSignedUsd(value: string): number { if (!/^-?\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new CheckbookMarketplaceError("Enter a valid USD amount", "INVALID_REQUEST", 400); const minor = Math.round(Number(value) * 100); if (!Number.isSafeInteger(minor) || minor === 0) throw new CheckbookMarketplaceError("Adjustment cannot be zero", "INVALID_REQUEST", 400); return minor; }
function usd(minor: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100); }
