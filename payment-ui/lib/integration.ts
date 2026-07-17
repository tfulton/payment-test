import { authenticate, type AuthSession } from "@payment-test/auth";
import type { Result } from "@payment-test/common";
import { submitPayment, type PaymentRequest } from "@payment-test/payment";

export interface IntegrationRequest {
  readonly session: AuthSession;
  readonly payment: PaymentRequest;
}

export function executeIntegration(
  request: IntegrationRequest,
): Result<PaymentRequest> {
  const authentication = authenticate(request.session);

  if (!authentication.ok) {
    return authentication;
  }

  return submitPayment(request.payment);
}
