import type { ReactNode } from 'react';

export const metadata = {
  title: 'Mahjong',
  description: 'Online 4-player Taiwanese mahjong',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
