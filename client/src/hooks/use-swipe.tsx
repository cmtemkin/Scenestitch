import { useState, useRef, useCallback, TouchEvent } from "react";

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  preventDefaultOnSwipe?: boolean;
}

interface UseSwipeReturn {
  handlers: SwipeHandlers;
  swiping: boolean;
  direction: "left" | "right" | "up" | "down" | null;
  deltaX: number;
  deltaY: number;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  preventDefaultOnSwipe = false,
}: UseSwipeOptions = {}): UseSwipeReturn {
  const [swiping, setSwiping] = useState(false);
  const [direction, setDirection] = useState<"left" | "right" | "up" | "down" | null>(null);
  const [deltaX, setDeltaX] = useState(0);
  const [deltaY, setDeltaY] = useState(0);
  
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    setSwiping(true);
    setDirection(null);
    setDeltaX(0);
    setDeltaY(0);
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!swiping) return;

    const touch = e.touches[0];
    const currentDeltaX = touch.clientX - startX.current;
    const currentDeltaY = touch.clientY - startY.current;

    setDeltaX(currentDeltaX);
    setDeltaY(currentDeltaY);

    const absX = Math.abs(currentDeltaX);
    const absY = Math.abs(currentDeltaY);

    if (absX > absY && absX > 10) {
      setDirection(currentDeltaX > 0 ? "right" : "left");
      if (preventDefaultOnSwipe) {
        e.preventDefault();
      }
    } else if (absY > absX && absY > 10) {
      setDirection(currentDeltaY > 0 ? "down" : "up");
    }
  }, [swiping, preventDefaultOnSwipe]);

  const onTouchEnd = useCallback((e: TouchEvent) => {
    if (!swiping) return;

    const duration = Date.now() - startTime.current;
    const velocity = Math.abs(deltaX) / duration;

    const isQuickSwipe = velocity > 0.3 && duration < 300;
    const isLongSwipe = Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;

    if (isQuickSwipe || isLongSwipe) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX > absY) {
        if (deltaX > threshold || (isQuickSwipe && deltaX > 20)) {
          onSwipeRight?.();
        } else if (deltaX < -threshold || (isQuickSwipe && deltaX < -20)) {
          onSwipeLeft?.();
        }
      } else {
        if (deltaY > threshold) {
          onSwipeDown?.();
        } else if (deltaY < -threshold) {
          onSwipeUp?.();
        }
      }
    }

    setSwiping(false);
    setDirection(null);
    setDeltaX(0);
    setDeltaY(0);
  }, [swiping, deltaX, deltaY, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return {
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    swiping,
    direction,
    deltaX,
    deltaY,
  };
}
