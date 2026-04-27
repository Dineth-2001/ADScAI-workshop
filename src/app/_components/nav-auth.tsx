"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth/client";

export function NavAuth() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  if (isPending) return <span style={{ fontSize: "0.85rem" }}>…</span>;

  if (!session?.user) {
    return (
      <a href="/login" style={{ fontSize: "0.85rem" }}>
        Sign in
      </a>
    );
  }

  return (
    <span style={{ fontSize: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <span>{session.user.name || session.user.email}</span>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </span>
  );
}
