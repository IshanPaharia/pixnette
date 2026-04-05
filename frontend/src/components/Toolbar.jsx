import { PALETTE } from '../utils/palette';

export function Toolbar({ selectedColor, onSelectColor, onPlace, cooldownRemaining }) {
  const isReady = cooldownRemaining === 0;

  return (
    <div className="h-[72px] flex-none bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center justify-between px-6 fixed bottom-0 w-full z-10 box-border">
      <button 
        onClick={onPlace}
        disabled={!isReady}
        className={`font-mono text-[11px] font-bold px-6 py-2.5 rounded transition-all
          ${isReady ? 'border border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 shadow-[0_0_10px_rgba(62,207,110,0.1)]' : 'opacity-40 border border-gray-600 text-gray-400 bg-transparent cursor-not-allowed'}`}
      >
        PLACE
      </button>

      <div className="flex gap-1.5 overflow-x-auto max-w-[50vw] px-2 py-1 items-center">
        {PALETTE.map((hex, i) => (
          <button
            key={i}
            onClick={() => onSelectColor(i)}
            style={{ backgroundColor: hex }}
            className={`w-[28px] h-[28px] rounded-sm transition-transform cursor-pointer flex-shrink-0
              ${selectedColor === i ? 'scale-[1.2] border-2 border-white shadow-lg z-10' : 'hover:scale-[1.15] border border-black/40'}`}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-gray-300 w-8 text-right block">
          {isReady ? 'RDY' : `${cooldownRemaining}s`}
        </span>
        <CooldownRing remaining={cooldownRemaining} total={30} />
      </div>
    </div>
  );
}

function CooldownRing({ remaining, total }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const isReady = remaining === 0;
  const offset = isReady ? 0 : circ * (1 - remaining / total);
  const color = isReady ? 'var(--color-accent)' : (remaining <= 5 ? '#f5a623' : 'var(--color-text-main)');

  return (
    <div className="relative w-8 h-8 flex items-center justify-center">
      <svg className="w-8 h-8 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle 
          cx="16" cy="16" r={r} fill="none" 
          stroke={color} strokeWidth="3"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      {isReady && <span className="absolute text-[12px] font-bold text-[var(--color-accent)] leading-none mt-[1px]">✓</span>}
    </div>
  );
}
