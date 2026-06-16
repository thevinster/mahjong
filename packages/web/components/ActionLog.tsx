'use client';
import { useGame } from '@/hooks/useGame';

export function ActionLog() {
  const log = useGame((s) => s.log);
  return (
    <div style={{
      padding: '0.5rem', background: '#fffef0', border: '1px solid #ddc',
      borderRadius: 6, height: 200, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Log</div>
      {log.slice(-50).map((e) => (
        <div key={e.id}>{e.text}</div>
      ))}
    </div>
  );
}
