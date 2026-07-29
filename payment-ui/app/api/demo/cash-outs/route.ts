import {
  getDemoEntity,
  listDemoCashOutsForEntity,
} from "@payment-test/payment-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: Request) {
  const demoEntityId = new URL(request.url).searchParams.get("demoEntityId");

  if (!demoEntityId || !getDemoEntity(demoEntityId)) {
    return NextResponse.json(
      { error: { code: "DEMO_ENTITY_NOT_FOUND", message: "Demo entity not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    cashOuts: listDemoCashOutsForEntity(demoEntityId),
  });
}
