import {
  CheckbookIntegrationError,
  createCheckbookDigitalPayment,
  DemoCashOutError,
  getDemoEntity,
  markDemoCashOutActionRequired,
  markDemoCashOutSubmitted,
  releaseDemoCashOut,
  reserveDemoCashOut,
} from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface DigitalPaymentBody {
  readonly paymentMethodId: string;
  readonly demoEntityId: string;
  readonly recipientEmail: string;
  readonly amount: string;
  readonly idempotencyKey: string;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isDigitalPaymentBody(body)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid Checkbook digital payment request",
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
      providerPath: "checkbook_standard",
      amountMinor: parseUsdAmount(body.amount),
      idempotencyKey: body.idempotencyKey,
      paymentMethodId: body.paymentMethodId,
    });

    try {
      const payment = await createCheckbookDigitalPayment({
        paymentMethodId: body.paymentMethodId,
        clientUserId: entity.id,
        recipientName: entity.displayName,
        recipientEmail: body.recipientEmail,
        amount: body.amount,
        idempotencyKey: body.idempotencyKey,
      });
      const submittedCashOut = markDemoCashOutSubmitted(cashOut.id, payment.id);

      return NextResponse.json(
        {
          payment,
          cashOut: submittedCashOut,
          entity: getDemoEntity(entity.id),
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof CheckbookIntegrationError) {
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

    if (error instanceof CheckbookIntegrationError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to create the Checkbook digital payment",
        },
      },
      { status: 500 },
    );
  }
}

function isDigitalPaymentBody(value: unknown): value is DigitalPaymentBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.paymentMethodId === "string" &&
    typeof candidate.demoEntityId === "string" &&
    typeof candidate.recipientEmail === "string" &&
    typeof candidate.amount === "string" &&
    typeof candidate.idempotencyKey === "string"
  );
}

function parseUsdAmount(value: string): number {
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new CheckbookIntegrationError(
      "amount must be a positive USD amount with at most two decimal places",
      "INVALID_REQUEST",
      400,
    );
  }

  const [dollars = "0", cents = ""] = value.trim().split(".");
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
