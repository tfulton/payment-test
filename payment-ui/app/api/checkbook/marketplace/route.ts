import {
  adjustMarketplaceBalance,
  attachMarketplacePaymentMethod,
  CheckbookMarketplaceError,
  getMarketplaceLabState,
  provisionMarketplaceParticipant,
  provisionMarketplaceTreasury,
  refreshMarketplaceWallet,
  registerMarketplaceTreasuryUser,
  syncMarketplaceWallet,
} from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("demoEntityId");
    if (!id) return error("demoEntityId is required", "INVALID_REQUEST", 400);
    return NextResponse.json(getMarketplaceLabState(id));
  } catch (cause) { return marketplaceError(cause); }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return error("Invalid Marketplace request", "INVALID_REQUEST", 400);
    const value = body as Record<string, unknown>;
    const id = typeof value.demoEntityId === "string" ? value.demoEntityId : "";
    switch (value.action) {
      case "provision":
        await provisionMarketplaceParticipant(id);
        break;
      case "refresh":
        await refreshMarketplaceWallet(id);
        break;
      case "provision_treasury":
        await provisionMarketplaceTreasury();
        break;
      case "sync_wallet":
        return NextResponse.json(await syncMarketplaceWallet(id));
      case "register_treasury":
        if (
          typeof value.userId !== "string" || typeof value.userRef !== "string" ||
          typeof value.key !== "string" || typeof value.secret !== "string"
        ) return error("Treasury user credentials are required", "INVALID_REQUEST", 400);
        await registerMarketplaceTreasuryUser({
          userId: value.userId, userRef: value.userRef,
          key: value.key, secret: value.secret,
        });
        break;
      case "attach_payment_method":
        if (typeof value.paymentMethodId !== "string") return error("paymentMethodId is required", "INVALID_REQUEST", 400);
        await attachMarketplacePaymentMethod(id, value.paymentMethodId);
        break;
      case "adjust":
        if (typeof value.amount !== "string" || typeof value.reason !== "string") return error("amount and reason are required", "INVALID_REQUEST", 400);
        return NextResponse.json(adjustMarketplaceBalance({ demoEntityId: id, amount: value.amount, reason: value.reason }));
      default:
        return error("Unknown Marketplace action", "INVALID_REQUEST", 400);
    }
    return NextResponse.json(getMarketplaceLabState(id));
  } catch (cause) { return marketplaceError(cause); }
}

function marketplaceError(cause: unknown) {
  if (cause instanceof CheckbookMarketplaceError) return error(cause.message, cause.code, cause.status);
  console.error(cause);
  return error("Unable to complete the Marketplace operation", "INTERNAL_ERROR", 500);
}
function error(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}
