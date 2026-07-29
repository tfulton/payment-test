import type { RequestContext, Result } from "@payment-test/common";

export {
  completePlaidPaymentMethod,
  createPlaidLinkToken,
  disconnectPlaidPaymentMethod,
  getPlaidPaymentMethodForUser,
  getStoredPlaidPaymentMethod,
  PlaidIntegrationError,
  createCheckbookProcessorToken,
} from "./plaid.js";

export {
  adjustMarketplaceBalance,
  attachMarketplacePaymentMethod,
  CheckbookMarketplaceError,
  getMarketplaceLabState,
  provisionMarketplaceParticipant,
  provisionMarketplaceTreasury,
  registerMarketplaceTreasuryUser,
  refreshMarketplaceWallet,
  syncMarketplaceWallet,
} from "./checkbook-marketplace.js";
export type { MarketplaceParticipant, MarketplaceLedgerEntry, MarketplaceTreasury, MarketplaceTreasuryUser } from "./checkbook-marketplace-repository.js";
export {
  addIsdLedgerAdjustment,
  getExpectedMarketplaceWalletBalance,
  getIsdLedgerBalance,
  listIsdLedgerEntries,
} from "./isd-ledger-repository.js";
export type { IsdLedgerBalance, IsdLedgerBucket, IsdLedgerEntry } from "./isd-ledger-repository.js";
export type {
  CompletePlaidPaymentMethodRequest,
  CreatePlaidLinkTokenRequest,
  PlaidAccountSummary,
  PlaidEnvironment,
  PlaidLinkToken,
  PlaidPaymentMethod,
} from "./plaid.js";

export { createPlaidTransfer } from "./plaid-transfer.js";
export type {
  CreatePlaidTransferRequest,
  PlaidTransferPayment,
} from "./plaid-transfer.js";
export type {
  PlaidAccountHolderType,
  PlaidTransferDirection,
  PlaidTransferNetwork,
} from "./plaid-transfer-repository.js";

export {
  CheckbookIntegrationError,
  completeCheckbookSandboxPayment,
  createCheckbookDigitalPayment,
} from "./checkbook.js";
export type {
  CheckbookDigitalPayment,
  CheckbookSandboxPaymentStatus,
  CreateCheckbookDigitalPaymentRequest,
} from "./checkbook.js";

export { completeSandboxDemoCashOut } from "./sandbox-cash-out-status.js";
export type { SandboxCashOutCompletion } from "./sandbox-cash-out-status.js";

export {
  DemoCashOutError,
  getDemoEntity,
  getDemoCashOutProviderContext,
  listDemoEntities,
  listDemoCashOutsForEntity,
  markDemoCashOutActionRequired,
  markDemoCashOutSubmitted,
  releaseDemoCashOut,
  reserveDemoCashOut,
  settleDemoCashOut,
} from "./demo-cash-out-repository.js";
export type {
  DemoCashOut,
  DemoCashOutHistoryEntry,
  DemoCashOutProviderContext,
  DemoCashOutStatus,
  DemoEntity,
  DemoEntityBalance,
  DemoEntityType,
  DemoProviderPath,
} from "./demo-cash-out-repository.js";

export interface PaymentSession {
  readonly accessToken: string;
  readonly context: RequestContext;
}

export interface PaymentRequest {
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly context: RequestContext;
}

export interface PaymentSubmission {
  readonly session: PaymentSession;
  readonly payment: PaymentRequest;
}

export function processPayment(
  submission: PaymentSubmission,
): Result<PaymentRequest> {
  return { ok: true, value: submission.payment };
}
