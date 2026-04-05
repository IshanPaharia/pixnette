import { CANVAS_SIZE } from '../utils/canvas';
import { memo } from 'react';

function TopBarComponent({ liveCount, isConnected, cursor }) {
  return (
    <div className="h-12 flex-none bg-[var(--color-surface)]/70 backdrop-blur-md border-b border-[var(--color-border)] flex items-center justify-between px-3 sm:px-6 fixed top-0 w-full z-20 box-border">
      <div className="flex items-baseline gap-2 sm:gap-3">
        <h1 className="font-mono text-sm sm:text-lg font-bold tracking-tight text-white">PIXNETTE</h1>
        <span className="font-mono text-[10px] sm:text-xs text-gray-500">{CANVAS_SIZE}×{CANVAS_SIZE}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
          {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 ${isConnected ? 'bg-[var(--color-accent)]' : 'bg-red-500'}`}></span>
        </div>
        <span className="text-[11px] sm:text-sm font-mono text-gray-300">
          {liveCount} <span className="hidden sm:inline">{liveCount === 1 ? 'user' : 'users'}</span>
        </span>
      </div>
      
      <div className="font-mono text-[11px] sm:text-sm text-gray-400 w-16 sm:w-24 text-right hidden xs:block">
        {cursor.x !== -1 && cursor.y !== -1 ? `${cursor.x}, ${cursor.y}` : '—'}
      </div>
    </div>
  );
}

export const TopBar = memo(TopBarComponent);
