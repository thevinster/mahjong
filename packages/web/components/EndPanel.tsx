'use client';
import type { Seat, TaiItem } from '@mahjong/engine';
import { useGame } from '@/hooks/useGame';
import { theme } from '@/lib/theme';

export function EndPanel({
  winner, score, viewerSeat, isHost, onNewGame, starting,
}: {
  winner: Seat | null;
  score: Readonly<Record<Seat, number>>;
  viewerSeat: Seat;
  isHost: boolean;
  onNewGame: () => void;
  starting: boolean;
}) {
  const log = useGame((s) => s.log);
  const won = [...log].reverse().find((e) => e.ev.t === 'won');
  const breakdown: readonly TaiItem[] = won && won.ev.t === 'won' ? won.ev.breakdown : [];
  const total = breakdown.reduce((n, b) => n + b.tai, 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', padding: 16,
    }}>
      <div style={{
        width: 'min(420px, 92vw)', padding: 22, borderRadius: 18, color: theme.ink,
        background: 'linear-gradient(180deg, #16271d, #0e1c14)',
        border: `1px solid ${theme.panelBorder}`,
        boxShadow: '0 24px 70px rgba(0,0,0,0.6)',
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 20 }}>
          {winner === null
            ? '🀄 Draw — wall exhausted'
            : `🏆 ${winner === viewerSeat ? 'You win' : `Seat ${winner} wins`}!`}
        </h3>

        {winner !== null && breakdown.length > 0 && (
          <table style={{ borderCollapse: 'collapse', fontSize: 14, marginBottom: 14, width: '100%' }}>
            <tbody>
              {breakdown.map((b, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 16px 2px 0', color: theme.inkDim }}>{taiLabel(b.name)}</td>
                  <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600 }}>+{b.tai}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `1px solid ${theme.panelBorder}` }}>
                <td style={{ padding: '6px 16px 0 0', fontWeight: 800 }}>Total</td>
                <td style={{ padding: '6px 0 0', textAlign: 'right', fontWeight: 800, color: theme.gold }}>{total} tai</td>
              </tr>
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: 14, fontSize: 13, flexWrap: 'wrap' }}>
          {([0, 1, 2, 3] as Seat[]).map((s) => (
            <span key={s} style={{ color: score[s] > 0 ? '#7ee2a0' : score[s] < 0 ? '#f0918a' : theme.inkDim }}>
              {s === viewerSeat ? 'You' : `Seat ${s}`}: {score[s] > 0 ? '+' : ''}{score[s]}
            </span>
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          {isHost ? (
            <button
              onClick={onNewGame}
              disabled={starting}
              style={{
                padding: '0.6rem 1.4rem', borderRadius: 999, border: 'none',
                background: theme.gold, color: '#2a2113', fontSize: 15, fontWeight: 700,
                cursor: starting ? 'default' : 'pointer', width: '100%',
              }}
            >
              {starting ? 'Dealing…' : 'Start new hand'}
            </button>
          ) : (
            <p style={{ margin: 0, color: theme.inkDim, fontSize: 13 }}>Waiting for the host to start a new hand…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function taiLabel(name: string): string {
  const base = name.replace(/-exposed$/, '');
  const map: Record<string, string> = {
    'base': 'Base',
    'self-draw': 'Self-draw',
    'flower': 'Flower',
    'dragon-R': 'Red dragon',
    'dragon-G': 'Green dragon',
    'dragon-Wh': 'White dragon',
    'seat-wind': 'Seat wind',
    'prevailing-wind': 'Prevailing wind',
  };
  return map[base] ?? base;
}
