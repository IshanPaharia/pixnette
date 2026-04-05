import { PALETTE } from '../utils/palette';
import { memo, useState, useCallback, useRef, useEffect } from 'react';

function ToolbarComponent({ selectedColor, onSelectColor, onPlace, cooldownRemaining }) {
  const isReady = cooldownRemaining === 0;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((i) => {
    onSelectColor(i);
    setIsDropdownOpen(false);
  }, [onSelectColor]);

  return (
    <div className="h-[72px] sm:h-[80px] lg:h-[88px] flex-none bg-[var(--color-surface)]/70 backdrop-blur-md border-t border-[var(--color-border)] flex items-center justify-between px-3 sm:px-6 fixed bottom-0 w-full z-20 box-border">
      <button 
        onClick={onPlace}
        disabled={!isReady}
        className={`font-mono text-[10px] sm:text-[11px] font-bold px-4 sm:px-6 py-2 sm:py-2.5 rounded transition-all flex-shrink-0
          ${isReady ? 'border border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 shadow-[0_0_10px_rgba(62,207,110,0.1)]' : 'opacity-40 border border-gray-600 text-gray-400 bg-transparent cursor-not-allowed'}`}
      >
        PLACE
      </button>

      {/* Progressive Responsive Color Picker */}
      <div className="flex-1 mx-2 sm:mx-4 flex justify-center h-full items-center">
        
        {/* STAGE 1 (Desktop): Single Row Flex (>= 1024px) */}
        <div className="hidden lg:flex gap-2 items-center">
          {PALETTE.map((hex, i) => (
            <PaletteButton key={i} hex={hex} isSelected={selectedColor === i} onClick={() => onSelectColor(i)} />
          ))}
        </div>

        {/* STAGE 2 & 3: Two Rows Grid (440px - 1024px) */}
        <div className="hidden min-[440px]:grid lg:hidden grid-rows-2 grid-cols-8 gap-2">
          {PALETTE.map((hex, i) => (
            <PaletteButton 
              key={i} 
              hex={hex} 
              isSelected={selectedColor === i} 
              onClick={() => onSelectColor(i)} 
              sizeClass="w-[24px] h-[24px] sm:w-[32px] sm:h-[32px]" // Stage 3 small (24px), Stage 2 large (32px)
            />
          ))}
        </div>

        {/* STAGE 4 (Tiny Mobile): Dropdown (< 440px) */}
        <div className="flex min-[440px]:hidden relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-md active:bg-white/10 transition-colors"
                aria-label="Select Color"
            >
                <div style={{ backgroundColor: PALETTE[selectedColor] }} className="w-4 h-4 rounded-sm border border-white/20 shadow-sm" />
                <span className="font-mono text-[11px] text-gray-300 font-bold">COLOR</span>
                <span className={`text-[8px] text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {isDropdownOpen && (
                <div className="absolute bottom-[130%] left-1/2 -translate-x-1/2 p-2 bg-[var(--color-surface)]/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200 min-w-max">
                    <div className="grid grid-cols-4 gap-2.5">
                        {PALETTE.map((hex, i) => (
                            <PaletteButton 
                                key={i} 
                                hex={hex} 
                                isSelected={selectedColor === i} 
                                onClick={() => handleSelect(i)} 
                                sizeClass="w-[30px] h-[30px]"
                            />
                        ))}
                    </div>
                    {/* Arrow */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[var(--color-border)]" />
                    <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[7px] border-t-[var(--color-surface)]" />
                </div>
            )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <span className="font-mono text-[11px] sm:text-sm text-gray-300 w-6 sm:w-8 text-right block">
          {isReady ? 'RDY' : `${cooldownRemaining}s`}
        </span>
        <CooldownRing remaining={cooldownRemaining} total={30} />
      </div>
    </div>
  );
}

function PaletteButton({ hex, isSelected, onClick, sizeClass = "w-[32px] h-[32px]" }) {
    return (
        <button
            onClick={onClick}
            style={{ backgroundColor: hex }}
            className={`${sizeClass} rounded-sm transition-transform cursor-pointer flex-shrink-0
                ${isSelected ? 'scale-[1.2] border-2 border-white shadow-lg z-10' : 'hover:scale-[1.1] border border-black/40'}`}
        />
    );
}

function CooldownRing({ remaining, total }) {
  const r = 12;
  const circ = 2 * Math.PI * r;
  const isReady = remaining === 0;
  const offset = isReady ? 0 : circ * (1 - remaining / total);
  const color = isReady ? 'var(--color-accent)' : (remaining <= 5 ? '#f5a623' : 'var(--color-text-main)');

  return (
    <div className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
      <svg className="w-7 h-7 sm:w-8 sm:h-8 -rotate-90">
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" className="sm:cx-16 sm:cy-16" />
        <circle 
          cx="14" cy="14" r={r} fill="none" 
          stroke={color} strokeWidth="2.5"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear sm:cx-16 sm:cy-16"
        />
      </svg>
      {isReady && <span className="absolute text-[10px] sm:text-[12px] font-bold text-[var(--color-accent)] leading-none mt-[1px]">✓</span>}
    </div>
  );
}

export const Toolbar = memo(ToolbarComponent);
