import { prisma } from "@/lib/prisma";
import { PICKUP_CONFIG } from "@/lib/config/pickup";

export type CheckoutPickupWindow = {
  id: string;
  startTime: Date;
  endTime: Date;
  capacity: number;
  reservedCount: number;
  remaining: number;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

function ceilToWindow(d: Date, windowMinutes: number) {
  const ms = d.getTime();
  const windowMs = windowMinutes * 60_000;
  return new Date(Math.ceil(ms / windowMs) * windowMs);
}

function operatingRangeForDay(now: Date) {
  const { openHour, openMinute, closeHour, closeMinute } = PICKUP_CONFIG.operatingHours;
  const day = startOfDay(now);
  const open = new Date(day.getFullYear(), day.getMonth(), day.getDate(), openHour, openMinute, 0, 0);
  const close = new Date(day.getFullYear(), day.getMonth(), day.getDate(), closeHour, closeMinute, 0, 0);
  return { open, close };
}

function nextOpening(now: Date) {
  const { open, close } = operatingRangeForDay(now);
  if (now < open) return open;
  if (now >= close) {
    const tomorrow = addMinutes(startOfDay(now), 24 * 60);
    const { open: openTomorrow } = operatingRangeForDay(tomorrow);
    return openTomorrow;
  }
  return open;
}

export class PickupWindowService {
  static computeCheckoutRange(now: Date) {
    const rangeNow = operatingRangeForDay(now);
    const isOpen = now >= rangeNow.open && now < rangeNow.close;

    const base = isOpen ? now : nextOpening(now);
    const rangeBase = operatingRangeForDay(base);

    const earliest = ceilToWindow(addMinutes(base, PICKUP_CONFIG.leadMinutes), PICKUP_CONFIG.windowMinutes);

    // If lead-time pushes past close, show the first window after the next opening.
    if (earliest >= rangeBase.close) {
      const nextBase = nextOpening(rangeBase.close);
      const rangeNext = operatingRangeForDay(nextBase);
      const earliestNext = ceilToWindow(addMinutes(nextBase, PICKUP_CONFIG.leadMinutes), PICKUP_CONFIG.windowMinutes);
      return {
        earliestStart: earliestNext,
        rangeEnd: new Date(
          Math.min(addMinutes(earliestNext, PICKUP_CONFIG.horizonMinutes).getTime(), rangeNext.close.getTime()),
        ),
      };
    }

    const rangeEnd = new Date(
      Math.min(addMinutes(earliest, PICKUP_CONFIG.horizonMinutes).getTime(), rangeBase.close.getTime()),
    );
    return { earliestStart: earliest, rangeEnd };
  }

  static async listAvailableForCheckout(now = new Date()) {
    const { earliestStart, rangeEnd } = this.computeCheckoutRange(now);
    await this.ensureWindowsInRange(earliestStart, rangeEnd);

    const windows = await prisma.pickupWindow.findMany({
      where: {
        startTime: { gte: earliestStart, lt: rangeEnd },
      },
      orderBy: { startTime: "asc" },
    });

    // Prisma can't compare reservedCount < capacity in SQLite with a single filter,
    // so we do the comparison in-memory.
    const available = windows
      .filter((w) => w.reservedCount < w.capacity)
      .map((w) => ({
        ...w,
        remaining: w.capacity - w.reservedCount,
      }));

    return {
      earliestStart,
      rangeEnd,
      suggestedWindowId: available[0]?.id ?? null,
      windows: available satisfies CheckoutPickupWindow[],
    };
  }

  static async ensureWindowsInRange(startInclusive: Date, endExclusive: Date) {
    const windowMinutes = PICKUP_CONFIG.windowMinutes;

    for (let t = new Date(startInclusive); t < endExclusive; t = addMinutes(t, windowMinutes)) {
      const startTime = t;
      const endTime = addMinutes(t, windowMinutes);
      await prisma.pickupWindow.upsert({
        where: { startTime_endTime: { startTime, endTime } },
        update: {},
        create: {
          startTime,
          endTime,
          capacity: PICKUP_CONFIG.defaultCapacity,
          reservedCount: 0,
        },
      });
    }
  }

  static async reserveInTx(tx: typeof prisma, pickupWindowId: string) {
    const window = await tx.pickupWindow.findUnique({ where: { id: pickupWindowId } });
    if (!window) {
      throw new Error("pickup window not found");
    }
    if (window.reservedCount >= window.capacity) {
      throw new Error("pickup window is full");
    }

    const updated = await tx.pickupWindow.updateMany({
      where: { id: pickupWindowId, reservedCount: { lt: window.capacity } },
      data: { reservedCount: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new Error("pickup window is full");
    }

    return window;
  }

  static async releaseInTx(tx: typeof prisma, pickupWindowId: string) {
    const window = await tx.pickupWindow.findUnique({ where: { id: pickupWindowId } });
    if (!window) return;
    if (window.reservedCount <= 0) return;

    await tx.pickupWindow.update({
      where: { id: pickupWindowId },
      data: { reservedCount: { decrement: 1 } },
    });
  }
}
