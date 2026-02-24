import { useState, useRef } from 'react';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.1;

export default function useZoomPan() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const rafRef = useRef(null);

  // Zoom in
  function zoomIn() {
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }

  // Zoom out
  function zoomOut() {
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }

  // Reset view
  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // Mouse wheel zoom
  function handleWheel(event, canvas, cursor) {
    event.preventDefault();
    let delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    let newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
    // Zoom at cursor position
    if (canvas && cursor) {
      const { x, y } = cursor;
      const zoomFactor = newZoom / zoom;
      const newPan = {
        x: (pan.x - x) * zoomFactor + x,
        y: (pan.y - y) * zoomFactor + y,
      };
      setPan(newPan);
    }
    setZoom(newZoom);
  }

  // Pan canvas
  function handlePan(deltaX, deltaY, canvas) {
    // Pan boundaries
    let newX = pan.x + deltaX;
    let newY = pan.y + deltaY;
    // Clamp pan to canvas edges
    if (canvas) {
      const width = canvas.getWidth();
      const height = canvas.getHeight();
      newX = Math.max(-width * (zoom - 1), Math.min(newX, width * (zoom - 1)));
      newY = Math.max(-height * (zoom - 1), Math.min(newY, height * (zoom - 1)));
    }
    setPan({ x: newX, y: newY });
  }

  // Smooth zoom (requestAnimationFrame)
  function animateZoom(targetZoom) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const start = zoom;
    const duration = 200;
    let startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const z = start + (targetZoom - start) * progress;
      setZoom(z);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
  }

  return {
    zoom,
    pan,
    zoomIn,
    zoomOut,
    resetView,
    handleWheel,
    handlePan,
    animateZoom,
    setZoom,
    setPan,
  };
}
