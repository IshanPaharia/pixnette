import { useEffect, useState, useRef } from 'react';
import { canvasToPixel, inBounds, clamp, CANVAS_SIZE } from '../utils/canvas';

export function Canvas({ boardRef, overlayRef, onHover, onClickPixel }) {
  const wrapRef = useRef(null);
  
  const [scale, setScale] = useState(2);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  
  const panStartRef = useRef({ x: 0, y: 0, originX: 0, originY: 0 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const { clientWidth, clientHeight } = wrapRef.current;
    const s = (Math.min(clientWidth, clientHeight) / CANVAS_SIZE) * 0.85;
    const initialScale = Math.max(1, Math.floor(s));
    setScale(initialScale);
    setOffsetX(Math.floor((clientWidth - CANVAS_SIZE * initialScale) / 2));
    setOffsetY(Math.floor((clientHeight - CANVAS_SIZE * initialScale) / 2));
  }, []);

  const handleWheel = (e) => {
    e.preventDefault();
    if (!wrapRef.current) return;
    
    const rect = wrapRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const delta = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = clamp(scale * delta, 0.5, 80); // increased max scale for smaller canvas
    
    const newOffsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
    const newOffsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
    
    setScale(newScale);
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) {
      wrap.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (wrap) wrap.removeEventListener('wheel', handleWheel);
    }
  }, [scale, offsetX, offsetY]);

  const handlePointerDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        originX: offsetX,
        originY: offsetY
      };
      return;
    }
  };

  const handlePointerMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setOffsetX(panStartRef.current.originX + dx);
      setOffsetY(panStartRef.current.originY + dy);
      onHover(null);
      return;
    }
    
    const wrap = wrapRef.current;
    if (!wrap || !onHover) return;
    
    const rect = wrap.getBoundingClientRect();
    const { x, y } = canvasToPixel(e.clientX, e.clientY, rect, offsetX, offsetY, scale);
    
    if (inBounds(x, y)) {
      onHover({ x, y, clientX: e.clientX, clientY: e.clientY });
    } else {
      onHover(null);
    }
  };

  const handlePointerUp = (e) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
  };

  const handleClick = (e) => {
    if (isPanning || e.button !== 0 || e.altKey) return;
    
    const wrap = wrapRef.current;
    if (!wrap) return;
    
    const rect = wrap.getBoundingClientRect();
    const { x, y } = canvasToPixel(e.clientX, e.clientY, rect, offsetX, offsetY, scale);
    
    if (inBounds(x, y)) {
      onClickPixel(x, y);
    }
  };

  const handleKeyDown = (e) => {
    const step = 50;
    if (e.key === 'ArrowUp') setOffsetY(o => o + step);
    if (e.key === 'ArrowDown') setOffsetY(o => o - step);
    if (e.key === 'ArrowLeft') setOffsetX(o => o + step);
    if (e.key === 'ArrowRight') setOffsetX(o => o - step);
    if (e.key === '=' || e.key === '+') zoomCenter(1.5);
    if (e.key === '-') zoomCenter(1/1.5);
  };

  const zoomCenter = (multiplier) => {
    if (!wrapRef.current) return;
    const { clientWidth, clientHeight } = wrapRef.current;
    const mouseX = clientWidth / 2;
    const mouseY = clientHeight / 2;
    const newScale = clamp(scale * multiplier, 0.5, 80);
    setOffsetX(mouseX - (mouseX - offsetX) * (newScale / scale));
    setOffsetY(mouseY - (mouseY - offsetY) * (newScale / scale));
    setScale(newScale);
  };

  const resetZoom = () => {
    if (!wrapRef.current) return;
    const { clientWidth, clientHeight } = wrapRef.current;
    const s = (Math.min(clientWidth, clientHeight) / CANVAS_SIZE) * 0.85;
    const initialScale = Math.max(1, Math.floor(s));
    setScale(initialScale);
    setOffsetX(Math.floor((clientWidth - CANVAS_SIZE * initialScale) / 2));
    setOffsetY(Math.floor((clientHeight - CANVAS_SIZE * initialScale) / 2));
  };

  return (
    <div 
      className="absolute inset-0 outline-none overflow-hidden"
      style={{
        backgroundColor: '#0e0e10',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='16' height='16' fill='%23141416'/%3E%3Crect x='16' y='16' width='16' height='16' fill='%23141416'/%3E%3C/svg%3E")`,
        cursor: isPanning ? 'grabbing' : 'crosshair',
        top: 48,
        bottom: 72
      }}
      ref={wrapRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div style={{
          position: 'absolute',
          transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`,
          transformOrigin: '0 0',
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          backgroundColor: '#ffffff',
          willChange: 'transform'
      }}>
        <canvas ref={boardRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="absolute inset-0 rendering-pixelated" />
        <canvas ref={overlayRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="absolute inset-0 rendering-pixelated" style={{ pointerEvents: 'none' }} />
      </div>

      <div className="absolute bottom-6 right-6 flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-xl overflow-hidden pointer-events-auto">
        <button onClick={() => zoomCenter(1.5)} className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center font-mono text-lg transition-colors">＋</button>
        <div className="w-full h-px bg-[var(--color-border)]" />
        <button onClick={() => zoomCenter(1/1.5)} className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center font-mono text-lg transition-colors">−</button>
        <div className="w-full h-px bg-[var(--color-border)]" />
        <button onClick={resetZoom} className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center font-mono text-sm transition-colors">⊡</button>
      </div>
    </div>
  );
}
