import { useEffect, useState, useRef, memo, useCallback } from 'react';
import { canvasToPixel, inBounds, clamp, CANVAS_SIZE } from '../utils/canvas';

function CanvasComponent({ boardRef, overlayRef, onHover, onClickPixel }) {
  const wrapRef = useRef(null);
  
  // Consolidate transform state for atomic updates
  const [transform, setTransformState] = useState({ scale: 2, x: 0, y: 0 });
  const transformRef = useRef(transform);
  
  const setTransform = useCallback((updater) => {
    setTransformState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      transformRef.current = next;
      return next;
    });
  }, []);

  const [isPanning, setIsPanning] = useState(false);

  // Track pointers for multi-touch (pinch-to-zoom) and drag vs tap tracking
  const pointersRef = useRef(new Map());
  const pointerDownDetailsRef = useRef(new Map());
  const lastPinchDistanceRef = useRef(null);
  const lastPinchMidRef = useRef(null);
  const panStartRef = useRef({ x: 0, y: 0, originX: 0, originY: 0 });

  // Helper to calculate canvas centering in the visible viewport (between TopBar and Toolbar)
  const getCenteredTransform = useCallback(() => {
    if (!wrapRef.current) return { scale: 2, x: 0, y: 0 };
    const { clientWidth, clientHeight } = wrapRef.current;
    
    const topOffset = 48; // h-12 TopBar
    let bottomOffset = 72; // default mobile Toolbar height
    if (window.innerWidth >= 1024) {
      bottomOffset = 88;
    } else if (window.innerWidth >= 640) {
      bottomOffset = 80;
    }
    
    const usableHeight = clientHeight - topOffset - bottomOffset;
    const s = (Math.min(clientWidth, usableHeight) / CANVAS_SIZE) * 0.85;
    const initialScale = Math.max(1, Math.floor(s));
    
    return {
      scale: initialScale,
      x: Math.floor((clientWidth - CANVAS_SIZE * initialScale) / 2),
      y: topOffset + Math.floor((usableHeight - CANVAS_SIZE * initialScale) / 2)
    };
  }, []);

  // Initial centering
  useEffect(() => {
    setTransform(getCenteredTransform());
  }, [getCenteredTransform]);

  const zoomAtPoint = useCallback((multiplier, clientX, clientY) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const focalX = clientX - rect.left;
    const focalY = clientY - rect.top;

    setTransform(prev => {
        const newScale = clamp(prev.scale * multiplier, 0.5, 80);
        const ratio = newScale / prev.scale;
        
        // The core math to keep the point under the cursor stable
        return {
            scale: newScale,
            x: focalX - (focalX - prev.x) * ratio,
            y: focalY - (focalY - prev.y) * ratio
        };
    });
  }, [setTransform]);

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

    pointerDownDetailsRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      moved: false
    });

    if (isTouch || isSpecialClick) {
      if (pointersRef.current.size === 1) {
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          originX: transformRef.current.x,
          originY: transformRef.current.y
        };
        if (isTouch) onHover(null); 
      } else if (pointersRef.current.size === 2) {
        setIsPanning(false);
        const pts = Array.from(pointersRef.current.values());
        lastPinchDistanceRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        lastPinchMidRef.current = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2
        };
      }
    }
  };

  const handlePointerMove = (e) => {
    const pointers = pointersRef.current;
    
    // We only track active dragging/touching pointers in the pointers map.
    // If it's not in the map, and it's a mouse, then it's a hover!
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && !isPanning) {
        const wrap = wrapRef.current;
        if (!wrap || !onHover) return;
        const rect = wrap.getBoundingClientRect();
        const { x, y } = canvasToPixel(e.clientX, e.clientY, rect, transformRef.current.x, transformRef.current.y, transformRef.current.scale);
        
        if (inBounds(x, y)) {
          onHover({ x, y, clientX: e.clientX, clientY: e.clientY });
        } else {
          onHover(null);
        }
      }
      return;
    }
    
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Track movement distance for tap detection
    const downDetails = pointerDownDetailsRef.current.get(e.pointerId);
    if (downDetails) {
      const dist = Math.hypot(e.clientX - downDetails.x, e.clientY - downDetails.y);
      if (dist > 6) {
        downDetails.moved = true;
      }
    }

    // Multi-touch Pinch
    if (pointers.size === 2) {
        setIsPanning(false); 
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        
        if (lastPinchDistanceRef.current !== null && lastPinchMidRef.current !== null) {
            const delta = dist / lastPinchDistanceRef.current;
            
            setTransform(prev => {
                const newScale = clamp(prev.scale * delta, 0.5, 80);
                const ratio = newScale / prev.scale;
                
                // Keep the canvas under the moving midpoint stable
                const zoomedX = midX - (midX - prev.x) * ratio;
                const zoomedY = midY - (midY - prev.y) * ratio;
                
                // Add translation of the midpoint itself
                const dx = midX - lastPinchMidRef.current.x;
                const dy = midY - lastPinchMidRef.current.y;
                
                return {
                    scale: newScale,
                    x: zoomedX + dx,
                    y: zoomedY + dy
                };
            });
        }
        lastPinchDistanceRef.current = dist;
        lastPinchMidRef.current = { x: midX, y: midY };
        return;
    }

    // Panning (only when 1 pointer is down and isPanning is true)
    if (isPanning && pointers.size === 1) {
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
  };

  const handlePointerUp = (e) => {
    const downDetails = pointerDownDetailsRef.current.get(e.pointerId);
    
    // Tap detection: touch pointer, didn't move much, and tap duration is short
    if (e.pointerType === 'touch' && downDetails && !downDetails.moved && (Date.now() - downDetails.time < 300)) {
      const wrap = wrapRef.current;
      if (wrap && onHover) {
        const rect = wrap.getBoundingClientRect();
        const { x, y } = canvasToPixel(e.clientX, e.clientY, rect, transformRef.current.x, transformRef.current.y, transformRef.current.scale);
        if (inBounds(x, y)) {
          onHover({ x, y, clientX: e.clientX, clientY: e.clientY });
        } else {
          onHover(null);
        }
      }
    }

    pointersRef.current.delete(e.pointerId);
    pointerDownDetailsRef.current.delete(e.pointerId);

    // If we transition back to 1 finger from 2, we can resume panning with the remaining finger
    if (pointersRef.current.size === 1) {
      const remainingPointer = Array.from(pointersRef.current.entries())[0];
      const pId = remainingPointer[0];
      const pCoords = remainingPointer[1];
      
      setIsPanning(true);
      panStartRef.current = {
        x: pCoords.x,
        y: pCoords.y,
        originX: transformRef.current.x,
        originY: transformRef.current.y
      };
      
      const rDownDetails = pointerDownDetailsRef.current.get(pId);
      if (rDownDetails) {
        rDownDetails.x = pCoords.x;
        rDownDetails.y = pCoords.y;
      }
    } else if (pointersRef.current.size === 0) {
      setIsPanning(false);
      lastPinchDistanceRef.current = null;
      lastPinchMidRef.current = null;
    }
  };

  const handleClick = (e) => {
    if (isPanning || e.button !== 0 || e.altKey || e.pointerType === 'touch') return;
    
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const { x, y } = canvasToPixel(e.clientX, e.clientY, rect, transformRef.current.x, transformRef.current.y, transformRef.current.scale);
    
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
    setTransform(getCenteredTransform());
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
        <canvas ref={boardRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="w-full h-full absolute inset-0 rendering-pixelated" style={{ backgroundColor: '#ffffff' }} />
        <canvas ref={overlayRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="w-full h-full absolute inset-0 rendering-pixelated" style={{ pointerEvents: 'none' }} />
      </div>

      <div 
        className="absolute bottom-24 right-6 flex flex-col bg-[var(--color-surface)]/80 backdrop-blur-md border border-[var(--color-border)] rounded shadow-xl overflow-hidden pointer-events-auto z-30 transition-all"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
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
