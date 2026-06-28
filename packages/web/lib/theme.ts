import type { CSSProperties } from 'react';

/**
 * Shared visual tokens for the mahjong-table look. Pure data + tiny style
 * helpers (no React component logic) so both server and client components can
 * import them. Used to dress the existing components as a felt table — no game
 * behaviour depends on anything here.
 */
export const theme = {
  feltBg: 'radial-gradient(ellipse 120% 95% at 50% 34%, #2c9460 0%, #1a7047 45%, #0e5030 100%)',
  feltEdge: '#0b3d27',
  wood: 'linear-gradient(180deg, #7c5430 0%, #543620 58%, #3f2814 100%)',
  woodBorder: '#2c1b0d',
  gold: '#f0c850',
  goldSoft: 'rgba(240, 200, 80, 0.5)',
  ink: '#f5efe1',
  inkDim: 'rgba(245, 239, 225, 0.62)',
  panel: 'rgba(7, 32, 21, 0.72)',
  panelBorder: 'rgba(240, 200, 80, 0.28)',
  plate: 'rgba(6, 26, 17, 0.6)',
  pageBg: 'radial-gradient(ellipse at top, #26392f 0%, #120f0b 72%)',
} as const;

/** Pill name-plate; glows gold when it's that seat's turn. */
export function namePlate(active: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '2px 10px', borderRadius: 999,
    background: active ? theme.gold : theme.plate,
    color: active ? '#2a2113' : theme.ink,
    fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
    border: `1px solid ${active ? theme.gold : 'rgba(240,200,80,0.25)'}`,
    boxShadow: active ? `0 0 16px ${theme.goldSoft}` : 'none',
  };
}

/** Translucent dark card that reads well on the felt. */
export function panelStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: theme.panel,
    border: `1px solid ${theme.panelBorder}`,
    borderRadius: 14,
    color: theme.ink,
    ...extra,
  };
}
