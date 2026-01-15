"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/weekly", label: "Weekly" },
  { href: "/alltime", label: "All-time" },
  { href: "/me", label: "Me" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bn">
      <div className="bnInner">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`bnItem ${active ? "bnActive" : ""}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <style jsx>{`
        .bn {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          padding: 10px 12px 12px;
          pointer-events: none;
        }

        .bnInner {
          pointer-events: auto;
          max-width: 430px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;

          border-radius: 18px;
          padding: 10px;

          /* Liquid-glass royal blue */
          background: rgba(30, 79, 255, 0.88);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 10px 30px rgba(2, 8, 23, 0.18);
        }

        .bnItem {
          text-align: center;
          padding: 10px 8px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.85);
          letter-spacing: -0.1px;
          user-select: none;
        }

        .bnActive {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.22);
        }
      `}</style>
    </nav>
  );
}
