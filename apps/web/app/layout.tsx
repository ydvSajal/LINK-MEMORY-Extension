import type { Metadata, Viewport } from 'next';
import './globals.css';
import Pwa from './pwa';

export const metadata: Metadata = {
  title: 'Recall',
  description: 'Save anything, remember everything.',
  appleWebApp: { capable: true, title: 'Recall', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        {children}
        <Pwa />
      </body>
    </html>
  );
}
