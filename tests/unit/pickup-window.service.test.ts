import { describe, it, expect } from "vitest";
import { PickupWindowService } from "@/lib/services/pickup-window";

describe("PickupWindowService.computeCheckoutRange", () => {
  it("enforces 30-minute lead time and 15-minute blocks when open", () => {
    const now = new Date(2026, 3, 28, 12, 2, 0, 0); // Apr 28 12:02 local
    const { earliestStart } = PickupWindowService.computeCheckoutRange(now);
    expect(earliestStart.getHours()).toBe(12);
    expect(earliestStart.getMinutes()).toBe(45);
  });

  it("when closed, starts after opening", () => {
    const now = new Date(2026, 3, 28, 10, 0, 0, 0); // before 11:00
    const { earliestStart, rangeEnd } = PickupWindowService.computeCheckoutRange(now);
    expect(earliestStart.getHours()).toBe(11);
    expect(earliestStart.getMinutes()).toBe(30);
    // horizon is 2h => 13:30 (still before close)
    expect(rangeEnd.getHours()).toBe(13);
    expect(rangeEnd.getMinutes()).toBe(30);
  });

  it("rolls to next day if lead-time pushes past close", () => {
    const now = new Date(2026, 3, 28, 13, 50, 0, 0); // near close (14:00)
    const { earliestStart } = PickupWindowService.computeCheckoutRange(now);
    expect(earliestStart.getDate()).toBe(29);
    expect(earliestStart.getHours()).toBe(11);
    expect(earliestStart.getMinutes()).toBe(30);
  });
});
