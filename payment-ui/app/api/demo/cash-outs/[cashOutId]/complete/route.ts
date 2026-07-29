import {
  CheckbookIntegrationError,
  completeSandboxDemoCashOut,
  DemoCashOutError,
  PlaidIntegrationError,
} from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ readonly cashOutId: string }> },
) {
  try {
    const { cashOutId } = await context.params;
    const completion = await completeSandboxDemoCashOut(cashOutId);

    return NextResponse.json(completion);
  } catch (error) {
    if (error instanceof DemoCashOutError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        {
          status:
            error.code === "DEMO_CASH_OUT_NOT_FOUND" ||
            error.code === "DEMO_ENTITY_NOT_FOUND"
              ? 404
              : 409,
        },
      );
    }

    if (error instanceof CheckbookIntegrationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
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
        {
          status:
            error.code === "PLAID_SANDBOX_STATUS_NOT_CONFIRMED" ? 409 : 502,
        },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to complete the Sandbox cash-out",
        },
      },
      { status: 500 },
    );
  }
}
