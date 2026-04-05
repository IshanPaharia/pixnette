export function Tooltip({ show, x, y, hex, clientX, clientY }) {
  if (!show) return null;
  
  return (
    <div 
      className="fixed pointer-events-none z-50 bg-black/80 font-mono text-[10px] px-2 py-1 rounded border border-white/10 text-white flex items-center gap-2 shadow-lg"
      style={{
        left: 0,
        top: 0,
        transform: `translate(${clientX + 15}px, ${clientY + 15}px)`,
        transition: 'opacity 0.1s',
        opacity: show ? 1 : 0,
        willChange: 'transform'
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
