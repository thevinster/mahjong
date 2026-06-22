'use client';
import type { Seat, TaiItem } from '@mahjong/engine';
import { useGame } from '@/hooks/useGame';

export function EndPanel({
  winner, score, viewerSeat,
}: {
  winner: Seat | null;
  score: Readonly<Record<Seat, number>>;
  viewerSeat: Seat;
}) {
  const log = useGame((s) => s.log);
  const won = [...log].reverse().find((e) => e.ev.t === 'won');
  const breakdown: readonly TaiItem[] = won && won.ev.t === 'won' ? won.ev.breakdown : [];
  const total = breakdown.reduce((n, b) => n + b.tai, 0);

  return (
    <div style={{ marginTop: 16, padding: 16, background: '#eaf7ea', border: '1px solid #bcdcbc', borderRadius: 8 }}>
      <h3 style={{ margin: '0 0 10px' }}>
        {winner === null ? 'Draw — wall exhausted' : `Seat ${winner}${winner === viewerSeat ? ' (You)' : ''} wins!`}
      </h3>

      {winner !== null && breakdown.length > 0 && (
        <table style={{ borderCollapse: 'collapse', fontSize: 14, marginBottom: 12 }}>
          <tbody>
            {breakdown.map((b, i) => (
              <tr key={i}>
                <td style={{ padding: '1px 16px 1px 0', color: '#333' }}>{taiLabel(b.name)}</td>
                <td style={{ padding: '1px 0', textAlign: 'right', fontWeight: 600 }}>+{b.tai}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid #bcdcbc' }}>
              <td style={{ padding: '4px 16px 0 0', fontWeight: 700 }}>Total</td>
              <td style={{ padding: '4px 0 0', textAlign: 'right', fontWeight: 700 }}>{total} tai</td>
            </tr>
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
        {([0, 1, 2, 3] as Seat[]).map((s) => (
          <span key={s} style={{ color: score[s] > 0 ? '#1e8449' : score[s] < 0 ? '#c0392b' : '#777' }}>
            Seat {s}{s === viewerSeat ? ' (You)' : ''}: {score[s] > 0 ? '+' : ''}{score[s]}
          </span>
        ))}
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
