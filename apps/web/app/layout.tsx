import type { Metadata, Viewport } from 'next';
import './globals.css';
import Pwa from './pwa';

export const metadata: Metadata = {
  title: 'Recall',
  description: 'Save anything, remember everything.',
  appleWebApp: { capable: true, title: 'Recall', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0e0e10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-shell text-neutral-50 antialiased">
        {children}
        <Pwa />
      </body>
    </html>
  );
}
