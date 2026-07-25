'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { BoardFilters } from './sidebar';

function NavItem({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-white/[.08] text-neutral-50' : 'text-neutral-400 hover:bg-white/[.04] hover:text-neutral-200'
      }`}
    >
      {children}
    </Link>
  );
}

/* ── Mobile bottom-nav icon helpers ── */
function MemoriesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function TodosIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function SubsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

function BinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

function MobileNavItem({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
        active ? 'text-neutral-50' : 'text-neutral-500'
      }`}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

export default function Topbar({
  profile,
  filters,
  searchSlot,
}: {
  profile?: { email: string };
  filters?: BoardFilters;
  searchSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const onBoard = pathname === '/';
  const isAllMemories = onBoard && !filters?.bin && !filters?.tag && !filters?.type && !filters?.source;

  return (
    <>
      {/* ── Desktop / shared top bar ── */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[.06] bg-shell/90 px-4 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-6 w-6 rounded-[6px]" />
            <span className="text-[15px] font-semibold tracking-tight">Recall</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            <NavItem href="/" active={isAllMemories}>
              Memories
            </NavItem>
            <NavItem href="/todos" active={pathname.startsWith('/todos')}>
              To-dos
            </NavItem>
            <NavItem href="/subscriptions" active={pathname.startsWith('/subscriptions')}>
              Subscriptions
            </NavItem>
            <NavItem href="/?bin=1" active={Boolean(filters?.bin)}>
              Bin
            </NavItem>
          </nav>
        </div>

        <div className="flex flex-1 items-center justify-end gap-4 lg:justify-center">
          <div className="w-full max-w-md">
            {searchSlot}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/settings" aria-label="Settings" className="text-neutral-500 hover:text-neutral-300">
            ⚙
          </Link>
          {profile && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold uppercase text-neutral-300">
              {profile.email.charAt(0)}
            </div>
          )}
        </div>
      </header>

      {/* ── Mobile bottom navigation ── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-white/[.08] bg-shell/95 backdrop-blur-xl lg:hidden">
        <MobileNavItem href="/" active={isAllMemories} icon={<MemoriesIcon />}>
          Memories
        </MobileNavItem>
        <MobileNavItem href="/todos" active={pathname.startsWith('/todos')} icon={<TodosIcon />}>
          To-dos
        </MobileNavItem>
        <MobileNavItem href="/subscriptions" active={pathname.startsWith('/subscriptions')} icon={<SubsIcon />}>
          Subs
        </MobileNavItem>
        <MobileNavItem href="/?bin=1" active={Boolean(filters?.bin)} icon={<BinIcon />}>
          Bin
        </MobileNavItem>
      </nav>
    </>
  );
}
