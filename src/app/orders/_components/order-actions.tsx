"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderActions(props: {
  orderId: string;
  status: string;
  pickupWindowStartTime: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = props.status.toLowerCase();
  const cancellable = status === "pending" || status === "preparing";

  async function cancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${props.orderId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setSubmitting(false);
    }
  }

  if (!cancellable) return null;

  const start = new Date(props.pickupWindowStartTime);
  const cutoff = new Date(start.getTime() - 10 * 60_000);
  const maybeTooLate = Date.now() > cutoff.getTime();

  return (
    <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
      {error && (
        <div
          style={{
            background: "var(--danger-soft)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "0.6rem 0.75rem",
            borderRadius: "var(--radius)",
            marginBottom: "0.65rem",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}
      <button type="button" className="btn btn-secondary" disabled={submitting || maybeTooLate} onClick={cancel}>
        {submitting ? "Canceling…" : "Cancel order"}
      </button>
      {maybeTooLate && (
        <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 6 }}>
          Cancellation closes 10 minutes before the window.
        </div>
      )}
    </div>
  );
}
