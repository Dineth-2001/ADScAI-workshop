import { PrismaClient } from "@prisma/client";
import { auth } from "../src/lib/auth";
import { PICKUP_CONFIG } from "../src/lib/config/pickup";

const prisma = new PrismaClient();

const MENU_SEED = [
  { name: "Chicken Biryani", description: "Slow-cooked basmati with chicken and saffron", priceCents: 350, category: "main", available: true, stockQuantity: 25, dietaryNotes: "halal", allergenInfo: "dairy" },
  { name: "Paneer Butter Masala", description: "Cottage cheese in a tomato-cream gravy", priceCents: 320, category: "main", available: true, stockQuantity: 18, dietaryNotes: "vegetarian", allergenInfo: "dairy" },
  { name: "Veg Thali", description: "Daily vegetarian platter with dal, sabzi, rice, roti", priceCents: 280, category: "main", available: true, stockQuantity: 30, dietaryNotes: "vegetarian", allergenInfo: "gluten" },
  { name: "Fish Curry & Rice", description: "House fish curry with steamed rice", priceCents: 360, category: "main", available: false, stockQuantity: 0, dietaryNotes: null, allergenInfo: "fish" },
  { name: "Masala Dosa", description: "Crispy rice crepe with potato filling", priceCents: 200, category: "main", available: true, stockQuantity: 22, dietaryNotes: "vegetarian", allergenInfo: "may contain dairy" },
  { name: "Masala Chai", description: "Spiced milk tea", priceCents: 50, category: "drink", available: true, stockQuantity: 60, dietaryNotes: "vegetarian", allergenInfo: "dairy" },
  { name: "Filter Coffee", description: "South-Indian filter coffee", priceCents: 60, category: "drink", available: true, stockQuantity: 60, dietaryNotes: "vegetarian", allergenInfo: "dairy" },
  { name: "Fresh Lime Soda", description: "Sweet or salted", priceCents: 80, category: "drink", available: true, stockQuantity: 60, dietaryNotes: "vegan", allergenInfo: null },
  { name: "Samosa", description: "Two pieces, mint chutney", priceCents: 90, category: "snack", available: true, stockQuantity: 40, dietaryNotes: "vegetarian", allergenInfo: "gluten" },
  { name: "Banana Chips", description: "Kerala style, lightly salted", priceCents: 70, category: "snack", available: true, stockQuantity: 50, dietaryNotes: "vegan", allergenInfo: null },
];

const USERS_SEED = [
  { name: "Asha Patel",   email: "asha@example.com",   password: "asha-password-1" },
  { name: "Ravi Kumar",   email: "ravi@example.com",   password: "ravi-password-1" },
  { name: "Maya Iyer",    email: "maya@example.com",   password: "maya-password-1" },
];

async function ensureUser(u: (typeof USERS_SEED)[number]) {
  const existing = await prisma.user.findUnique({ where: { email: u.email } });
  if (existing) return existing;
  const res = await auth.api.signUpEmail({
    body: { email: u.email, password: u.password, name: u.name },
  });
  return prisma.user.findUniqueOrThrow({ where: { email: res.user.email } });
}

async function main() {
  console.log("Resetting orders & menu…");
  await prisma.notification.deleteMany();
  await prisma.orderDeduplication.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pickupWindow.deleteMany();
  await prisma.menuItem.deleteMany();

  console.log("Seeding menu items…");
  for (const item of MENU_SEED) {
    await prisma.menuItem.create({ data: item });
  }

  function addMinutes(d: Date, minutes: number) {
    return new Date(d.getTime() + minutes * 60_000);
  }

  function startOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
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
      return operatingRangeForDay(tomorrow).open;
    }
    return open;
  }

  function makeOrderCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  console.log("Seeding users (idempotent — keeps existing accounts)…");
  const users = [];
  for (const u of USERS_SEED) {
    const user = await ensureUser(u);
    console.log(`  ✓ ${user.email} (id=${user.id})`);
    users.push(user);
  }

  const menu = await prisma.menuItem.findMany();
  const biryani = menu.find((m) => m.name === "Chicken Biryani")!;
  const chai = menu.find((m) => m.name === "Masala Chai")!;
  const dosa = menu.find((m) => m.name === "Masala Dosa")!;
  const samosa = menu.find((m) => m.name === "Samosa")!;

  console.log("Seeding pickup windows…");
  const now = new Date();
  const { open, close } = operatingRangeForDay(now);
  const base = now >= open && now < close ? now : nextOpening(now);
  const start = ceilToWindow(addMinutes(base, PICKUP_CONFIG.leadMinutes), PICKUP_CONFIG.windowMinutes);
  const { close: closeForStartDay } = operatingRangeForDay(start);
  const rangeEnd = new Date(
    Math.min(addMinutes(start, PICKUP_CONFIG.horizonMinutes).getTime(), closeForStartDay.getTime()),
  );

  const windowIds: string[] = [];
  for (let t = new Date(start); t < rangeEnd; t = addMinutes(t, PICKUP_CONFIG.windowMinutes)) {
    const w = await prisma.pickupWindow.create({
      data: {
        startTime: t,
        endTime: addMinutes(t, PICKUP_CONFIG.windowMinutes),
        capacity: PICKUP_CONFIG.defaultCapacity,
        reservedCount: 0,
      },
    });
    windowIds.push(w.id);
  }
  const [firstWindowId] = windowIds;
  if (!firstWindowId) {
    throw new Error("Seed failed: no pickup windows generated");
  }

  console.log("Seeding sample orders for first user…");
  const [primary] = users;

  await prisma.order.create({
    data: {
      userId: primary.id,
      pickupWindowId: firstWindowId,
      status: "ready",
      totalCents: biryani.priceCents + chai.priceCents,
      notes: "less spicy please",
      paidAt: now,
      orderCode: makeOrderCode(),
      items: {
        create: [
          { menuItemId: biryani.id, quantity: 1, unitPriceCents: biryani.priceCents },
          { menuItemId: chai.id, quantity: 1, unitPriceCents: chai.priceCents },
        ],
      },
    },
  });

  await prisma.pickupWindow.update({
    where: { id: firstWindowId },
    data: { reservedCount: { increment: 1 } },
  });
  await prisma.menuItem.update({ where: { id: biryani.id }, data: { stockQuantity: { decrement: 1 } } });
  await prisma.menuItem.update({ where: { id: chai.id }, data: { stockQuantity: { decrement: 1 } } });

  await prisma.order.create({
    data: {
      userId: primary.id,
      pickupWindowId: firstWindowId,
      status: "pending",
      totalCents: dosa.priceCents + samosa.priceCents * 2,
      paidAt: now,
      orderCode: makeOrderCode(),
      items: {
        create: [
          { menuItemId: dosa.id, quantity: 1, unitPriceCents: dosa.priceCents },
          { menuItemId: samosa.id, quantity: 2, unitPriceCents: samosa.priceCents },
        ],
      },
    },
  });

  await prisma.pickupWindow.update({
    where: { id: firstWindowId },
    data: { reservedCount: { increment: 1 } },
  });
  await prisma.menuItem.update({ where: { id: dosa.id }, data: { stockQuantity: { decrement: 1 } } });
  await prisma.menuItem.update({ where: { id: samosa.id }, data: { stockQuantity: { decrement: 2 } } });

  const counts = {
    users: await prisma.user.count(),
    menu: await prisma.menuItem.count(),
    orders: await prisma.order.count(),
    items: await prisma.orderItem.count(),
  };
  console.log("Done:", counts);
  console.log("Try signing in as:");
  for (const u of USERS_SEED) {
    console.log(`  ${u.email}  /  ${u.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
