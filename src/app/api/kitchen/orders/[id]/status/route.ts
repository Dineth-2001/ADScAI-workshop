import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService } from "@/lib/services/order";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (req, _auth, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  if (typeof body.status !== "string") {
    return NextResponse.json({ error: "status required" }, { status: 400 });
  }

  try {
    const order = await OrderService.updateStatusAsStaff(id, body.status);
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
