'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function BottomNav() {
  const pathname = usePathname() || '/';

  const items: NavItem[] = [
    { href: '/', label: 'Home', icon: <IconHome /> },
    { href: '/weekly', label: 'Weekly', icon: <IconCalendar /> },
    { href: '/all-time', label: 'All-time', icon: <IconTrophy /> },
    { href: '/profile', label: 'Profile', icon: <IconUser /> },
    { href: '/find', label: 'Find', icon: <IconSearch /> },
  ];

  return (
    <div style={wrap}>
      <nav style={pill} aria-label="Bottom navigation">
        {items.map((it) => {
          const active = isActive(pathname, it.href);

          return (
            <Link
              key={it.href}
              href={it.href}
              style={{
                ...item,
                ...(active ? itemActive : null),
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ ...iconWrap, ...(active ? iconWrapActive : null) }}>
                  {it.icon}
                </div>
              </div>

              <div style={{ ...label, ...(active ? labelActive : null) }}>
                {it.label}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 10,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 50,
};

const pill: React.CSSProperties = {
  pointerEvents: 'auto',
  width: 'min(420px, calc(100vw - 24px))',
  display: 'flex',
  justifyContent: 'space-between',
  gap: 4,
  padding: '7px 7px', // slightly slimmer
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.28)',
  background: 'rgba(0, 0, 255, 0.42)', // stronger deep-blue glass
  boxShadow: '0 16px 50px rgba(0,0,0,0.25)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};

const item: React.CSSProperties = {
  flex: 1,
  textDecoration: 'none',
  color: '#FFFFFF', // locked: icon + text white
  borderRadius: 16,
  padding: '6px 4px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  transition: 'all 120ms ease',
};

const itemActive: React.CSSProperties = {
  background: 'rgba(165,210,255,0.55)', // selected: light blue
  color: '#FFFFFF',
};

const iconWrap: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(255,255,255,0.10)',
};

const iconWrapActive: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.14)',
};

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  lineHeight: '11px',
  letterSpacing: 0.2,
  color: '#FFFFFF',
};

const labelActive: React.CSSProperties = {
  fontWeight: 900,
};

/* Icons */

function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3v3M17 3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4h8v3a4 4 0 0 1-8 0V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M6 4H4v3a4 4 0 0 0 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M18 4h2v3a4 4 0 0 1-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M12 11v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 21h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 21a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
