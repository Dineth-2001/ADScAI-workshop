"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function KitchenOrderActions(props: { orderId: string; currentStatus: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: string) {
    setSubmitting(status);
    setError(null);
    try {
      const res = await fetch(`/api/kitchen/orders/${props.orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(null);
    }
  }

  const s = props.currentStatus.toLowerCase();
  const canPrepare = s === "pending";
  const canReady = s === "pending" || s === "preparing";
  const canHandoff = s === "ready";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {canPrepare && (
          <button type="button" className="btn btn-secondary" style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }} disabled={!!submitting} onClick={() => setStatus("preparing")}>
            {submitting === "preparing" ? "…" : "Preparing"}
          </button>
        )}
        {canReady && (
          <button type="button" className="btn btn-primary" style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }} disabled={!!submitting} onClick={() => setStatus("ready")}>
            {submitting === "ready" ? "…" : "Ready"}
          </button>
        )}
        {canHandoff && (
          <button type="button" className="btn btn-secondary" style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }} disabled={!!submitting} onClick={() => setStatus("handed_off")}>
            {submitting === "handed_off" ? "…" : "Handed off"}
          </button>
        )}
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{error}</div>}
    </div>
  );
}
