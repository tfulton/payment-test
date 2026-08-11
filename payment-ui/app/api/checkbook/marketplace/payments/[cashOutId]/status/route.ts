import {
  CheckbookMarketplaceError,
  DemoCashOutError,
  getMarketplaceLabState,
  refreshMarketplaceCashOutStatus,
} from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ cashOutId: string }> },
) {
  try {
    const { cashOutId } = await context.params;
    const result = await refreshMarketplaceCashOutStatus(cashOutId);
    return NextResponse.json({
      result,
      state: getMarketplaceLabState(result.cashOut.demoEntityId),
    });
  } catch (cause) {
    if (cause instanceof DemoCashOutError) return failure(cause.message, cause.code, 409);
    if (cause instanceof CheckbookMarketplaceError) return failure(cause.message, cause.code, cause.status);
    console.error(cause);
    return failure("Unable to refresh the Marketplace payment status", "INTERNAL_ERROR", 500);
  }
}

function failure(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}
