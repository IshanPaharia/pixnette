import { CANVAS_SIZE } from '../utils/canvas';

export function TopBar({ liveCount, isConnected, cursor }) {
  return (
    <div className="h-12 flex-none bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-4 fixed top-0 w-full z-10 box-border">
      <div className="flex items-baseline gap-3">
        <h1 className="font-mono text-lg font-bold tracking-tight text-white">PIXNETTE</h1>
        <span className="font-mono text-xs text-gray-500">{CANVAS_SIZE}×{CANVAS_SIZE}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="relative flex h-2.5 w-2.5">
          {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-[var(--color-accent)]' : 'bg-red-500'}`}></span>
        </div>
        <span className="text-sm font-mono text-gray-300">
          {liveCount} {liveCount === 1 ? 'user' : 'users'}
        </span>
      </div>
      
      <div className="font-mono text-sm text-gray-400 w-24 text-right">
        {cursor.x !== -1 && cursor.y !== -1 ? `${cursor.x}, ${cursor.y}` : '—'}
      </div>
    </div>
  );
}
