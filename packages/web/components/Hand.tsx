'use client';
import { useEffect, useRef, useState } from 'react';
import { tileId, type Tile } from '@mahjong/engine';
import { TileFace } from './TileFace';
import type { ArrangedTile } from '@/lib/arrange-hand';
import { theme } from '@/lib/theme';

const DRAG_THRESHOLD = 8; // px of movement before a press becomes a drag (not a discard)

export function Hand({
  arranged, legalDiscards, onDiscard, onReorder, size = 64,
}: {
  arranged: ArrangedTile[];
  legalDiscards: ReadonlySet<string>;
  onDiscard: (t: Tile) => void;
  onReorder: (ids: string[]) => void;
  size?: number;
}) {
  // Local working order — mirrors props except while a drag is in flight.
  const [order, setOrder] = useState<ArrangedTile[]>(arranged);
  const draggingRef = useRef(false);
  useEffect(() => { if (!draggingRef.current) setOrder(arranged); }, [arranged]);

  const tileEls = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ key: string; startX: number; startY: number; moved: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent, key: string) {
    drag.current = { key, startX: e.clientX, startY: e.clientY, moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.moved = true;
      draggingRef.current = true;
    }
    // Find the tile nearest the pointer (2D, so wrapping rows work).
    let target = -1, best = Infinity;
    for (let i = 0; i < order.length; i++) {
      const el = tileEls.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (dist < best) { best = dist; target = i; }
    }
    const from = order.findIndex((a) => a.key === d.key);
    if (target !== -1 && from !== -1 && target !== from) {
      setOrder((cur) => {
        const next = [...cur];
        const [moved] = next.splice(from, 1);
        next.splice(target, 0, moved!);
        return next;
      });
    }
  }

  function onPointerUp(e: React.PointerEvent, a: ArrangedTile) {
    const d = drag.current;
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d?.moved) {
      draggingRef.current = false;
      onReorder(order.map((x) => tileId(x.tile)));
    } else if (legalDiscards.has(tileId(a.tile))) {
      onDiscard(a.tile);
    }
  }

  function onPointerCancel() {
    drag.current = null;
    draggingRef.current = false;
    setOrder(arranged);
  }

  const drawnCount = order.filter((a) => a.drawn).length;
  const handCount = order.length - drawnCount;

  return (
    <div style={{
      padding: '0.55rem 0.85rem 0.7rem', borderRadius: 14,
      background: theme.wood, border: `1px solid ${theme.woodBorder}`,
      boxShadow: '0 8px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.14)',
    }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>
        {drawnCount > 0
          ? `Your hand (${handCount}) + ${drawnCount} just drawn — tap to discard, drag to rearrange, Sort to merge in`
          : `Your hand (${handCount}) — drag to rearrange, tap to discard`}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', minHeight: size, paddingTop: 22 }}>
        {order.map((a, i) => {
          const id = tileId(a.tile);
          const legal = legalDiscards.has(id);
          return (
            <div
              key={a.key}
              ref={(el) => { tileEls.current[i] = el; }}
              onPointerDown={(e) => onPointerDown(e, a.key)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, a)}
              onPointerCancel={onPointerCancel}
              style={{
                position: 'relative',
                touchAction: 'none', userSelect: 'none', cursor: 'grab',
                margin: '0.15rem',
                // Hold the drawn tile visibly apart from the 16-tile hand.
                marginLeft: a.drawn ? 28 : undefined,
                borderLeft: a.drawn ? '2px dashed #f5c518' : undefined,
                paddingLeft: a.drawn ? 10 : undefined,
                transform: a.drawn ? 'translateY(-14px)' : undefined,
                filter: a.drawn ? 'drop-shadow(0 0 9px #f5c518)' : undefined,
                opacity: legal || a.drawn ? 1 : 0.6,
                transition: 'transform 0.2s ease, filter 0.2s ease',
              }}
            >
              {a.drawn && (
                <span
                  style={{
                    position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                    background: '#f5c518', color: '#222', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.04em', padding: '1px 6px', borderRadius: 7,
                    pointerEvents: 'none', whiteSpace: 'nowrap',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                  }}
                >
                  NEW
                </span>
              )}
              <TileFace tile={a.tile} size={size} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
