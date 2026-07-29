import { listDemoEntities } from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ entities: listDemoEntities() });
}
