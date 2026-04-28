import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { KitchenService } from "@/lib/services/kitchen";
import { OrderService } from "@/lib/services/order";
import { KitchenOrderActions } from "./_components/kitchen-order-actions";

export const dynamic = "force-dynamic";

function formatTime(d: Date) {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function badgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "pending" || s === "preparing") return "badge badge-pending";
  if (s === "ready") return "badge badge-ready";
  if (s === "handed_off") return "badge badge-collected";
  if (s === "canceled" || s === "cancelled" || s === "no_show") return "badge badge-cancelled";
  return "badge";
}

export default async function KitchenPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  await OrderService.autoMarkNoShows(new Date());
  const upcoming = await KitchenService.listUpcoming(new Date());

  return (
    <section>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "2rem", margin: "0 0 0.4rem" }}>Kitchen</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
          Upcoming pickups grouped by window.
        </p>
      </div>

      {upcoming.length === 0 && <div style={{ color: "var(--muted)" }}>No upcoming windows.</div>}

      <div style={{ display: "grid", gap: "1rem" }}>
        {upcoming.map(({ window, orderCount, itemCount }) => (
          <article key={window.id} className="card" style={{ padding: "1.1rem 1.25rem" }}>
            <header
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                marginBottom: "0.85rem",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Window
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: 2 }}>
                  {formatTime(window.startTime)}–{formatTime(window.endTime)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Load
                </div>
                <div style={{ fontSize: "0.95rem", color: "var(--text)", fontWeight: 700 }}>
                  {orderCount} orders, {itemCount} items
                </div>
              </div>
            </header>

            {window.orders.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>No orders in this window yet.</div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {window.orders.map((o) => (
                  <div key={o.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem 0.95rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{o.orderCode}</div>
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.user.email}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span className={badgeClass(o.status)}>{o.status}</span>
                        <KitchenOrderActions orderId={o.id} currentStatus={o.status} />
                      </div>
                    </div>

                    <div style={{ marginTop: "0.75rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                      {o.items.reduce((sum, it) => sum + it.quantity, 0)} items
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
