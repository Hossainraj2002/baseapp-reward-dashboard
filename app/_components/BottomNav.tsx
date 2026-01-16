"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/weekly", label: "Weekly" },
  { href: "/all-time", label: "All-time" },
  { href: "/profile", label: "Profile" },
  { href: "/find", label: "Find" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-md"
      aria-label="Bottom navigation"
    >
      <div className="mx-3 mb-3 rounded-3xl border border-slate-200 bg-[#1E4FFF] shadow-lg">
        <div className="grid grid-cols-5 gap-1 p-2">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={[
                  "rounded-2xl px-2 py-2 text-center text-xs font-extrabold",
                  active
                    ? "bg-white text-[#1E4FFF]"
                    : "text-white/90 hover:bg-white/15",
                ].join(" ")}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
