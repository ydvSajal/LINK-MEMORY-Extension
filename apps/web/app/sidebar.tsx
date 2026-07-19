'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { TagCount } from '@recall/types';

export const TYPES = ['link', 'article', 'video', 'tweet', 'text'] as const;
export const SOURCES = ['extension', 'web', 'telegram'] as const;

export type BoardFilters = { tag: string | null; type: string | null; source: string | null };

function Item({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors ${
        active
          ? 'bg-white/[.06] font-medium text-neutral-50'
          : 'text-neutral-400 hover:bg-white/[.04] hover:text-neutral-200'
      }`}
    >
      <span className="truncate capitalize">{children}</span>
      {count !== undefined && <span className="text-xs text-neutral-600">{count}</span>}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-neutral-600">
      {children}
    </div>
  );
}

export default function Sidebar({
  tags = [],
  filters,
  profile,
}: {
  tags?: TagCount[];
  filters?: BoardFilters;
  profile?: { email: string };
}) {
  const pathname = usePathname();
  const onBoard = pathname === '/';

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col overflow-y-auto border-r border-white/[.06] px-3 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-2 pb-4">
          <span className="h-[18px] w-[18px] rounded-[5px] bg-gradient-to-br from-neutral-50 to-neutral-500" />
          <span className="text-[15px] font-semibold tracking-tight">Recall</span>
        </Link>

        <Item href="/" active={onBoard && !filters?.type && !filters?.tag && !filters?.source}>
          Memories
        </Item>
        <Item href="/todos" active={pathname.startsWith('/todos')}>
          To-dos
        </Item>

        {onBoard && (
          <>
            <SectionLabel>Type</SectionLabel>
            {TYPES.map((t) => (
              <Item key={t} href={filters?.type === t ? '/' : `/?type=${t}`} active={filters?.type === t}>
                {t}
              </Item>
            ))}

            <SectionLabel>Source</SectionLabel>
            {SOURCES.map((s) => (
              <Item key={s} href={filters?.source === s ? '/' : `/?source=${s}`} active={filters?.source === s}>
                {s}
              </Item>
            ))}

            {tags.length > 0 && (
              <>
                <SectionLabel>Tags</SectionLabel>
                {tags.map((t) => (
                  <Item
                    key={t.name}
                    href={filters?.tag === t.name ? '/' : `/?tag=${encodeURIComponent(t.name)}`}
                    active={filters?.tag === t.name}
                    count={t.count}
                  >
                    #{t.name}
                  </Item>
                ))}
              </>
            )}
          </>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-white/[.06] px-2 pt-4">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-semibold uppercase text-neutral-300">
            {profile?.email?.charAt(0) || '?'}
          </span>
          <span className="truncate text-xs text-neutral-400">{profile?.email}</span>
          <Link href="/settings" aria-label="Settings" className="ml-auto text-neutral-600 hover:text-neutral-300">
            ⚙
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/[.06] bg-shell/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-gradient-to-br from-neutral-50 to-neutral-500" />
          <span className="text-sm font-semibold">Recall</span>
        </Link>
        <nav className="flex gap-1 text-[13px]">
          <Link
            href="/"
            className={`rounded-md px-2.5 py-1 ${onBoard ? 'bg-white/[.06] text-neutral-50' : 'text-neutral-400'}`}
          >
            Memories
          </Link>
          <Link
            href="/todos"
            className={`rounded-md px-2.5 py-1 ${pathname.startsWith('/todos') ? 'bg-white/[.06] text-neutral-50' : 'text-neutral-400'}`}
          >
            To-dos
          </Link>
        </nav>
        <Link href="/settings" aria-label="Settings" className="ml-auto text-neutral-500 hover:text-neutral-300">
          ⚙
        </Link>
      </header>
    </>
  );
}
