import { CANVAS_SIZE } from '../utils/canvas';
import { memo, useRef } from 'react';

function TopBarComponent({ liveCount, isConnected, onEnterTimelapse, onUserCountTripleClick }) {
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);

  const handleUserCountClick = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      if (onUserCountTripleClick) onUserCountTripleClick();
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 1500);
    }
  };

  return (
    <div className="h-12 flex-none bg-[var(--color-surface)]/70 backdrop-blur-md border-b border-[var(--color-border)] flex items-center justify-between px-3 sm:px-6 fixed top-0 w-full z-20 box-border">
      <div className="flex items-baseline gap-2 sm:gap-3">
        <h1 className="font-mono text-sm sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5 sm:gap-2">
          <span>🎨</span>
          <span>PIXNETTE</span>
        </h1>
        <span className="font-mono text-[10px] sm:text-xs text-gray-500">{CANVAS_SIZE}×{CANVAS_SIZE}</span>
      </div>
      
      <button
        onClick={onEnterTimelapse}
        className="font-mono text-[10px] sm:text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 px-2.5 py-1 rounded transition-colors active:scale-95"
      >
        TIMELAPSE
      </button>
      <div 
        onClick={handleUserCountClick} 
        className="flex items-center gap-2 cursor-pointer select-none py-1 px-2 rounded hover:bg-white/5 transition-colors"
        title="Live users"
      >
        <div className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
          {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 ${isConnected ? 'bg-[var(--color-accent)]' : 'bg-red-500'}`}></span>
        </div>
        <span className="text-[11px] sm:text-sm font-mono text-gray-300">
          {liveCount} <span className="hidden sm:inline">{liveCount === 1 ? 'user' : 'users'}</span>
        </span>
      </div>
    </div>
  );
}

export const TopBar = memo(TopBarComponent);
