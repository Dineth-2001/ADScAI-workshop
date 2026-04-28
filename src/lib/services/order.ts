import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";
import { PICKUP_CONFIG } from "@/lib/config/pickup";
import { PickupWindowService } from "@/lib/services/pickup-window";

type OrderItemInput = { menuItemId: string; quantity: number };

function cartHash(items: OrderItemInput[]) {
  const normalized = [...items]
    .map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }))
    .sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function makeOrderCode() {
  return randomBytes(4).toString("hex").slice(0, 8).toUpperCase();
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

export class OrderService {
  static async listForUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: { items: { include: { menuItem: true } }, pickupWindow: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async create(args: {
    userId: string;
    items: OrderItemInput[];
    pickupWindowId?: string;
    notes?: string;
    checkoutSessionId?: string;
    now?: Date;
  }) {
    const now = args.now ?? new Date();
    const { userId, items, notes, checkoutSessionId } = args;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("items required");
    }
    for (const it of items) {
      if (!it?.menuItemId || typeof it.menuItemId !== "string") {
        throw new Error("invalid menuItemId");
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        throw new Error("invalid quantity");
      }
    }

    const hash = cartHash(items);

    return prisma.$transaction(async (tx) => {
      if (checkoutSessionId) {
        const cutoff = addMinutes(now, -1 / 6); // 10 seconds
        const existing = await tx.orderDeduplication.findFirst({
          where: {
            userId,
            sessionId: checkoutSessionId,
            cartHash: hash,
            createdAt: { gte: cutoff },
          },
          orderBy: { createdAt: "desc" },
        });
        if (existing) {
          const order = await tx.order.findUnique({
            where: { id: existing.orderId },
            include: { items: { include: { menuItem: true } }, pickupWindow: true },
          });
          if (order) return order;
        }
      }

      const windowPick = async () => {
        if (args.pickupWindowId) return args.pickupWindowId;
        const availability = await PickupWindowService.listAvailableForCheckout(now);
        if (!availability.suggestedWindowId) {
          throw new Error("no pickup windows available");
        }
        return availability.suggestedWindowId;
      };

      const pickupWindowId = await windowPick();

      const { earliestStart, rangeEnd } = PickupWindowService.computeCheckoutRange(now);
      const window = await tx.pickupWindow.findUnique({ where: { id: pickupWindowId } });
      if (!window) {
        throw new Error("pickup window not found");
      }
      if (window.startTime < earliestStart || window.startTime >= rangeEnd) {
        throw new Error("pickup window is not selectable");
      }

      await PickupWindowService.reserveInTx(tx as any, pickupWindowId);

      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: items.map((i) => i.menuItemId) } },
      });

      const priceById = new Map(menuItems.map((m) => [m.id, m.priceCents] as const));
      const totalCents = items.reduce((sum, item) => sum + (priceById.get(item.menuItemId) ?? 0) * item.quantity, 0);

      for (const item of items) {
        const updated = await tx.menuItem.updateMany({
          where: {
            id: item.menuItemId,
            available: true,
            stockQuantity: { gte: item.quantity },
          },
          data: {
            stockQuantity: { decrement: item.quantity },
          },
        });
        if (updated.count !== 1) {
          throw new Error("out of stock");
        }
        await tx.menuItem.updateMany({
          where: { id: item.menuItemId, stockQuantity: 0 },
          data: { available: false },
        });
      }

      const order = await tx.order.create({
        data: {
          userId,
          pickupWindowId,
          notes,
          totalCents,
          paidAt: now,
          orderCode: makeOrderCode(),
          status: "pending",
          items: {
            create: items.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPriceCents: priceById.get(item.menuItemId) ?? 0,
            })),
          },
        },
        include: { items: { include: { menuItem: true } }, pickupWindow: true },
      });

      if (checkoutSessionId) {
        await tx.orderDeduplication.create({
          data: {
            userId,
            sessionId: checkoutSessionId,
            cartHash: hash,
            orderId: order.id,
          },
        });
      }

      return order;
    });
  }

  static async byId(id: string, userId: string) {
    return prisma.order.findFirst({
      where: { id, userId },
      include: { items: { include: { menuItem: true } }, pickupWindow: true },
    });
  }

  static async cancel(args: { id: string; userId: string; now?: Date }) {
    const now = args.now ?? new Date();
    const cutoffMinutes = PICKUP_CONFIG.cancelCutoffMinutes;

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: args.id, userId: args.userId },
        include: { items: true, pickupWindow: true },
      });
      if (!order) return null;

      const status = order.status.toLowerCase();
      if (status === "canceled" || status === "cancelled") {
        return order;
      }
      if (status === "handed_off") {
        throw new Error("order already handed off");
      }

      const latestCancelTime = addMinutes(order.pickupWindow.startTime, -cutoffMinutes);
      if (now > latestCancelTime) {
        throw new Error("cancellation window has passed");
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "canceled",
          refundedAt: now,
        },
      });

      for (const it of order.items) {
        await tx.menuItem.update({
          where: { id: it.menuItemId },
          data: {
            stockQuantity: { increment: it.quantity },
            available: true,
          },
        });
      }

      await PickupWindowService.releaseInTx(tx as any, order.pickupWindowId);

      await tx.notification.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: "cancellation",
          message: `Order ${order.orderCode} canceled and refunded.`,
        },
      });

      return tx.order.findUnique({
        where: { id: order.id },
        include: { items: { include: { menuItem: true } }, pickupWindow: true },
      });
    });
  }

  static async updateStatus(id: string, userId: string, status: string) {
    const allowed = new Set(["pending", "preparing", "ready", "handed_off", "canceled", "no_show"]);
    if (!allowed.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }
    const order = await prisma.order.findFirst({ where: { id, userId }, include: { pickupWindow: true } });
    if (!order) return null;

    const updated = await prisma.order.update({
      where: { id },
      data: { status },
      include: { items: { include: { menuItem: true } }, pickupWindow: true },
    });

    if (status === "ready") {
      await prisma.notification.create({
        data: {
          userId,
          orderId: id,
          type: "ready",
          message: `Order ${updated.orderCode} is ready for pickup.`,
        },
      });
    }
    if (status === "no_show") {
      await prisma.notification.create({
        data: {
          userId,
          orderId: id,
          type: "no_show",
          message: `Order ${updated.orderCode} marked as no-show.`,
        },
      });
    }

    return updated;
  }

  static async updateStatusAsStaff(id: string, status: string) {
    const allowed = new Set(["pending", "preparing", "ready", "handed_off", "canceled", "no_show"]);
    if (!allowed.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return null;

    const updated = await prisma.order.update({
      where: { id },
      data: { status },
      include: { items: { include: { menuItem: true } }, pickupWindow: true },
    });

    if (status === "ready") {
      await prisma.notification.create({
        data: {
          userId: updated.userId,
          orderId: id,
          type: "ready",
          message: `Order ${updated.orderCode} is ready for pickup.`,
        },
      });
    }
    if (status === "no_show") {
      await prisma.notification.create({
        data: {
          userId: updated.userId,
          orderId: id,
          type: "no_show",
          message: `Order ${updated.orderCode} marked as no-show.`,
        },
      });
    }
    if (status === "canceled") {
      await prisma.notification.create({
        data: {
          userId: updated.userId,
          orderId: id,
          type: "cancellation",
          message: `Order ${updated.orderCode} was canceled.`,
        },
      });
    }

    return updated;
  }

  static async autoMarkNoShows(now = new Date()) {
    const graceMs = PICKUP_CONFIG.graceMinutes * 60_000;
    const candidates = await prisma.order.findMany({
      where: {
        status: { in: ["pending", "preparing", "ready"] },
      },
      include: { pickupWindow: true },
    });

    const toMark = candidates.filter((o) => now.getTime() > o.pickupWindow.endTime.getTime() + graceMs);
    for (const o of toMark) {
      await prisma.order.update({ where: { id: o.id }, data: { status: "no_show" } });
      await prisma.notification.create({
        data: {
          userId: o.userId,
          orderId: o.id,
          type: "no_show",
          message: `Order ${o.orderCode} marked as no-show.`,
        },
      });
    }
    return { marked: toMark.length };
  }

  static async remove(id: string, userId: string) {
    const order = await prisma.order.findFirst({ where: { id, userId } });
    if (!order) return null;
    return prisma.order.delete({ where: { id } });
  }
}
