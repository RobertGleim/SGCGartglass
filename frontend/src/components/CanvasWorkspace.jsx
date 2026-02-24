import { useEffect, useRef, useState } from 'react';
import useHistory from '../hooks/useHistory';
import useZoomPan from '../hooks/useZoomPan';
import { fabric } from 'fabric';
import { parseSVG } from '../utils/svgParser';
import { renderTemplate } from '../utils/canvasRenderer';
import useRegionSelection from '../hooks/useRegionSelection';
import usePaintBucket from '../hooks/usePaintBucket';

const DESKTOP_SIZE = 2000;
const MOBILE_SIZE = 1000;

function getCanvasSize() {
  if (window.innerWidth < 767) return 1000;
  if (window.innerWidth < 1024) return 1500;
  return 2000;
}

export default function CanvasWorkspace({ templateSVG, currentColor, currentGlassType, currentTextureUrl }) {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const { handleRegionClick, clearSelection } = useRegionSelection();
  const { filledRegions, fillRegion } = usePaintBucket();
  const [regionMap, setRegionMap] = useState({});
  const {
    // removed unused history and currentIndex
    addAction,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    currentAction,
  } = useHistory();
  const {
    zoom,
    pan,
    // removed unused zoomIn and zoomOut
    resetView,
    handleWheel,
    handlePan,
    animateZoom,
    // removed unused setZoom and setPan
  } = useZoomPan();

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const size = getCanvasSize();
    canvasEl.width = size;
    canvasEl.height = size;
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
    }
    const fabricCanvas = new fabric.Canvas(canvasEl, {
      width: size,
      height: size,
      preserveObjectStacking: true,
      selection: false,
    });
    fabricCanvasRef.current = fabricCanvas;
    try {
      const parsed = parseSVG(templateSVG);
      renderTemplate(fabricCanvas, parsed.regions);
      // Build region map for quick lookup
      const map = {};
      fabricCanvas.getObjects().forEach(obj => {
        if (obj.regionId) map[obj.regionId] = obj;
      });
    } catch (err) {
      // removed unused eslint-disable directive
      console.error('Canvas render error:', err);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegionMap(map);
    const handleResize = () => {
      const newSize = getCanvasSize();
      fabricCanvas.setWidth(newSize);
      fabricCanvas.setHeight(newSize);
      fabricCanvas.calcOffset();
      fabricCanvas.renderAll();
    };
    window.addEventListener('resize', handleResize);
    // Clear history on template change
    clearHistory();
    // Reset zoom/pan
    resetView();
    return () => {
      window.removeEventListener('resize', handleResize);
      fabricCanvas.dispose();
    };
  }, [templateSVG, clearHistory, resetView]);
  // Apply zoom/pan to Fabric.js canvas
  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;
    fabricCanvas.setZoom(zoom);
    fabricCanvas.viewportTransform[4] = pan.x;
    fabricCanvas.viewportTransform[5] = pan.y;
    fabricCanvas.renderAll();
  }, [zoom, pan]);
  // Mouse wheel zoom
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    function wheelHandler(e) {
      const rect = canvasEl.getBoundingClientRect();
      const cursor = {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
      };
      handleWheel(e, fabricCanvasRef.current, cursor);
    }
    canvasEl.addEventListener('wheel', wheelHandler, { passive: false });
    return () => canvasEl.removeEventListener('wheel', wheelHandler);
  }, [zoom, handleWheel]);
  // Click-drag pan (hand tool or spacebar)
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    let dragging = false;
    let last = { x: 0, y: 0 };
    let handMode = false;
    function down(e) {
      if (e.button !== 0) return;
      handMode = (window.activeTool === 'hand') || e.shiftKey || e.ctrlKey || e.metaKey || e.key === ' ';
      if (!handMode) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    }
    function move(e) {
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      handlePan(dx, dy, fabricCanvasRef.current);
      last = { x: e.clientX, y: e.clientY };
    }
    function up() { dragging = false; }
    canvasEl.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      canvasEl.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [handlePan]);
  // Pinch gesture for mobile (touch events)
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    let lastDist = null;
    let lastPan = null;
    function getTouchDist(touches) {
      const [a, b] = touches;
      return Math.sqrt((a.clientX - b.clientX) ** 2 + (a.clientY - b.clientY) ** 2);
    }
    function getTouchMid(touches) {
      const [a, b] = touches;
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    }
    function touchStart(e) {
      if (e.touches.length === 2) {
        lastDist = getTouchDist(e.touches);
        lastPan = { ...pan };
      }
    }
    function touchMove(e) {
      if (e.touches.length === 2) {
        const dist = getTouchDist(e.touches);
        const mid = getTouchMid(e.touches);
        const delta = dist - lastDist;
        const newZoom = Math.max(0.5, Math.min(4, zoom + delta * 0.005));
        animateZoom(newZoom);
        // Pan
        const dx = mid.x - (lastPan.x || 0);
        const dy = mid.y - (lastPan.y || 0);
        handlePan(dx, dy, fabricCanvasRef.current);
        lastDist = dist;
        lastPan = { x: mid.x, y: mid.y };
      }
    }
    canvasEl.addEventListener('touchstart', touchStart);
    canvasEl.addEventListener('touchmove', touchMove);
    return () => {
      canvasEl.removeEventListener('touchstart', touchStart);
      canvasEl.removeEventListener('touchmove', touchMove);
    };
  }, [zoom, pan, animateZoom, handlePan]);

  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;
    fabricCanvas.on('mouse:down', (e) => {
      const obj = e.target;
      if (obj && obj.regionId) {
        clearSelection();
        handleRegionClick(obj);
        // Save previous state for undo
        const prev = filledRegions[obj.regionId] || {};
        fillRegion(obj, currentColor, currentGlassType, currentTextureUrl);
        addAction({
          type: 'FILL_REGION',
          regionId: obj.regionId,
          color: currentColor,
          glassType: currentGlassType,
          previousColor: prev.color,
          previousGlassType: prev.glassType,
        });
      } else {
        clearSelection();
      }
    });
    return () => {
      fabricCanvas.off('mouse:down');
    };
  }, [currentColor, currentGlassType, currentTextureUrl, handleRegionClick, clearSelection, fillRegion, filledRegions, addAction]);
  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canUndo, canRedo, undo, redo]);

  // Undo/redo logic: restore previous state
  useEffect(() => {
    if (!currentAction) return;
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;
    if (currentAction.type === 'FILL_REGION') {
      const obj = regionMap[currentAction.regionId];
      if (obj) {
        obj.set({ fill: currentAction.color });
        obj.set({ glassType: currentAction.glassType });
        // Fabric.js manages dirty state internally; no need to set manually
        obj.canvas?.renderAll();
      }
    } else if (currentAction.type === 'ERASE_REGION') {
      const obj = regionMap[currentAction.regionId];
      if (obj) {
        obj.set({ fill: currentAction.previousColor || '#fff', glassType: currentAction.previousGlassType });
        obj.canvas?.renderAll();
      }
    } else if (currentAction.type === 'CLEAR_ALL') {
      // Restore previous state
      Object.entries(currentAction.previousState).forEach(([regionId, state]) => {
        const obj = regionMap[regionId];
        if (obj) {
          obj.set({ fill: state.color || '#fff', glassType: state.glassType });
          obj.canvas?.renderAll();
        }
      });
    }
  }, [currentAction, regionMap]);

  // Example: integrate with Toolbar
  // Pass canUndo/canRedo to Toolbar for button states

  // Zoom level indicator
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(44,62,80,0.08)',
          touchAction: 'none',
          ...(window.innerWidth < 767 && { minHeight: 320, minWidth: 320 })
        }}
        aria-label="Design canvas"
      />
      <div style={{ position: 'absolute', top: 16, right: 24, background: '#222', color: '#fff', borderRadius: '8px', padding: '0.3rem 0.8rem', fontSize: '1rem', opacity: 0.85, zIndex: 10 }}>
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
