import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { PickupWindowService } from "@/lib/services/pickup-window";

export const GET = withAuth(async () => {
  const availability = await PickupWindowService.listAvailableForCheckout(new Date());
  return NextResponse.json(availability);
});
