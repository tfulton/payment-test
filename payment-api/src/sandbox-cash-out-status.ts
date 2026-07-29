import { TransferStatus } from "plaid";

import {
  completeCheckbookSandboxPayment,
  type CheckbookSandboxPaymentStatus,
} from "./checkbook.js";
import {
  DemoCashOutError,
  getDemoCashOutProviderContext,
  getDemoEntity,
  settleDemoCashOut,
  type DemoCashOut,
  type DemoEntity,
} from "./demo-cash-out-repository.js";
import { getPlaidClient, PlaidIntegrationError } from "./plaid.js";

export interface SandboxCashOutCompletion {
  readonly cashOut: DemoCashOut;
  readonly entity: DemoEntity;
  readonly providerStatus: string;
}

export async function completeSandboxDemoCashOut(
  cashOutId: string,
): Promise<SandboxCashOutCompletion> {
  const context = getDemoCashOutProviderContext(cashOutId);

  if (context.status !== "submitted" && context.status !== "succeeded") {
    throw new DemoCashOutError(
      `Cash-out cannot be completed from ${context.status}`,
      "INVALID_CASH_OUT_STATUS",
    );
  }

  let providerStatus: string;
  let requestId: string | undefined;

  if (context.status === "succeeded") {
    providerStatus = context.providerStatus;
  } else if (context.providerPath === "plaid_transfer") {
    const result = await completePlaidSandboxTransfer(
      context.providerExternalId,
    );
    providerStatus = result.providerStatus;
    requestId = result.requestId;
  } else if (context.providerPath === "checkbook_standard") {
    const result: CheckbookSandboxPaymentStatus =
      await completeCheckbookSandboxPayment(context.providerExternalId);
    providerStatus = result.providerStatus;
  } else {
    throw new DemoCashOutError(
      "Sandbox completion is not implemented for this provider path",
      "UNSUPPORTED_PROVIDER_PATH",
    );
  }

  const cashOut = settleDemoCashOut({
    id: context.id,
    providerExternalId: context.providerExternalId,
    providerStatus,
    ...(requestId ? { requestId } : {}),
  });
  const entity = getDemoEntity(cashOut.demoEntityId);

  if (!entity) {
    throw new DemoCashOutError(
      "Demo entity not found after settlement",
      "DEMO_ENTITY_NOT_FOUND",
    );
  }

  return { cashOut, entity, providerStatus };
}

async function completePlaidSandboxTransfer(transferId: string): Promise<{
  readonly providerStatus: string;
  readonly requestId: string;
}> {
  if (process.env.PLAID_ENV?.trim() !== "sandbox") {
    throw new PlaidIntegrationError(
      "Plaid transfer simulation is restricted to Sandbox",
      "PLAID_SANDBOX_REQUIRED",
    );
  }

  const client = getPlaidClient();
  let transferResponse = await client.transferGet({ transfer_id: transferId });
  let status = transferResponse.data.transfer.status;
  let requestId = transferResponse.data.request_id;

  if (status === TransferStatus.Pending) {
    const simulated = await client.sandboxTransferSimulate({
      transfer_id: transferId,
      event_type: TransferStatus.Posted,
    });
    requestId = simulated.data.request_id;
    transferResponse = await client.transferGet({ transfer_id: transferId });
    status = transferResponse.data.transfer.status;
  }

  if (status === TransferStatus.Posted) {
    const simulated = await client.sandboxTransferSimulate({
      transfer_id: transferId,
      event_type: TransferStatus.Settled,
    });
    requestId = simulated.data.request_id;
    transferResponse = await client.transferGet({ transfer_id: transferId });
    status = transferResponse.data.transfer.status;
  }

  if (status !== TransferStatus.Settled) {
    throw new PlaidIntegrationError(
      `Plaid Sandbox transfer is ${status}, not settled`,
      "PLAID_SANDBOX_STATUS_NOT_CONFIRMED",
      requestId,
    );
  }

  return { providerStatus: status, requestId };
}
