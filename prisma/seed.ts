import { PrismaClient } from "@prisma/client";
import { auth } from "../src/lib/auth";

const prisma = new PrismaClient();

const MENU_SEED = [
  { name: "Chicken Biryani", description: "Slow-cooked basmati with chicken and saffron", priceCents: 350, category: "main", available: true },
  { name: "Paneer Butter Masala", description: "Cottage cheese in a tomato-cream gravy", priceCents: 320, category: "main", available: true },
  { name: "Veg Thali", description: "Daily vegetarian platter with dal, sabzi, rice, roti", priceCents: 280, category: "main", available: true },
  { name: "Fish Curry & Rice", description: "House fish curry with steamed rice", priceCents: 360, category: "main", available: false },
  { name: "Masala Dosa", description: "Crispy rice crepe with potato filling", priceCents: 200, category: "main", available: true },
  { name: "Masala Chai", description: "Spiced milk tea", priceCents: 50, category: "drink", available: true },
  { name: "Filter Coffee", description: "South-Indian filter coffee", priceCents: 60, category: "drink", available: true },
  { name: "Fresh Lime Soda", description: "Sweet or salted", priceCents: 80, category: "drink", available: true },
  { name: "Samosa", description: "Two pieces, mint chutney", priceCents: 90, category: "snack", available: true },
  { name: "Banana Chips", description: "Kerala style, lightly salted", priceCents: 70, category: "snack", available: true },
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
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();

  console.log("Seeding menu items…");
  for (const item of MENU_SEED) {
    await prisma.menuItem.create({ data: item });
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

  console.log("Seeding sample orders for first user…");
  const [primary] = users;
  await prisma.order.create({
    data: {
      userId: primary.id,
      status: "ready",
      totalCents: biryani.priceCents + chai.priceCents,
      notes: "less spicy please",
      items: {
        create: [
          { menuItemId: biryani.id, quantity: 1, unitPriceCents: biryani.priceCents },
          { menuItemId: chai.id, quantity: 1, unitPriceCents: chai.priceCents },
        ],
      },
    },
  });

  await prisma.order.create({
    data: {
      userId: primary.id,
      status: "pending",
      totalCents: dosa.priceCents + samosa.priceCents * 2,
      items: {
        create: [
          { menuItemId: dosa.id, quantity: 1, unitPriceCents: dosa.priceCents },
          { menuItemId: samosa.id, quantity: 2, unitPriceCents: samosa.priceCents },
        ],
      },
    },
  });

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
