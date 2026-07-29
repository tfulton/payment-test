import { randomUUID } from "node:crypto";

import {
  createPlaidLinkToken,
  getDemoEntity,
  PlaidIntegrationError,
} from "@payment-test/payment-api";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const testUserCookie = "payment-test-user";

export async function POST(request: Request) {
  try {
    const body = await optionalJsonBody(request);
    const demoEntityId =
      typeof body?.demoEntityId === "string" ? body.demoEntityId : null;

    if (demoEntityId && !getDemoEntity(demoEntityId)) {
      return NextResponse.json(
        { error: { code: "DEMO_ENTITY_NOT_FOUND", message: "Demo entity not found" } },
        { status: 404 },
      );
    }

    const cookieStore = await cookies();
    const existingUserId = cookieStore.get(testUserCookie)?.value;
    const clientUserId = demoEntityId || existingUserId || randomUUID();
    const token = await createPlaidLinkToken({ clientUserId });
    const response = NextResponse.json(token);

    if (!demoEntityId && !existingUserId) {
      response.cookies.set(testUserCookie, clientUserId, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (error) {
    return plaidErrorResponse(error);
  }
}

async function optionalJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const text = await request.text();

  if (!text) {
    return null;
  }

  const value: unknown = JSON.parse(text);
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function plaidErrorResponse(error: unknown) {
  if (error instanceof PlaidIntegrationError) {
    const status =
      error.code === "PLAID_CONFIGURATION_ERROR" ? 500 : 502;

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId: error.requestId,
        },
      },
      { status },
    );
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Unable to start Plaid Link" } },
    { status: 500 },
  );
}
