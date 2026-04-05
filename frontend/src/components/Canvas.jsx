import { useEffect, useState, useRef, memo, useCallback } from 'react';
import { canvasToPixel, inBounds, clamp, CANVAS_SIZE } from '../utils/canvas';

function CanvasComponent({ boardRef, overlayRef, onHover, onClickPixel }) {
  const wrapRef = useRef(null);
  
  // Consolidate transform state for atomic updates
  const [transform, setTransform] = useState({ scale: 2, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Track pointers for multi-touch (pinch-to-zoom)
  const pointersRef = useRef(new Map());
  const lastPinchDistanceRef = useRef(null);
  const panStartRef = useRef({ x: 0, y: 0, originX: 0, originY: 0 });

  // Initial centering
  useEffect(() => {
    if (!wrapRef.current) return;
    const { clientWidth, clientHeight } = wrapRef.current;
    const s = (Math.min(clientWidth, clientHeight) / CANVAS_SIZE) * 0.85;
    const initialScale = Math.max(1, Math.floor(s));
    setTransform({
        scale: initialScale,
        x: Math.floor((clientWidth - CANVAS_SIZE * initialScale) / 2),
        y: Math.floor((clientHeight - CANVAS_SIZE * initialScale) / 2)
    });
  }, []);

  const zoomAtPoint = useCallback((multiplier, clientX, clientY) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const focalX = clientX - rect.left;
    const focalY = clientY - rect.top;

    setTransform(prev => {
        const newScale = clamp(prev.scale * multiplier, 0.5, 80);
        const ratio = newScale / prev.scale;
        
        // The core math to keep the point under the cursor stable
        // newOffset = focal - (focal - oldOffset) * ratio
        return {
            scale: newScale,
            x: focalX - (focalX - prev.x) * ratio,
            y: focalY - (focalY - prev.y) * ratio
        };
    });
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    // Use smoother zoom increment
    const delta = e.deltaY < 0 ? 1.15 : 0.87;
    zoomAtPoint(delta, e.clientX, e.clientY);
  }, [zoomAtPoint]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) {
      wrap.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (wrap) wrap.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const handlePointerDown = (e) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    const isTouch = e.pointerType === 'touch';
    const isSpecialClick = e.button === 1 || (e.button === 0 && e.altKey);

    if (isTouch || isSpecialClick) {
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        originX: transform.x,
        originY: transform.y
      };
      
      if (isTouch) onHover(null); 
    }
  };

  const handlePointerMove = (e) => {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Multi-touch Pinch
    if (pointers.size === 2) {
        setIsPanning(false); 
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        
        if (lastPinchDistanceRef.current !== null) {
            const delta = dist / lastPinchDistanceRef.current;
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            zoomAtPoint(delta, midX, midY);
        }
        lastPinchDistanceRef.current = dist;
        return;
    }

    // Panning
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setTransform(prev => ({
          ...prev,
          x: panStartRef.current.originX + dx,
          y: panStartRef.current.originY + dy
      }));
      onHover(null);
      return;
    }
    
    // Mouse Hover
    if (pointers.size === 1 && e.pointerType === 'mouse') {
        const wrap = wrapRef.current;
        if (!wrap || !onHover) return;
        const rect = wrap.getBoundingClientRect();
        const { x, y } = canvasToPixel(e.clientX, e.clientY, rect, transform.x, transform.y, transform.scale);
        
        if (inBounds(x, y)) {
          onHover({ x, y, clientX: e.clientX, clientY: e.clientY });
        } else {
          onHover(null);
        }
    }
  };

  const handlePointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
        lastPinchDistanceRef.current = null;
    }
    if (pointersRef.current.size === 0) {
        setIsPanning(false);
    }
  };

  const handleClick = (e) => {
    if (isPanning || e.button !== 0 || e.altKey || e.pointerType === 'touch') return;
    
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const { x, y } = canvasToPixel(e.clientX, e.clientY, rect, transform.x, transform.y, transform.scale);
    
    if (inBounds(x, y)) {
      onClickPixel(x, y);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      const step = 50;
      if (e.key === 'ArrowUp') setTransform(p => ({ ...p, y: p.y + step }));
      if (e.key === 'ArrowDown') setTransform(p => ({ ...p, y: p.y - step }));
      if (e.key === 'ArrowLeft') setTransform(p => ({ ...p, x: p.x + step }));
      if (e.key === 'ArrowRight') setTransform(p => ({ ...p, x: p.x - step }));
      if (e.key === '=' || e.key === '+') zoomAtPoint(1.3, window.innerWidth/2, window.innerHeight/2);
      if (e.key === '-') zoomAtPoint(1/1.3, window.innerWidth/2, window.innerHeight/2);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomAtPoint]);

  const resetZoom = () => {
    if (!wrapRef.current) return;
    const { clientWidth, clientHeight } = wrapRef.current;
    const s = (Math.min(clientWidth, clientHeight) / CANVAS_SIZE) * 0.85;
    const initialScale = Math.max(1, Math.floor(s));
    setTransform({
        scale: initialScale,
        x: Math.floor((clientWidth - CANVAS_SIZE * initialScale) / 2),
        y: Math.floor((clientHeight - CANVAS_SIZE * initialScale) / 2)
    });
  };

  return (
    <div 
      className="absolute inset-0 outline-none overflow-hidden touch-none"
      style={{
        backgroundColor: '#0e0e10',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='16' height='16' fill='%23141416'/%3E%3Crect x='16' y='16' width='16' height='16' fill='%23141416'/%3E%3C/svg%3E")`,
        cursor: isPanning ? 'grabbing' : 'crosshair'
      }}
      ref={wrapRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      tabIndex={0}
    >
      <div style={{
          position: 'absolute',
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transformOrigin: '0 0',
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          backgroundColor: '#ffffff',
          willChange: 'transform'
      }}>
        <canvas ref={boardRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="absolute inset-0 rendering-pixelated" />
        <canvas ref={overlayRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="absolute inset-0 rendering-pixelated" style={{ pointerEvents: 'none' }} />
      </div>

      <div className="absolute bottom-24 right-6 flex flex-col bg-[var(--color-surface)]/80 backdrop-blur-md border border-[var(--color-border)] rounded shadow-xl overflow-hidden pointer-events-auto z-30 transition-all">
        <button onClick={() => zoomAtPoint(1.5, window.innerWidth/2, window.innerHeight/2)} className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center font-mono text-lg transition-colors">＋</button>
        <div className="w-full h-px bg-[var(--color-border)]" />
        <button onClick={() => zoomAtPoint(1/1.5, window.innerWidth/2, window.innerHeight/2)} className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center font-mono text-lg transition-colors">−</button>
        <div className="w-full h-px bg-[var(--color-border)]" />
        <button onClick={resetZoom} className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center font-mono text-sm transition-colors">⊡</button>
      </div>
    </div>
  );
}

export const Canvas = memo(CanvasComponent);
