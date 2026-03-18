/**
 * Unit tests for useDebounce hook
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );

    rerender({ value: 'updated', delay: 300 });

    // Still the old value before the delay
    expect(result.current).toBe('initial');
  });

  it('updates the value after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );

    rerender({ value: 'updated', delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('updated');
  });

  it('resets the timer on rapid changes (only last value wins)', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 400 } }
    );

    rerender({ value: 'b', delay: 400 });
    act(() => { vi.advanceTimersByTime(200); });

    rerender({ value: 'c', delay: 400 });
    act(() => { vi.advanceTimersByTime(200); });

    // Only 200ms elapsed since last update — should still be 'a'
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(200); });

    // Now 400ms elapsed since 'c' was set
    expect(result.current).toBe('c');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 200 } }
    );

    rerender({ value: 42, delay: 200 });
    act(() => { vi.advanceTimersByTime(200); });

    expect(result.current).toBe(42);
  });

  it('works with object values', () => {
    const initial = { keyword: '', location: '' };
    const updated = { keyword: 'plumber', location: 'NY' };

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initial, delay: 300 } }
    );

    rerender({ value: updated, delay: 300 });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toEqual(updated);
  });

  it('cleans up the timer on unmount (no state update after unmount)', () => {
    const { result, rerender, unmount } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'start', delay: 300 } }
    );

    rerender({ value: 'changed', delay: 300 });
    unmount();

    // Advancing timers after unmount should not cause errors
    expect(() => { act(() => { vi.advanceTimersByTime(300); }); }).not.toThrow();
    // Value was the pre-unmount debounced value
    expect(result.current).toBe('start');
  });
});
