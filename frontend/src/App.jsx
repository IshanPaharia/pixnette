import { useState, useEffect, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { Tooltip } from './components/Tooltip';
import { useSocket } from './hooks/useSocket';
import { useCooldown } from './hooks/useCooldown';
import { useCanvas } from './hooks/useCanvas';
import { Analytics } from "@vercel/analytics/react"

function App() {
  const { socket, isConnected, liveCount } = useSocket();
  const { cooldownRemaining, triggerCooldown, syncCooldown } = useCooldown();
  const { boardRef, overlayRef, loadBoard, updatePixel, drawHoverPixel, getPixelColor } = useCanvas();

  const [selectedColor, setSelectedColor] = useState(0);
  const [hoverCursor, setHoverCursor] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const showFlash = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  useEffect(() => {
    if (!socket) return;
    
    // Server emits pixel_update to all clients. We optimistically update ours, 
    // but applying it twice is harmless since it's the same color.
    const onPixelUpdate = ({ x, y, color }) => {
      updatePixel(x, y, color);
    };
    
    const onPlaceError = ({ message }) => {
      showFlash(message);
      // Heavy revert, syncs full canvas to fix optimistic placing
      loadBoard(); 
    };

    const onConnect = () => {
      loadBoard();
    };

    const onCooldownSync = ({ remaining }) => {
      syncCooldown(remaining);
    };

    socket.on('pixel_update', onPixelUpdate);
    socket.on('place_error', onPlaceError);
    socket.on('connect', onConnect);
    socket.on('cooldown_sync', onCooldownSync);

    return () => {
      socket.off('pixel_update', onPixelUpdate);
      socket.off('place_error', onPlaceError);
      socket.off('connect', onConnect);
      socket.off('cooldown_sync', onCooldownSync);
    };
  }, [socket, loadBoard, updatePixel, syncCooldown]);

  const handleHover = useCallback((h) => {
    setHoverCursor(h);
    if (!h) {
      drawHoverPixel(-1, -1, null);
    } else {
      drawHoverPixel(h.x, h.y, selectedColor);
    }
  }, [selectedColor, drawHoverPixel]);

  useEffect(() => {
    if (hoverCursor) {
      drawHoverPixel(hoverCursor.x, hoverCursor.y, selectedColor);
    }
  }, [selectedColor, hoverCursor, drawHoverPixel]);

  const handlePlace = useCallback(() => {
    if (cooldownRemaining > 0) {
      showFlash(`Cooldown: ${cooldownRemaining}s remaining`);
      return;
    }
    
    if (!hoverCursor) {
      showFlash("Hover over a pixel to place");
      return;
    }

    const { x, y } = hoverCursor;
    
    if (socket) {
      socket.emit('place_pixel', { x, y, color: selectedColor });
    }
    
    updatePixel(x, y, selectedColor);
    triggerCooldown();
  }, [cooldownRemaining, hoverCursor, socket, selectedColor, updatePixel, triggerCooldown]);

  const handleClickPixel = useCallback((x, y) => {
    if (cooldownRemaining > 0) {
      showFlash(`Cooldown: ${cooldownRemaining}s remaining`);
      return;
    }

    if (socket) {
      socket.emit('place_pixel', { x, y, color: selectedColor });
    }
    
    updatePixel(x, y, selectedColor);
    triggerCooldown();
  }, [cooldownRemaining, socket, selectedColor, updatePixel, triggerCooldown]);

  return (
    <div className="w-full h-[100dvh] relative bg-[var(--color-canvas-bg)] text-[var(--color-text-main)] overflow-hidden font-sans">
      <TopBar liveCount={liveCount} isConnected={isConnected} cursor={hoverCursor || {x: -1, y: -1}} />
      
      <Canvas 
        boardRef={boardRef} 
        overlayRef={overlayRef}
        onHover={handleHover}
        onClickPixel={handleClickPixel}
      />
      
      <Toolbar 
        selectedColor={selectedColor}
        onSelectColor={setSelectedColor}
        onPlace={handlePlace}
        cooldownRemaining={cooldownRemaining}
      />

      <div 
        className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-300 font-mono text-sm px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/50 rounded shadow-lg pointer-events-none backdrop-blur-sm ${flash ? 'opacity-100' : 'opacity-0'}`}
      >
        {flash}
      </div>

      <Tooltip 
        show={!!hoverCursor}
        x={hoverCursor?.x} 
        y={hoverCursor?.y} 
        hex={hoverCursor ? getPixelColor(hoverCursor.x, hoverCursor.y) : null}
        clientX={hoverCursor?.clientX}
        clientY={hoverCursor?.clientY}
      />
      <Analytics/>
    </div>
  );
}

export default App;
