export function Tooltip({ show, x, y, hex, clientX, clientY }) {
  if (!show) return null;
  
  // Prevent floating tooltip from going off-screen (especially on small mobile screens)
  const tooltipWidth = 110;
  const tooltipHeight = 26;
  const posX = Math.max(10, Math.min(clientX + 15, window.innerWidth - tooltipWidth - 10));
  const posY = Math.max(10, Math.min(clientY + 15, window.innerHeight - tooltipHeight - 10));
  return (
    <div 
      className="fixed pointer-events-none z-50 bg-black/80 font-mono text-[10px] px-2 py-1 rounded border border-white/10 text-white flex items-center gap-2 shadow-lg"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${posX}px, ${posY}px, 0)`
      }}
    >
      <span>{x}, {y}</span>
      {hex && (
        <>
          <span className="opacity-50">·</span>
          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: hex }} />
          <span className="uppercase text-gray-300">{hex}</span>
        </>
      )}
    </div>
  );
}
