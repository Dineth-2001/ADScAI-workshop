"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/menu", label: "Menu" },
  { href: "/orders", label: "Orders" },
  { href: "/kitchen", label: "Kitchen" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: "0.25rem" }}>
      {links.map((l) => {
        const active = pathname === l.href || pathname?.startsWith(l.href + "/");
        return (
          <a key={l.href} href={l.href} className={`nav-link${active ? " active" : ""}`}>
            {l.label}
          </a>
        );
      })}
    </nav>
  );
}
