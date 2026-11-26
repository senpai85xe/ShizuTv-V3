import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { measureRelativePillRect, PillRect } from '../utils/appMotion';

const EMPTY_PILL: PillRect = { left: 0, top: 0, width: 0, height: 0, ready: false };

/**
 * Measures the active element inside a relative container and exposes GPU-friendly
 * coordinates for a sliding Apple-spring indicator pill.
 */
export function useSlidingPill<T extends HTMLElement = HTMLDivElement>(
  activeKey: string,
  recalcKey?: unknown,
) {
  const containerRef = useRef<T | null>(null);
  const itemsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [pillRect, setPillRect] = useState<PillRect>(EMPTY_PILL);

  const registerItemRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) itemsRef.current.set(key, el);
      else itemsRef.current.delete(key);
    },
    [],
  );

  const updatePill = useCallback(() => {
    const container = containerRef.current;
    const target = itemsRef.current.get(activeKey);
    if (!container || !target) {
      setPillRect((prev) => (prev.ready ? EMPTY_PILL : prev));
      return;
    }
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const next = measureRelativePillRect(cRect, tRect, {
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      clientLeft: container.clientLeft,
      clientTop: container.clientTop,
    });
    setPillRect((prev) =>
      prev.ready === next.ready &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.top - next.top) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5 &&
      Math.abs(prev.height - next.height) < 0.5
        ? prev
        : next,
    );
  }, [activeKey]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const target = itemsRef.current.get(activeKey);
    if (container && target && container.scrollWidth > container.clientWidth + 4) {
      const targetLeft = target.offsetLeft;
      const targetRight = targetLeft + target.offsetWidth;
      const viewLeft = container.scrollLeft;
      const viewRight = viewLeft + container.clientWidth;
      if (targetLeft < viewLeft + 8 || targetRight > viewRight - 8) {
        container.scrollTo({
          left: Math.max(0, targetLeft - (container.clientWidth - target.offsetWidth) / 2),
          behavior: 'smooth',
        });
      }
    }
    updatePill();
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updatePill());
    ro.observe(container);
    if (target) ro.observe(target);
    return () => ro.disconnect();
  }, [activeKey, recalcKey, updatePill]);

  return { containerRef, registerItemRef, pillRect };
}
