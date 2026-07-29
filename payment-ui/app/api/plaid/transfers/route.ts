import {
  createPlaidTransfer,
  DemoCashOutError,
  getDemoEntity,
  markDemoCashOutActionRequired,
  markDemoCashOutSubmitted,
  PlaidIntegrationError,
  releaseDemoCashOut,
  reserveDemoCashOut,
} from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface PlaidTransferBody {
  readonly paymentMethodId: string;
  readonly demoEntityId: string;
  readonly amount: string;
  readonly network: "ach";
  readonly idempotencyKey: string;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isPlaidTransferBody(body)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid Plaid Transfer request",
          },
        },
        { status: 400 },
      );
    }

    const entity = getDemoEntity(body.demoEntityId);

    if (!entity) {
      return NextResponse.json(
        {
          error: {
            code: "DEMO_ENTITY_NOT_FOUND",
            message: "Demo entity not found",
          },
        },
        { status: 404 },
      );
    }

    const cashOut = reserveDemoCashOut({
      demoEntityId: entity.id,
      providerPath: "plaid_transfer",
      amountMinor: parseUsdAmount(body.amount),
      idempotencyKey: body.idempotencyKey,
      paymentMethodId: body.paymentMethodId,
    });

    try {
      const transfer = await createPlaidTransfer({
        paymentMethodId: body.paymentMethodId,
        clientUserId: entity.id,
        direction: "receive",
        legalName: entity.displayName,
        accountHolderType: entity.accountHolderType,
        amount: body.amount,
        network: "ach",
        idempotencyKey: body.idempotencyKey,
        debitAuthorizationAccepted: false,
      });
      const submittedCashOut = markDemoCashOutSubmitted(cashOut.id, transfer.id);

      return NextResponse.json(
        {
          transfer,
          cashOut: submittedCashOut,
          entity: getDemoEntity(entity.id),
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof PlaidIntegrationError) {
        releaseDemoCashOut(cashOut.id);
      } else {
        markDemoCashOutActionRequired(cashOut.id);
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof DemoCashOutError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "DEMO_ENTITY_NOT_FOUND" ? 404 : 409 },
      );
    }

    if (error instanceof PlaidIntegrationError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            requestId: error.requestId,
          },
        },
        { status: plaidTransferErrorStatus(error.code) },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to create the Plaid transfer",
        },
      },
      { status: 500 },
    );
  }
}

function isPlaidTransferBody(value: unknown): value is PlaidTransferBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.paymentMethodId === "string" &&
    typeof candidate.demoEntityId === "string" &&
    typeof candidate.amount === "string" &&
    candidate.network === "ach" &&
    typeof candidate.idempotencyKey === "string"
  );
}

function parseUsdAmount(value: string): number {
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new PlaidIntegrationError(
      "amount must be a positive USD amount with at most two decimal places",
      "INVALID_REQUEST",
    );
  }

  const [dollars = "0", cents = ""] = value.trim().split(".");
  const amountMinor = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));

  if (amountMinor <= 0) {
    throw new PlaidIntegrationError("amount must be greater than zero", "INVALID_REQUEST");
  }

  return amountMinor;
}

function plaidTransferErrorStatus(code: string): number {
  if (code === "INVALID_REQUEST") {
    return 400;
  }

  if (code === "PAYMENT_METHOD_NOT_FOUND") {
    return 404;
  }

  if (code === "INSUFFICIENT_DEMO_BALANCE") {
    return 409;
  }

  if (
    code === "PLAID_TRANSFER_ACTION_REQUIRED" ||
    code === "PLAID_TRANSFER_DECLINED" ||
    code === "PLAID_TRANSFER_DIRECTION_UNAVAILABLE" ||
    code === "IDEMPOTENCY_CONFLICT"
  ) {
    return 409;
  }

  return 502;
}
