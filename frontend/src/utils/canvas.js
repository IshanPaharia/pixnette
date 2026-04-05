export const CANVAS_SIZE = parseInt(import.meta.env.VITE_CANVAS_SIZE) || 512;

export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

export const inBounds = (x, y) => {
  return x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE;
};

export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const canvasToPixel = (clientX, clientY, canvasWrapRect, offsetX, offsetY, scale) => {
  if (!canvasWrapRect) return { x: -1, y: -1 };
  const cx = clientX - canvasWrapRect.left;
  const cy = clientY - canvasWrapRect.top;
  const px = Math.floor((cx - offsetX) / scale);
  const py = Math.floor((cy - offsetY) / scale);
  return { x: px, y: py };
};
