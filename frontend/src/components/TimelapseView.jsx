import { useEffect, useState, useRef, useCallback } from 'react';
import { PALETTE } from '../utils/palette';
import { CANVAS_SIZE } from '../utils/canvas';

export function TimelapseView({ onExit }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [speed, setSpeed] = useState(50); // number of pixels painted per animation frame
  
  const canvasRef = useRef(null);
  const lastDrawnIndexRef = useRef(-1);
  const animationRef = useRef(null);

  // Fetch the full canvas history from the backend
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const res = await fetch(`${backendUrl}/api/canvas/history`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history || []);
        } else {
          console.error('Failed to fetch history:', res.statusText);
        }
      } catch (err) {
        console.error('Error fetching history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  // Optimized drawing routine
  const draw = useCallback((toIndex) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let fromIndex = lastDrawnIndexRef.current + 1;

    // If scrubbing backward, clear the canvas to white and redraw from 0
    if (toIndex < lastDrawnIndexRef.current) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      fromIndex = 0;
    }

    // Draw the batch of pixel updates
    for (let i = fromIndex; i <= toIndex; i++) {
      const p = history[i];
      if (p) {
        ctx.fillStyle = PALETTE[p.color];
        ctx.fillRect(p.x, p.y, 1, 1);
      }
    }

    lastDrawnIndexRef.current = toIndex;
  }, [history]);

  // Sync canvas with currentIndex
  useEffect(() => {
    if (history.length > 0) {
      draw(currentIndex);
    }
  }, [currentIndex, history, draw]);

  // Initial draw & canvas reset when history is loaded
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      lastDrawnIndexRef.current = -1;
      setCurrentIndex(-1);
    }
  }, [history]);

  // Playback loop using requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const tick = () => {
      setCurrentIndex((prev) => {
        if (prev >= history.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        // Jump forward by the speed step (e.g. 50 pixels per frame)
        return Math.min(history.length - 1, prev + speed);
      });
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, history.length, speed]);

  const togglePlay = () => {
    if (currentIndex >= history.length - 1) {
      // Auto-restart if we reached the end
      setCurrentIndex(-1);
    }
    setIsPlaying(!isPlaying);
  };

  const reset = () => {
    setIsPlaying(false);
    setCurrentIndex(-1);
  };

  const handleScrub = (e) => {
    setIsPlaying(false);
    setCurrentIndex(parseInt(e.target.value, 10));
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `pixnette-timelapse-pixel-${currentIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="absolute inset-0 bg-[#0e0e10] flex flex-col z-40 select-none font-sans">
      {/* Top Header */}
      <div className="h-14 flex-none bg-[var(--color-surface)]/70 backdrop-blur-md border-b border-[var(--color-border)] flex items-center justify-between px-6 z-50">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-lg font-bold tracking-tight text-white">TIMELAPSE PLAYER</h1>
          <span className="font-mono text-xs text-gray-500">History Mode</span>
        </div>
        <button
          onClick={onExit}
          className="font-mono text-xs font-bold border border-red-500/50 text-red-400 bg-red-500/5 px-4 py-1.5 rounded hover:bg-red-500/15 transition-all active:scale-95"
        >
          EXIT
        </button>
      </div>

      {/* Main Canvas Viewer */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-400 font-mono text-sm">Loading canvas history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center p-8 bg-[var(--color-surface)]/40 border border-[var(--color-border)] rounded-lg backdrop-blur">
            <p className="text-gray-400 font-mono mb-2">No pixel placements recorded yet.</p>
            <p className="text-gray-500 text-xs font-mono">Go place some pixels on the canvas first!</p>
          </div>
        ) : (
          <div className="relative border border-[var(--color-border)] bg-white shadow-2xl max-w-full max-h-[70vh] aspect-square rounded overflow-hidden">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="w-full h-full object-contain image-render-pixelated"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        )}
      </div>

      {/* Playback Controls Panel */}
      {!loading && history.length > 0 && (
        <div className="flex-none bg-[var(--color-surface)]/85 backdrop-blur-lg border-t border-[var(--color-border)] px-6 py-4 flex flex-col gap-4 z-50">
          
          {/* Progress Slider / Scrubber */}
          <div className="flex items-center gap-4 w-full">
            <span className="font-mono text-xs text-gray-400 w-12">Start</span>
            <input
              type="range"
              min="-1"
              max={history.length - 1}
              value={currentIndex}
              onChange={handleScrub}
              className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)] focus:outline-none"
            />
            <span className="font-mono text-xs text-gray-400 w-12 text-right">End</span>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            {/* Play/Pause & Reset Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-12 h-10 flex items-center justify-center rounded border border-[var(--color-accent)]/55 bg-[var(--color-accent)]/5 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/15 transition-all font-mono font-bold active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                onClick={reset}
                className="w-12 h-10 flex items-center justify-center rounded border border-gray-600 text-gray-300 hover:bg-white/5 transition-all font-mono font-bold active:scale-95"
                title="Restart"
              >
                ↺
              </button>
              <span className="font-mono text-xs text-gray-400 ml-2">
                Pixel Placed: <span className="text-white font-bold">{currentIndex + 1}</span> / {history.length}
              </span>
            </div>

            {/* Speed Selector */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-500 mr-2">SPEED</span>
              {[1, 5, 20, 50, 200, 500].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`font-mono text-xs px-2.5 py-1.5 rounded transition-all active:scale-95 ${
                    speed === s
                      ? 'bg-[var(--color-accent)] text-black font-bold shadow-[0_0_8px_rgba(62,207,110,0.3)]'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Actions */}
            <div>
              <button
                onClick={handleExport}
                className="font-mono text-xs font-bold border border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/5 px-4 py-2.5 rounded hover:bg-[var(--color-accent)]/15 transition-all active:scale-95 flex items-center gap-2"
              >
                💾 EXPORT PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}