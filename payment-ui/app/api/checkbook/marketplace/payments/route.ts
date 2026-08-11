import {
  CheckbookMarketplaceError,
  createMarketplaceCashOut,
  DemoCashOutError,
  getDemoEntity,
  getMarketplaceLabState,
  getMarketplaceCashOutByIdempotencyKey,
  markDemoCashOutActionRequired,
  markDemoCashOutSubmitted,
  releaseDemoCashOut,
  reserveDemoCashOut,
} from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface MarketplaceCashOutBody {
  readonly demoEntityId: string;
  readonly paymentMethodId: string;
  readonly amount: string;
  readonly idempotencyKey: string;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isMarketplaceCashOutBody(body)) return failure(
      "Invalid Checkbook Marketplace cash-out request", "INVALID_REQUEST", 400,
    );
    const entity = getDemoEntity(body.demoEntityId);
    if (!entity) return failure("Demo entity not found", "DEMO_ENTITY_NOT_FOUND", 404);

    const cashOut = reserveDemoCashOut({
      demoEntityId: entity.id,
      providerPath: "checkbook_marketplace",
      amountMinor: parseUsdAmount(body.amount),
      idempotencyKey: body.idempotencyKey,
      paymentMethodId: body.paymentMethodId,
    });
    try {
      const payment = await createMarketplaceCashOut({
        demoEntityId: entity.id,
        paymentMethodId: body.paymentMethodId,
        amountMinor: cashOut.amountMinor,
        idempotencyKey: body.idempotencyKey,
      });
      const submittedCashOut = markDemoCashOutSubmitted(cashOut.id, payment.intent.id);
      return NextResponse.json({
        payment,
        cashOut: submittedCashOut,
        state: getMarketplaceLabState(entity.id),
      }, { status: 201 });
    } catch (cause) {
      const intent = getMarketplaceCashOutByIdempotencyKey(body.idempotencyKey);
      if (intent?.walletFunding || intent?.bankPayout) {
        markDemoCashOutSubmitted(cashOut.id, intent.id);
        markDemoCashOutActionRequired(cashOut.id);
      } else if (
        cause instanceof CheckbookMarketplaceError &&
        cause.reservationDisposition === "release"
      ) {
        releaseDemoCashOut(cashOut.id);
      } else {
        markDemoCashOutActionRequired(cashOut.id);
      }
      throw cause;
    }
  } catch (cause) {
    if (cause instanceof DemoCashOutError) return failure(
      cause.message, cause.code, cause.code === "DEMO_ENTITY_NOT_FOUND" ? 404 : 409,
    );
    if (cause instanceof CheckbookMarketplaceError) return failure(
      cause.message, cause.code, cause.status,
    );
    console.error(cause);
    return failure("Unable to submit the Marketplace cash-out", "INTERNAL_ERROR", 500);
  }
}

function isMarketplaceCashOutBody(value: unknown): value is MarketplaceCashOutBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.demoEntityId === "string" &&
    typeof body.paymentMethodId === "string" &&
    typeof body.amount === "string" &&
    typeof body.idempotencyKey === "string";
}

function parseUsdAmount(value: string): number {
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new CheckbookMarketplaceError(
      "amount must be a positive USD amount with at most two decimal places",
      "INVALID_REQUEST", 400,
    );
  }
  const [dollars = "0", cents = ""] = value.trim().split(".");
  const amountMinor = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  if (amountMinor <= 0) throw new CheckbookMarketplaceError(
    "amount must be greater than zero", "INVALID_REQUEST", 400,
  );
  return amountMinor;
}

function failure(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}
