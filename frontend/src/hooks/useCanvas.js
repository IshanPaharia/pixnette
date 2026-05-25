import { useRef, useCallback } from 'react';
import { PALETTE } from '../utils/palette';
import { hexToRgb, CANVAS_SIZE } from '../utils/canvas';

export function useCanvas() {
  const boardRef = useRef(null);
  const overlayRef = useRef(null);
  // Use a ref for the massive pixel array to avoid O(N) copying on every update
  const pixelDataRef = useRef(new Uint8Array(CANVAS_SIZE * CANVAS_SIZE));

  const renderFullBoard = useCallback((data) => {
    const ctx = boardRef.current?.getContext('2d', { alpha: false });
    if (!ctx) return;
    
    const imgData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    for (let i = 0; i < data.length; i++) {
      const colorIndex = data[i];
      const hex = PALETTE[colorIndex] || '#ffffff';
      const rgb = hexToRgb(hex);
      if (rgb) {
        imgData.data[i * 4] = rgb.r;
        imgData.data[i * 4 + 1] = rgb.g;
        imgData.data[i * 4 + 2] = rgb.b;
        imgData.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, []);

  const loadBoard = useCallback(async () => {
    // 1. Instantly render from local cache if available
    try {
      const cached = localStorage.getItem('pixnette_canvas_cache');
      if (cached) {
        const cachedArr = JSON.parse(cached);
        if (cachedArr.length === CANVAS_SIZE * CANVAS_SIZE) {
          const newPixelData = new Uint8Array(cachedArr);
          pixelDataRef.current.set(newPixelData);
          renderFullBoard(newPixelData);
        }
      }
    } catch (cacheErr) {
      console.warn('Failed to load canvas cache:', cacheErr);
    }

    // 2. Fetch fresh binary data from server in the background
    try {
      const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${url}/api/canvas`);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const newPixelData = new Uint8Array(buffer);
        if (newPixelData.length !== CANVAS_SIZE * CANVAS_SIZE) {
          console.error(`Canvas size mismatch: expected ${CANVAS_SIZE * CANVAS_SIZE} bytes, received ${newPixelData.length}`);
          return;
        }
        pixelDataRef.current.set(newPixelData);
        renderFullBoard(newPixelData);

        // 3. Update the local cache
        localStorage.setItem('pixnette_canvas_cache', JSON.stringify(Array.from(newPixelData)));
      }
    } catch (e) {
      console.error('Failed to load canvas', e);
    }
  }, [renderFullBoard]);

  const updatePixel = useCallback((x, y, colorIndex) => {
    // 1. Update In-Memory Data
    pixelDataRef.current[y * CANVAS_SIZE + x] = colorIndex;

    // 2. Draw directly to canvas
    if (boardRef.current) {
      const ctx = boardRef.current.getContext('2d', { alpha: false });
      ctx.fillStyle = PALETTE[colorIndex];
      ctx.fillRect(x, y, 1, 1);
    }

    // 3. Update the local cache so refreshes capture live changes
    try {
      localStorage.setItem('pixnette_canvas_cache', JSON.stringify(Array.from(pixelDataRef.current)));
    } catch (storageErr) {
      console.warn('Failed to update canvas cache:', storageErr);
    }
  }, []);

  const drawHoverPixel = useCallback((x, y, colorIndex) => {
    if (!overlayRef.current) return;
    const ctx = overlayRef.current.getContext('2d');
    
    // For 512x512, clearRect is fast, but we only clear the overlay canvas anyway.
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE && colorIndex !== null) {
      // 70% opacity Selected color
      ctx.fillStyle = PALETTE[colorIndex] + 'B3'; 
      ctx.fillRect(x, y, 1, 1);
      
      // White border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5; // Slightly thicker for visibility at 512x512 zoom
      ctx.strokeRect(x, y, 1, 1);
    }
  }, []);

  const getPixelColor = useCallback((x, y) => {
    const idx = pixelDataRef.current[y * CANVAS_SIZE + x];
    if (idx !== undefined && idx < PALETTE.length) {
      return PALETTE[idx];
    }
    return null;
  }, []);

  return { 
    boardRef, 
    overlayRef, 
    loadBoard, 
    updatePixel, 
    drawHoverPixel, 
    getPixelColor
  };
}
