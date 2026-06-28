import type { ReactNode } from 'react';

export const metadata = {
  title: 'Mahjong',
  description: 'Online 4-player Taiwanese mahjong',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, padding: 0,
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse at top, #26392f 0%, #120f0b 72%)',
        color: '#f5efe1',
      }}>
        {children}
      </body>
    </html>
  );
}
