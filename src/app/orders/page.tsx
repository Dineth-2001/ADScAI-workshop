import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OrderService } from "@/lib/services/order";

export const dynamic = "force-dynamic";

function formatPrice(cents: number) {
  return `₹${(cents / 100).toFixed(2)}`;
}

export default async function OrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const orders = await OrderService.listForUser(session.user.id);

  return (
    <section>
      <h2>Your orders</h2>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        Signed in as <strong>{session.user.email}</strong>.
      </p>
      {orders.length === 0 && <p>No orders yet.</p>}
      {orders.map((order) => (
        <article
          key={order.id}
          style={{
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
          }}
        >
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.5rem",
            }}
          >
            <strong>#{order.id.slice(-6)}</strong>
            <span>
              {order.status} · {formatPrice(order.totalCents)}
            </span>
          </header>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {order.items.map((it) => (
              <li key={it.id}>
                {it.quantity}× {it.menuItem.name}
              </li>
            ))}
          </ul>
          {order.notes && (
            <p style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.5rem" }}>
              Notes: {order.notes}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
