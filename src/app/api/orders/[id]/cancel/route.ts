import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService } from "@/lib/services/order";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth(async (_req, auth, ctx: Ctx) => {
  const { id } = await ctx.params;
  try {
    const order = await OrderService.cancel({ id, userId: auth.userId });
    if (!order) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "invalid request" },
      { status: 400 },
    );
  }
});
