'use client';

import { useReducedMotion, type MotionProps, type Transition } from 'framer-motion';

// Keep these timings aligned with the CSS motion tokens in workspace.css.
export const UI_MOTION = {
  feedback: 0.12,
  enter: 0.2,
  exit: 0.14,
  layout: 0.2,
  ease: [0.22, 1, 0.36, 1] as const,
};

const tween = (duration: number): Transition => ({ type: 'tween', duration, ease: UI_MOTION.ease });
type SurfaceMotion = Pick<MotionProps, 'initial' | 'animate' | 'exit' | 'transition'>;

function presets(reduced: boolean) {
  const transition = tween(reduced ? 0 : UI_MOTION.enter);
  const reorder: Transition = reduced ? tween(0) : { type: 'spring', stiffness: 500, damping: 40, mass: 0.7 };
  const dragTransition = reduced
    ? { bounceStiffness: 1000000, bounceDamping: 10000000, restDelta: 1, restSpeed: 10 }
    : { bounceStiffness: 600, bounceDamping: 45, restDelta: 0.5, restSpeed: 8 };
  const exitTransition = tween(reduced ? 0 : UI_MOTION.exit);
  const overlay: SurfaceMotion = {
    initial: { opacity: 0 }, animate: { opacity: 1 },
    exit: { opacity: 0, transition: exitTransition }, transition,
  };
  const surface = (offset: number): SurfaceMotion => ({
    initial: { opacity: 0, y: reduced ? 0 : offset },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduced ? 0 : offset, transition: exitTransition },
    transition,
  });
  const collapse: SurfaceMotion = {
    initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: { ...transition, opacity: tween(reduced ? 0 : UI_MOTION.feedback) },
  };
  return { reduced, transition, reorder, dragTransition, feedback: tween(reduced ? 0 : UI_MOTION.feedback), overlay, dialog: surface(8), popover: surface(-6), collapse };
}

const standard = presets(false);
const reduced = presets(true);

/** Stable presets: no per-render animation objects or staggered control delays. */
export function useUiMotion() {
  return useReducedMotion() ? reduced : standard;
}
