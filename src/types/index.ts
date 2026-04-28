export type MenuCategory = "main" | "drink" | "snack";

export type OrderStatus = "pending" | "preparing" | "ready" | "handed_off" | "canceled" | "no_show";

export type CreateOrderInput = {
  items: Array<{ menuItemId: string; quantity: number }>;
  pickupWindowId: string;
  notes?: string;
  checkoutSessionId?: string;
};
