import { describe, it, expect } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-hooks';
import useHistory from '../useHistory';

describe('useHistory', () => {
  it('adds actions to history', () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.addAction('A'));
    expect(result.current.history).toContain('A');
  });

  it('undo reverts state', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.addAction('A');
      result.current.addAction('B');
      result.current.undo();
    });
    expect(result.current.history).not.toContain('B');
    expect(result.current.history).toContain('A');
  });

  it('redo reapplies state', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.addAction('A');
      result.current.undo();
      result.current.redo();
    });
    expect(result.current.history).toContain('A');
  });

  it('max 50 actions enforced', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      for (let i = 0; i < 55; i++) result.current.addAction(`A${i}`);
    });
    expect(result.current.history.length).toBeLessThanOrEqual(50);
  });

  it('handles empty history', () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.undo());
    expect(result.current.history.length).toBe(0);
  });
});
