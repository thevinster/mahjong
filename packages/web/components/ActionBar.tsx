'use client';
import type { Intent, Seat } from '@mahjong/engine';

export function ActionBar({
  legalIntents, onIntent,
}: {
  legalIntents: readonly Intent[];
  onIntent: (i: Intent) => void;
}) {
  const passIntent = legalIntents.find((i) => i.t === 'pass');
  const winIntents = legalIntents.filter((i) => i.t === 'declareSelfWin' || (i.t === 'claim' && i.kind === 'win'));
  const pongIntents = legalIntents.filter((i) => i.t === 'claim' && i.kind === 'pong');
  const chowIntents = legalIntents.filter((i) => i.t === 'claim' && i.kind === 'chow');
  const kongIntents = legalIntents.filter((i) =>
    (i.t === 'claim' && i.kind === 'kong') || i.t === 'declareConcealedKong'
  );

  return (
    <div style={{ padding: '0.5rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {winIntents.map((i, k) => (
        <button key={`w${k}`} onClick={() => onIntent(i)} style={btn('#5e5')}>Win!</button>
      ))}
      {kongIntents.map((i, k) => (
        <button key={`k${k}`} onClick={() => onIntent(i)} style={btn('#aaf')}>Kong</button>
      ))}
      {pongIntents.map((i, k) => (
        <button key={`p${k}`} onClick={() => onIntent(i)} style={btn('#fa5')}>Pong</button>
      ))}
      {chowIntents.map((i, k) => (
        <button key={`c${k}`} onClick={() => onIntent(i)} style={btn('#ff8')}>Chow {k + 1}</button>
      ))}
      {passIntent && <button onClick={() => onIntent(passIntent)} style={btn('#ccc')}>Pass</button>}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { padding: '0.5rem 1rem', background: bg, border: '1px solid #888', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' };
}
