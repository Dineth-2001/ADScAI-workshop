import { prisma } from "@/lib/prisma";
import { PICKUP_CONFIG } from "@/lib/config/pickup";
import { PickupWindowService } from "@/lib/services/pickup-window";

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

function ceilToWindow(d: Date, windowMinutes: number) {
  const ms = d.getTime();
  const windowMs = windowMinutes * 60_000;
  return new Date(Math.ceil(ms / windowMs) * windowMs);
}

export class KitchenService {
  static async listUpcoming(now = new Date()) {
    const start = ceilToWindow(now, PICKUP_CONFIG.windowMinutes);
    const end = addMinutes(start, PICKUP_CONFIG.horizonMinutes);

    await PickupWindowService.ensureWindowsInRange(start, end);

    const windows = await prisma.pickupWindow.findMany({
      where: { startTime: { gte: start, lt: end } },
      orderBy: { startTime: "asc" },
      include: {
        orders: {
          where: { status: { in: ["pending", "preparing", "ready"] } },
          orderBy: { createdAt: "asc" },
          include: { items: true, user: true },
        },
      },
    });

    return windows.map((w) => {
      const orderCount = w.orders.length;
      const itemCount = w.orders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0);
      return { window: w, orderCount, itemCount };
    });
  }
}
