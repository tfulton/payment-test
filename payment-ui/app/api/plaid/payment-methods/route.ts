import {
  completePlaidPaymentMethod,
  disconnectPlaidPaymentMethod,
  getDemoEntity,
  getPlaidPaymentMethodForUser,
  PlaidIntegrationError,
} from "@payment-test/payment-api";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface PaymentMethodBody {
  readonly publicToken: string;
  readonly accountId: string;
  readonly institutionName: string | null;
  readonly demoEntityId?: string;
}

interface RemovePaymentMethodBody {
  readonly paymentMethodId: string;
  readonly demoEntityId?: string;
}

export async function GET(request: Request) {
  try {
    const demoEntityId = new URL(request.url).searchParams.get("demoEntityId");
    const clientUserId = await resolveClientUserId(demoEntityId);

    if (!clientUserId) {
      return NextResponse.json({ paymentMethod: null });
    }

    return NextResponse.json({
      paymentMethod: getPlaidPaymentMethodForUser(clientUserId) ?? null,
    });
  } catch (error) {
    return plaidPaymentMethodErrorResponse(error, "load");
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isPaymentMethodBody(body)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid Plaid payment method request",
          },
        },
        { status: 400 },
      );
    }

    if (body.demoEntityId && !getDemoEntity(body.demoEntityId)) {
      return NextResponse.json(
        { error: { code: "DEMO_ENTITY_NOT_FOUND", message: "Demo entity not found" } },
        { status: 404 },
      );
    }

    const cookieStore = await cookies();
    const clientUserId =
      body.demoEntityId || cookieStore.get("payment-test-user")?.value;

    if (!clientUserId) {
      return NextResponse.json(
        {
          error: {
            code: "TEST_SESSION_REQUIRED",
            message: "Start a new Plaid Link session and try again",
          },
        },
        { status: 401 },
      );
    }

    const paymentMethod = await completePlaidPaymentMethod({
      ...body,
      clientUserId,
    });

    return NextResponse.json({ paymentMethod });
  } catch (error) {
    if (error instanceof PlaidIntegrationError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            requestId: error.requestId,
          },
        },
        { status: error.code === "INVALID_REQUEST" ? 400 : 502 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to add the Plaid payment method",
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isRemovePaymentMethodBody(body)) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Invalid payment method removal request" } },
        { status: 400 },
      );
    }

    const clientUserId = await resolveClientUserId(body.demoEntityId ?? null);

    if (!clientUserId) {
      return NextResponse.json(
        { error: { code: "TEST_SESSION_REQUIRED", message: "Payment session not found" } },
        { status: 401 },
      );
    }

    const removed = disconnectPlaidPaymentMethod(
      body.paymentMethodId,
      clientUserId,
    );

    if (!removed) {
      return NextResponse.json(
        { error: { code: "PAYMENT_METHOD_NOT_FOUND", message: "Payout account not found" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ removed: true });
  } catch (error) {
    return plaidPaymentMethodErrorResponse(error, "remove");
  }
}

async function resolveClientUserId(
  demoEntityId: string | null,
): Promise<string | undefined> {
  if (demoEntityId) {
    if (!getDemoEntity(demoEntityId)) {
      throw new PlaidIntegrationError("Demo entity not found", "DEMO_ENTITY_NOT_FOUND");
    }

    return demoEntityId;
  }

  const cookieStore = await cookies();
  return cookieStore.get("payment-test-user")?.value;
}

function plaidPaymentMethodErrorResponse(
  error: unknown,
  operation: "load" | "remove",
) {
  if (error instanceof PlaidIntegrationError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId: error.requestId,
        },
      },
      { status: error.code === "DEMO_ENTITY_NOT_FOUND" ? 404 : 502 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: `Unable to ${operation} the Plaid payment method`,
      },
    },
    { status: 500 },
  );
}

function isPaymentMethodBody(value: unknown): value is PaymentMethodBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.publicToken === "string" &&
    typeof candidate.accountId === "string" &&
    (candidate.institutionName === null ||
      typeof candidate.institutionName === "string") &&
    (candidate.demoEntityId === undefined ||
      typeof candidate.demoEntityId === "string")
  );
}

function isRemovePaymentMethodBody(
  value: unknown,
): value is RemovePaymentMethodBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.paymentMethodId === "string" &&
    (candidate.demoEntityId === undefined ||
      typeof candidate.demoEntityId === "string")
  );
}
