# Implementation notes — Scheduled pickup windows (Apr 28, 2026)

This repo now implements the workshop spec feature **“Scheduled pickup windows for pre-orders”**.

## What was implemented

### Pickup windows (15-minute slots)
- Students can choose a **15-minute pickup window** during checkout.
- Availability shows only windows:
  - within **operating hours**
  - in the **next 2 hours**
  - with **30-minute lead time**
  - that are **not full** (capacity remaining)
- A **suggested** window is the earliest available slot.

### Capacity management (per window)
- Each window has a configurable `capacity` (default **15 orders**).
- Capacity is measured in **orders**, not items.
- Capacity is **reserved only when the order is created** (demo “payment succeeded” path).

### Stock reservation
- Stock is reserved at order placement by decrementing `MenuItem.stockQuantity`.
- If stock is insufficient, order creation fails with `out of stock`.
- When stock reaches 0, the item is marked `available = false`.
- On cancellation, stock is released back.

### Cancellation cutoff + refund marker
- Orders can be canceled up to **10 minutes before** the pickup window start.
- Cancel sets `status = canceled` and marks `refundedAt` (refund is represented as a timestamp marker in this workshop version).
- Cancellation also releases both:
  - window capacity (reserved count)
  - item stock

### Grace period + no-show
- After **10 minutes past the window end**, active orders not handed off are marked `no_show`.
- The system emits an in-app notification for the no-show.

### Notifications
- In-app notifications are created for:
  - `ready` (when staff marks an order ready)
  - `cancellation` (on successful cancellation)
  - `no_show` (when grace period expires)
- Orders page shows the most recent notifications.

### Kitchen view
- Added a kitchen page showing upcoming windows, grouped by window.
- Each window shows “X orders, Y items”.
- Staff can mark orders:
  - `pending` → `preparing`
  - `pending|preparing` → `ready`
  - `ready` → `handed_off`

### Checkout deduplication
- Prevents accidental double-submissions within **10 seconds** for the same:
  - user
  - `checkoutSessionId`
  - cart hash
- Checkout session id is stored client-side.

## Code locations

### Database / Prisma
- Schema updates: `prisma/schema.prisma`
- Migration: `prisma/migrations/20260428105343_add_pickup_windows/migration.sql`
- Seed updates: `prisma/seed.ts`

### Config
- Pickup rules defaults: `src/lib/config/pickup.ts`

### Services (business logic)
- Pickup window generation/availability/reserve/release: `src/lib/services/pickup-window.ts`
- Order lifecycle (create/cancel/dedup/no-show/notifications): `src/lib/services/order.ts`
- Kitchen aggregation (group by window): `src/lib/services/kitchen.ts`
- Notification reads: `src/lib/services/notification.ts`

### API routes (protected)
- Pickup window availability: `src/app/api/pickup-windows/route.ts`
- Create order (accepts `pickupWindowId` + `checkoutSessionId`): `src/app/api/orders/route.ts`
- Cancel order: `src/app/api/orders/[id]/cancel/route.ts`
- Staff update status: `src/app/api/kitchen/orders/[id]/status/route.ts`

### UI
- Menu + checkout window selection: `src/app/menu/_components/menu-client.tsx`
- Orders page (pickup time, order code, notifications): `src/app/orders/page.tsx`
- Order cancel button: `src/app/orders/_components/order-actions.tsx`
- Kitchen page: `src/app/kitchen/page.tsx`
- Kitchen order actions: `src/app/kitchen/_components/kitchen-order-actions.tsx`
- Nav link: `src/app/_components/nav-links.tsx`

### Types
- Order status + input: `src/types/index.ts`

### Tests
- Time rule tests: `tests/unit/pickup-window.service.test.ts`

## How to run and verify

1. Apply schema + seed
   - `npm run db:migrate`
   - `npm run db:seed`

2. Start app
   - `npm run dev`

3. Verify flow
- Login
- Menu → add items → Checkout → select pickup window → “Pay & place order”
- Orders page shows pickup window + order code + notifications
- Kitchen page shows upcoming windows; mark an order `ready` and see notification

## Notes / workshop simplifications
- “Payment” is a demo flow (order creation implies payment success).
- “Refunds” are represented by setting `refundedAt`.
- “Admin configuration UI” is not implemented; pickup settings are constants in `src/lib/config/pickup.ts`.
