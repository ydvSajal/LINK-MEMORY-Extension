'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Memories' },
  { href: '/todos', label: 'To-dos' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 items-center gap-1 rounded-lg bg-neutral-900 p-1">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              active ? 'bg-violet-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
