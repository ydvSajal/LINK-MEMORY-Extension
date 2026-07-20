'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { TagCount } from '@recall/types';

export const TYPES = ['link', 'article', 'video', 'tweet', 'text'] as const;
export const SOURCES = ['extension', 'web', 'telegram'] as const;

export type BoardFilters = { tag: string | null; type: string | null; source: string | null; bin?: boolean };

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
    <div className="mt-4 px-2 pb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-neutral-600">
      {children}
    </div>
  );
}

export default function Sidebar({
  tags = [],
  filters,
}: {
  tags?: TagCount[];
  filters?: BoardFilters;
}) {
  const pathname = usePathname();
  const onBoard = pathname === '/';

  if (!onBoard) return null;

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[220px] shrink-0 flex-col border-r border-white/[.06] lg:flex">
      {/* Scrollable filters area (hidden scrollbar) */}
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
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

        {/* Bottom breathing room */}
        <div className="h-4" />
      </div>
    </aside>
  );
}

