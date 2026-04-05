import { useRef, useState } from 'react';
import { PALETTE } from '../utils/palette';
import { hexToRgb, CANVAS_SIZE } from '../utils/canvas';

export function useCanvas() {
  const boardRef = useRef(null);
  const overlayRef = useRef(null);
  const [pixelData, setPixelData] = useState(new Uint8Array(CANVAS_SIZE * CANVAS_SIZE));

  const loadBoard = async () => {
    try {
      const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${url}/api/canvas`);
      if (res.ok) {
        const data = await res.json();
        const newPixelData = new Uint8Array(data.canvas);
        setPixelData(newPixelData);
        renderFullBoard(newPixelData);
      }
    } catch (e) {
      console.error('Failed to load canvas', e);
    }
  };

  const renderFullBoard = (data) => {
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
  };

  const updatePixel = (x, y, colorIndex) => {
    if (!boardRef.current) return;
    const ctx = boardRef.current.getContext('2d', { alpha: false });
    ctx.fillStyle = PALETTE[colorIndex];
    ctx.fillRect(x, y, 1, 1);
    
    setPixelData((prev) => {
      const next = new Uint8Array(prev);
      next[y * CANVAS_SIZE + x] = colorIndex;
      return next;
    });
  };

  const drawHoverPixel = (x, y, colorIndex) => {
    if (!overlayRef.current) return;
    const ctx = overlayRef.current.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE && colorIndex !== null) {
      // 70% opacity Selected color
      ctx.fillStyle = PALETTE[colorIndex] + 'B3'; 
      ctx.fillRect(x, y, 1, 1);
      
      // White border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.1;
      ctx.strokeRect(x, y, 1, 1);
    }
  };

  const getPixelColor = (x, y) => {
    const idx = pixelData[y * CANVAS_SIZE + x];
    if (idx !== undefined && idx < PALETTE.length) {
      return PALETTE[idx];
    }
    return null;
  };

  return { boardRef, overlayRef, loadBoard, updatePixel, drawHoverPixel, getPixelColor, pixelData };
}
