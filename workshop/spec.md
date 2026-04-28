# Workshop spec

## Feature: Scheduled pickup windows for pre-orders

### Goal
Increase orders by letting students pre-order and select a pickup window while keeping canteen operations predictable and efficient.

### Problem summary
Students cannot plan lunch because of unpredictable lines and sold-out items. They want to lock in food before leaving class and avoid food sitting out too long.

### Success criteria
- Students can place an order at least 30 minutes ahead with a 15-minute pickup window.
- Pickup window capacity prevents kitchen overload during rush hours.
- Orders are paid in advance and items are reserved at order time.
- Students receive a ready notification when the order is prepared.
- Average wait time at pickup is under 5 minutes during peak hours.
- Authentication is required; students must be logged in to pre-order.

### Scope
In scope:
- Pre-order checkout flow with pickup time slot selection.
- Slot capacity management and load-based suggestions.
- Payment required at checkout (card payment; cash at pickup optional).
- Stock lock for items in the order.
- Ready notification (in-app and email; SMS optional).
- Dedicated pickup lane/shelf labeling.
- Student authentication required.
- Admin configuration of window capacity, lead times, and operating hours.
- Allergen/dietary note handling for items.
- Order deduplication (prevent accidental double submissions during checkout).

Out of scope:
- Table service.
- Delivery.
- Loyalty program.
- Full POS replacement.
- Item editing after order placement (MVP: cancel + reorder only).
- Rescheduling to different window (MVP: cancel + reorder only).

### User stories
- As a student, I can select a 15-minute pickup window so I know when to leave class.
- As a student, I can pre-pay and reserve items so I do not lose my order to stock-outs.
- As a student, I get a notification when my order is ready.
- As a staff member, I can see upcoming pickups and prepare in a steady flow.

### UX flow
1. Student opens the menu and adds items to cart.
2. Checkout shows available pickup windows (next 2 hours) with capacity info.
3. Student selects a window and pays.
4. Order is placed, items are reserved, and a confirmation shows the pickup time.
5. When the order is ready, the student receives a notification.
6. Student picks up from the pre-order shelf/line.

### Functional requirements
- Time windows are 15-minute blocks.
- Show only windows that are not full.
- Capacity per window is configurable (default: 15 orders).
- Suggested window is the earliest available based on current load.
- Stock is reserved on order placement and released if the order is canceled.
- Orders can be canceled up to 10 minutes before the window start.
- Grace period: 10 minutes after window end; after that, order is marked as no-show.

#### Time rules and availability
- Windows are generated only within canteen operating hours.
- Slots are shown only for the next 2 hours from the current time.
- Lead time requirement: earliest selectable window starts at least 30 minutes from now.
- If the canteen is closed, the earliest selectable window is the first window after opening.

#### Capacity semantics
- Window capacity is measured in total orders, not total items.
- Large orders count as a single order against capacity.
- Reserved capacity is held only after successful payment.

#### Reservation lifecycle
- If checkout is abandoned, no window or stock is reserved.
- If payment fails, no reservation is made for the window or stock.
- If all available windows (next 2 hours) are full, checkout shows a message suggesting the student pre-order for a later time or the next day.

#### Payment and refunds
- Accepted payment method: card (Stripe or equivalent). Cash payments at pickup may be added in a future phase.
- Refunds for canceled orders are issued in full to the original payment method within 1–2 business days.
- No-show orders are not automatically refunded; staff must approve a refund request or a policy timer (e.g., 24 hours after no-show) triggers automatic refund.

#### Order changes
- Orders can be canceled up to 10 minutes before window start and are refunded in full.
- Item edits are **not allowed** in MVP; students must cancel and reorder (to be added in v2).
- Rescheduling is **not allowed** in MVP; students must cancel and reorder to a new window (to be added in v2).

#### Notifications
- Ready notification is sent when staff marks an order as ready.
- No-show notification is sent when the grace period expires.
- Cancellation notification is sent on successful cancel or staff cancel.

### Operational requirements
- Kitchen view shows upcoming orders grouped by window with total item count per window (e.g., "Window 12:00–12:15: 12 orders, 38 items").
- Dedicated pickup lane/shelf is labeled by window.
- Staff can mark orders as ready and handed off.
- Admin panel allows configuration of:
  - Window capacity (default: 15 orders).
  - Lead time requirement (default: 30 minutes).
  - Operating hours (e.g., 11:00–14:00 for lunch).
  - Cancellation cutoff window (default: 10 minutes before start).

#### Staff handoff
- Staff confirms handoff by matching an order code shown to the student or by scanning/verifying the order in the system.
- Staff can mark no-show after the 10-minute grace period.
- Staff can cancel orders due to ingredient shortage or quality issues; the student receives a cancellation notification and full refund.

### Data model additions
- PickupWindow
	- id
	- startTime
	- endTime
	- capacity
	- reservedCount
- Order
	- pickupWindowId
	- status: pending | preparing | ready | handed_off | canceled | no_show
	- paidAt
	- orderCode
	- refundedAt (nullable; set when refund is issued)
- MenuItem
	- allergenInfo (text field or relation to allergen tags)
	- dietaryNotes (vegan, gluten-free, halal, etc.)
- OrderDeduplication
	- Track session ID and cart hash during checkout to prevent duplicate submissions within a 10-second window.

### Edge cases
- If a window fills while the user is checking out, prompt to select another window.
- If stock changes between cart and checkout, show a clear error and allow edits.
- If payment fails, do not reserve stock.
- If the student accidentally submits the same order twice in rapid succession, deduplicate by cart hash and session ID; only charge once.
- If an item is marked unavailable for a specific window due to stock constraints, show it grayed out or removed from that window's cart.
- If the canteen closes unexpectedly, notify students of affected orders and process automatic refunds.

### Acceptance criteria
- Given the canteen is open, when a student opens checkout, then the earliest selectable window starts at least 30 minutes from now and all windows are 15-minute blocks.
- Given the canteen is closed, when a student opens checkout, then the earliest selectable window is the first window after opening.
- Given a window is full, when a student opens checkout, then that window is not shown in the list.
- Given a student selects a window and payment succeeds, then the order is created, stock is reserved, and the window reserved count increases by one.
- Given payment fails or is canceled, then no stock or window capacity is reserved.
- Given a student cancels an order at least 10 minutes before the window start, then the order is marked canceled, stock is released, and a full refund is issued.
- Given a student attempts to cancel within 10 minutes of the window start, then cancellation is rejected and the order remains active.
- Given a student reschedules more than 10 minutes before the window start and the new window has capacity, then the order pickup window updates and capacity counts are adjusted.
- Given a student edits items more than 10 minutes before the window start, then stock is rechecked and the edit is accepted only if all items are available.
- Given staff marks an order as ready, then the student receives a ready notification and the order status becomes ready.
- Given 10 minutes have passed after the window end and the order is not handed off, then the order is marked no_show and a no-show notification is sent.
- Given a student presents the order code, when staff hands off the order, then the status becomes handed_off.

### Metrics
- Conversion rate to paid order.
- Orders per 15-minute window.
- Average pickup wait time.
- No-show rate.
- Stock-out incidents for pre-orders.

### Rollout plan
1. Pilot with lunch hours only.
2. Gather feedback and tune capacity.
3. Expand to full day if metrics improve.
