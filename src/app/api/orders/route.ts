import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService } from "@/lib/services/order";

export const GET = withAuth(async (_req, ctx) => {
  const orders = await OrderService.listForUser(ctx.userId);
  return NextResponse.json(orders);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await req.json();

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }

  if (body.pickupWindowId != null && typeof body.pickupWindowId !== "string") {
    return NextResponse.json({ error: "pickupWindowId must be a string" }, { status: 400 });
  }

  if (body.checkoutSessionId != null && typeof body.checkoutSessionId !== "string") {
    return NextResponse.json({ error: "checkoutSessionId must be a string" }, { status: 400 });
  }

  try {
    const order = await OrderService.create({
      userId: ctx.userId,
      items: body.items,
      pickupWindowId: body.pickupWindowId,
      checkoutSessionId: body.checkoutSessionId,
      notes: body.notes,
    });

    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "invalid request" },
      { status: 400 },
    );
  }
});
