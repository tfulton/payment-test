import type { RequestContext, Result } from "@payment-test/common";

export interface PaymentRequest {
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly context: RequestContext;
}

export function submitPayment(request: PaymentRequest): Result<PaymentRequest> {
  return { ok: true, value: request };
}
