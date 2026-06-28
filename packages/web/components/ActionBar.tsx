'use client';
import type { Intent, Tile } from '@mahjong/engine';
import { TileFace } from './TileFace';
import { claimTiles } from '@/lib/action-label';

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
        <ActionButton key={`w${k}`} bg="#5e5" onClick={() => onIntent(i)}
          label={i.t === 'declareSelfWin' ? 'Win! (self-draw)' : 'Win!'} tiles={claimTiles(i)} />
      ))}
      {kongIntents.map((i, k) => (
        <ActionButton key={`k${k}`} bg="#aaf" onClick={() => onIntent(i)}
          label={i.t === 'declareConcealedKong' ? 'Kong (concealed)' : 'Kong'} tiles={claimTiles(i)} />
      ))}
      {pongIntents.map((i, k) => (
        <ActionButton key={`p${k}`} bg="#fa5" onClick={() => onIntent(i)}
          label="Pong" tiles={claimTiles(i)} />
      ))}
      {chowIntents.map((i, k) => (
        <ActionButton key={`c${k}`} bg="#ff8" onClick={() => onIntent(i)}
          label={chowIntents.length > 1 ? `Chow ${k + 1}` : 'Chow'} tiles={claimTiles(i)} />
      ))}
      {passIntent && (
        <ActionButton bg="#ccc" onClick={() => onIntent(passIntent)} label="Pass" tiles={[]} />
      )}
    </div>
  );
}

/** A claim/action button: a text label followed by the tile faces it references. */
function ActionButton({
  label, tiles, bg, onClick,
}: {
  label: string;
  tiles: Tile[];
  bg: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={btn(bg)}>
      <span style={{ marginRight: tiles.length ? 6 : 0 }}>{label}</span>
      {tiles.map((t, i) => <TileFace key={i} tile={t} size={30} />)}
    </button>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: '0.4rem 0.7rem', background: bg,
    border: '1px solid #888', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
  };
}
