import { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { Tooltip } from './components/Tooltip';
import { useSocket } from './hooks/useSocket';
import { useCooldown } from './hooks/useCooldown';
import { useCanvas } from './hooks/useCanvas';
import { Analytics } from "@vercel/analytics/react";
import { TimelapseView } from './components/TimelapseView';
import { SecretKeyModal } from './components/SecretKeyModal';

function App() {
  const { socketRef, isConnected, liveCount } = useSocket();
  const [view, setView] = useState('canvas');
  const { cooldownRemaining, triggerCooldown, syncCooldown, cooldownSeconds } = useCooldown();
  const { boardRef, overlayRef, loadBoard, updatePixel, drawHoverPixel, getPixelColor } = useCanvas();

  const [selectedColor, setSelectedColor] = useState(0);
  const [hoverCursor, setHoverCursor] = useState(null);
  const [flash, setFlash] = useState(null);
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
  const isFirstConnect = useRef(true);

  // Prevent browser native pinch/double-tap zoom on mobile devices
  useEffect(() => {
    const preventPinch = (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    
    let lastTouchEnd = 0;
    const preventDoubleTap = (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    const preventGesture = (e) => {
      e.preventDefault();
    };

    document.addEventListener('touchstart', preventPinch, { passive: false });
    document.addEventListener('touchend', preventDoubleTap, { passive: false });
    document.addEventListener('gesturestart', preventGesture, { passive: false });

    return () => {
      document.removeEventListener('touchstart', preventPinch);
      document.removeEventListener('touchend', preventDoubleTap);
      document.removeEventListener('gesturestart', preventGesture);
    };
  }, []);

  useEffect(() => {
    if (view === 'canvas') {
      loadBoard();
    }
  }, [view, loadBoard]);

  const flashTimerRef = useRef(null);

  const showFlash = useCallback((msg) => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
    }
    setFlash(msg);
    flashTimerRef.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    
    // Server emits pixel_update to all clients. We optimistically update ours, 
    // but applying it twice is harmless since it's the same color.
    const onPixelUpdate = ({ x, y, color }) => {
      updatePixel(x, y, color);
    };
    
    const onPlaceError = ({ message, x, y, color }) => {
      showFlash(message);
      if (x !== undefined && y !== undefined && color !== undefined) {
        updatePixel(x, y, color);
      } else {
        loadBoard(); 
      }
    };
    
    const onConnect = () => {
      if (isFirstConnect.current) {
        isFirstConnect.current = false;
      } else {
        loadBoard();
      }
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
  }, [socketRef, loadBoard, updatePixel, syncCooldown, showFlash]);

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

  const submitPixel = useCallback((x, y) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      showFlash('Disconnected');
      return;
    }

    socket.emit('place_pixel', { x, y, color: selectedColor });
    updatePixel(x, y, selectedColor);
    triggerCooldown();
  }, [socketRef, selectedColor, showFlash, updatePixel, triggerCooldown]);

  const handlePlace = useCallback(() => {
    if (cooldownRemaining > 0) {
      showFlash(`Cooldown: ${cooldownRemaining}s remaining`);
      return;
    }
    
    if (!hoverCursor) {
      showFlash("Select a pixel to place");
      return;
    }

    const { x, y } = hoverCursor;
    submitPixel(x, y);
  }, [cooldownRemaining, hoverCursor, showFlash, submitPixel]);

  const handleClickPixel = useCallback((x, y) => {
    if (cooldownRemaining > 0) {
      showFlash(`Cooldown: ${cooldownRemaining}s remaining`);
      return;
    }
    submitPixel(x, y);
  }, [cooldownRemaining, showFlash, submitPixel]);

  const handleSecretSubmit = useCallback(async (secretKey) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      showFlash('Socket not connected');
      return false;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        showFlash('Verification timed out');
        resolve(false);
      }, 5000);

      socket.emit('verify_secret_key', { secretKey }, (response) => {
        clearTimeout(timer);
        if (response?.success) {
          localStorage.setItem('pb_secret_key', secretKey);
          syncCooldown(0);
          showFlash('✨ VIP Cooldown Exemption Activated!');
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }, [socketRef, syncCooldown, showFlash]);

  if (view === 'timelapse') {
    return <TimelapseView onExit={() => setView('canvas')} />;
  }

  return (
    <div className="w-full h-[100dvh] relative bg-[var(--color-canvas-bg)] text-[var(--color-text-main)] overflow-hidden font-sans">
      <TopBar 
        liveCount={liveCount} 
        isConnected={isConnected} 
        onEnterTimelapse={() => setView('timelapse')}
        onUserCountTripleClick={() => setIsSecretModalOpen(true)}
      />
      
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
        cooldownSeconds={cooldownSeconds}
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

      <SecretKeyModal 
        isOpen={isSecretModalOpen} 
        onClose={() => setIsSecretModalOpen(false)}
        onSubmit={handleSecretSubmit}
      />

      <Analytics/>
    </div>
  );
}

export default App;
