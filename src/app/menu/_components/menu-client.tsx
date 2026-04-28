"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  category: string;
  available: boolean;
  allergenInfo?: string | null;
  dietaryNotes?: string | null;
};

type Cart = Record<string, number>;

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const categoryEmoji: Record<string, string> = {
  main: "🍛",
  drink: "🥤",
  snack: "🥟",
  dessert: "🍰",
};

export function MenuClient({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [cart, setCart] = useState<Cart>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const [windows, setWindows] = useState<
    | null
    | {
        suggestedWindowId: string | null;
        windows: Array<{
          id: string;
          startTime: string;
          endTime: string;
          capacity: number;
          reservedCount: number;
          remaining: number;
        }>;
      }
  >(null);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  const loggedIn = !!session?.user;

  function getCheckoutSessionId() {
    try {
      const key = "canteen.checkoutSessionId";
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      localStorage.setItem(key, id);
      return id;
    } catch {
      return `${Date.now()}-${Math.random()}`;
    }
  }

  function formatTimeRange(startIso: string, endIso: string) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const startStr = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const endStr = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${startStr}–${endStr}`;
  }

  const byCategory = useMemo(() => {
    return items.reduce<Record<string, MenuItem[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  }, [items]);

  const totalCents = useMemo(() => {
    return items.reduce((sum, item) => sum + (cart[item.id] ?? 0) * item.priceCents, 0);
  }, [items, cart]);

  const totalCount = Object.values(cart).reduce((a, b) => a + b, 0);

  function setQty(id: string, qty: number) {
    setSuccessId(null);
    setCheckoutOpen(false);
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  useEffect(() => {
    if (!checkoutOpen) return;
    if (!loggedIn) return;

    let cancelled = false;
    async function run() {
      setWindowsLoading(true);
      setWindowsError(null);
      try {
        const res = await fetch("/api/pickup-windows");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setWindows(data);
        setSelectedWindowId(data.suggestedWindowId);
      } catch (e) {
        if (cancelled) return;
        setWindowsError(e instanceof Error ? e.message : "Failed to load pickup windows");
      } finally {
        if (!cancelled) setWindowsLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [checkoutOpen, loggedIn]);

  async function placeOrder() {
    if (!selectedWindowId) {
      setError("Select a pickup window to continue");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: Object.entries(cart).map(([menuItemId, quantity]) => ({
            menuItemId,
            quantity,
          })),
          pickupWindowId: selectedWindowId,
          checkoutSessionId: getCheckoutSessionId(),
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      const order = await res.json();
      setCart({});
      setCheckoutOpen(false);
      setNotes("");
      setWindows(null);
      setSelectedWindowId(null);
      setSuccessId(order.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", margin: "0 0 0.4rem" }}>Today's menu</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "1rem" }}>
          Pre-order now — pick it up hot and skip the line.
        </p>
      </div>

      {successId && (
        <div
          style={{
            background: "var(--success-soft)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius)",
            marginBottom: "1.25rem",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <span>
            <strong>Order placed.</strong> We'll have it ready shortly.
          </span>
          <a href="/orders" className="btn btn-secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>
            View orders
          </a>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "var(--danger-soft)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius)",
            marginBottom: "1.25rem",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {Object.entries(byCategory).map(([category, list]) => (
        <div key={category} style={{ marginBottom: "2.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
            <span aria-hidden style={{ fontSize: "1.2rem" }}>
              {categoryEmoji[category] ?? "•"}
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: "1.05rem",
                textTransform: "capitalize",
                fontWeight: 700,
              }}
            >
              {category}
            </h2>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{list.length} items</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
            {list.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <li
                  key={item.id}
                  className={item.available ? "card menu-item" : "card"}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1rem 1.1rem",
                    background: item.available ? "var(--card)" : "var(--card-alt)",
                    opacity: item.available ? 1 : 0.7,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "1rem" }}>{item.name}</div>
                    {item.description && (
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>
                        {item.description}
                      </div>
                    )}
                    {(item.allergenInfo || item.dietaryNotes) && (
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6, lineHeight: 1.35 }}>
                        {item.dietaryNotes && <span style={{ marginRight: 10 }}><strong>Diet:</strong> {item.dietaryNotes}</span>}
                        {item.allergenInfo && <span><strong>Allergens:</strong> {item.allergenInfo}</span>}
                      </div>
                    )}
                    {!item.available && (
                      <span className="badge badge-soldout" style={{ marginTop: 6 }}>
                        Sold out
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexShrink: 0 }}>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "0.95rem" }}>
                      {formatPrice(item.priceCents)}
                    </span>
                    {item.available && qty === 0 && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          if (!loggedIn) {
                            router.push("/login");
                            return;
                          }
                          setQty(item.id, 1);
                        }}
                      >
                        Add
                      </button>
                    )}
                    {item.available && loggedIn && qty > 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          background: "var(--card-alt)",
                          borderRadius: 8,
                          padding: "0.25rem 0.4rem",
                        }}
                      >
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => setQty(item.id, qty - 1)}
                          aria-label="Decrease"
                        >
                          −
                        </button>
                        <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600, fontSize: "0.9rem" }}>
                          {qty}
                        </span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => setQty(item.id, qty + 1)}
                          aria-label="Increase"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {totalCount > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: "1rem",
            background: "#0f172a",
            color: "white",
            padding: "0.85rem 1rem 0.85rem 1.25rem",
            borderRadius: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "var(--shadow-lg)",
            marginTop: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--brand)",
                fontSize: "0.85rem",
                fontWeight: 700,
              }}
            >
              {totalCount}
            </span>
            <div style={{ fontSize: "0.95rem" }}>
              <div style={{ fontSize: "0.75rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Your order
              </div>
              <strong style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.05rem" }}>
                {formatPrice(totalCents)}
              </strong>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!loggedIn) {
                router.push("/login");
                return;
              }
              setCheckoutOpen((v) => !v);
            }}
            disabled={submitting}
            className="btn btn-light"
          >
            {checkoutOpen ? "Close" : "Checkout →"}
          </button>
        </div>
      )}

      {checkoutOpen && totalCount > 0 && (
        <div className="card" style={{ padding: "1.1rem 1.25rem", marginTop: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Checkout</h3>
          <p style={{ margin: "0.25rem 0 1rem", color: "var(--muted)", fontSize: "0.9rem" }}>
            Select a 15‑minute pickup window (next 2 hours) and pay to reserve your items.
          </p>

          {windowsError && (
            <div
              style={{
                background: "var(--danger-soft)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                padding: "0.75rem 0.9rem",
                borderRadius: "var(--radius)",
                marginBottom: "0.85rem",
                fontSize: "0.9rem",
              }}
            >
              {windowsError}
            </div>
          )}

          {windowsLoading && <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Loading pickup windows…</div>}

          {!windowsLoading && windows && windows.windows.length === 0 && (
            <div
              style={{
                background: "var(--warning-soft)",
                border: "1px solid var(--warning)",
                color: "var(--warning)",
                padding: "0.75rem 0.9rem",
                borderRadius: "var(--radius)",
                marginBottom: "0.85rem",
                fontSize: "0.9rem",
              }}
            >
              All pickup windows for the next 2 hours are full. Try again later or pre‑order for the next day.
            </div>
          )}

          {!windowsLoading && windows && windows.windows.length > 0 && (
            <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.85rem" }}>
              {windows.windows.map((w) => {
                const suggested = windows.suggestedWindowId === w.id;
                return (
                  <label
                    key={w.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.7rem 0.75rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: selectedWindowId === w.id ? "var(--brand-soft)" : "white",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <input
                        type="radio"
                        name="pickupWindow"
                        value={w.id}
                        checked={selectedWindowId === w.id}
                        onChange={() => setSelectedWindowId(w.id)}
                      />
                      <span style={{ fontWeight: 600 }}>{formatTimeRange(w.startTime, w.endTime)}</span>
                      {suggested && (
                        <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                          Suggested
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{w.remaining} left</span>
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ marginBottom: "0.9rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
              Notes (dietary / allergen)
            </label>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. no peanuts, less spicy"
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              Payment method: <strong style={{ color: "var(--text)" }}>Card</strong> (demo)
            </div>
            <button type="button" onClick={placeOrder} disabled={submitting || !selectedWindowId} className="btn btn-primary">
              {submitting ? "Paying…" : "Pay & place order"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
