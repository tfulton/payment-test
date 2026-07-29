import type { Result } from "@payment-test/common";
import {
  processPayment,
  type PaymentRequest,
  type PaymentSubmission,
} from "@payment-test/payment-api";

export function executeIntegration(
  request: PaymentSubmission,
): Result<PaymentRequest> {
  return processPayment(request);
}
