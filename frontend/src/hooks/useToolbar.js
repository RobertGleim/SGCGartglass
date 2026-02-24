import { useState, useEffect } from 'react';

const TOOL_KEYS = {
  paintBucket: 'b',
  eyedropper: 'i',
  eraser: 'e',
  hand: 'h',
};

export default function useToolbar() {
  const [activeTool, setActiveTool] = useState('paintBucket');

  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      for (const [tool, key] of Object.entries(TOOL_KEYS)) {
        if (e.key.toLowerCase() === key) {
          setActiveTool(tool);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return {
    activeTool,
    setActiveTool,
    TOOL_KEYS,
  };
}
