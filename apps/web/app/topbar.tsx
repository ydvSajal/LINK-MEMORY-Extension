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

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[.06] bg-shell/90 px-4 backdrop-blur">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-[6px] bg-gradient-to-br from-neutral-50 to-neutral-500" />
          <span className="text-[15px] font-semibold tracking-tight">Recall</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          <NavItem href="/" active={onBoard && !filters?.bin && !filters?.tag && !filters?.type && !filters?.source}>
            Memories
          </NavItem>
          <NavItem href="/todos" active={pathname.startsWith('/todos')}>
            To-dos
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
  );
}
