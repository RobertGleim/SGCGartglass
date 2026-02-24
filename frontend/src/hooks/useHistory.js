import { useState, useCallback } from 'react';

const MAX_HISTORY = 50;

export default function useHistory() {
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Add action to history
  const addAction = useCallback((action) => {
    setHistory((prev) => {
      let newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push(action);
      if (newHistory.length > MAX_HISTORY) {
        newHistory = newHistory.slice(newHistory.length - MAX_HISTORY);
      }
      return newHistory;
    });
    setCurrentIndex((idx) => Math.min(idx + 1, MAX_HISTORY - 1));
  }, [currentIndex]);

  // Undo
  const undo = useCallback(() => {
    setCurrentIndex((idx) => (idx > 0 ? idx - 1 : idx));
  }, []);

  // Redo
  const redo = useCallback(() => {
    setCurrentIndex((idx) => (idx < history.length - 1 ? idx + 1 : idx));
  }, [history.length]);

  // Computed values
  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  // Get current action
  const currentAction = history[currentIndex] || null;

  return {
    history,
    currentIndex,
    addAction,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    currentAction,
  };
}

// Action types:
// FILL_REGION: {type: 'FILL_REGION', regionId, color, glassType, previousColor, previousGlassType}
// ERASE_REGION: {type: 'ERASE_REGION', regionId, previousColor, previousGlassType}
// CLEAR_ALL: {type: 'CLEAR_ALL', previousState}
