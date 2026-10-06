import { motionTokens } from './tokens.ts';

export type Bezier = readonly [number, number, number, number];

export function parseBezier(value: string): Bezier {
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(value);
  const points = match?.[1]?.split(',').map(Number);
  if (!points || points.length !== 4 || points.some((n) => !Number.isFinite(n)) ||
    points[0]! < 0 || points[0]! > 1 || points[2]! < 0 || points[2]! > 1) {
    throw new Error(`Unsupported approved easing: ${value}`);
  }
  return points as unknown as Bezier;
}

function axis(t: number, first: number, second: number): number {
  'worklet';
  return 3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;
}

/** Solve x(t)=progress before evaluating y(t); control-point y alone is not CSS easing. */
export function evaluateBezier(progress: number, points: Bezier): number {
  'worklet';
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let low = 0;
  let high = 1;
  // Numerical precision only; this iteration budget is not a design token.
  for (let i = 0; i < 32; i += 1) {
    const middle = (low + high) / 2;
    if (axis(middle, points[0], points[2]) < progress) low = middle;
    else high = middle;
  }
  return axis((low + high) / 2, points[1], points[3]);
}

function easing(value: string) {
  const points = parseBezier(value);
  return (progress: number) => {
    'worklet';
    return evaluateBezier(progress, points);
  };
}

export const motionEasings = {
  enter: easing(motionTokens.easings.enter), state: easing(motionTokens.easings.state), exit: easing(motionTokens.easings.exit),
};

export function timing(duration: keyof typeof motionTokens.durationsMs, curve: keyof typeof motionEasings) {
  return { duration: motionTokens.durationsMs[duration], easing: motionEasings[curve] };
}

/** Bind approved semantic rules to exact JSON values. No springs or invented physics. */
export const motionTimings = {
  press: timing('instant', 'state'), release: timing('fast', 'state'), focus: timing('fast', 'state'),
  shortEnter: timing('fast', 'enter'), listEnter: timing('feedback', 'enter'), feedback: timing('feedback', 'state'),
  scene: timing('normal', 'enter'), sceneExit: timing('normal', 'exit'),
  sceneSurface: timing('surface', 'enter'), sceneSurfaceExit: timing('surface', 'exit'),
  state: timing('normal', 'state'),
  navigation: timing('normal', 'enter'), sheetEnter: timing('surface', 'enter'),
  sheetClose: timing('normal', 'exit'), sheetSnap: timing('surface', 'state'),
  map: timing('map', 'state'), success: timing('success', 'enter'),
};

export const motionDistances = {
  shortEnterY: Math.abs(motionTokens.interactionRules.pinEnterTranslateYPx),
  listEnterY: motionTokens.interactionRules.listEnterTranslateYPx,
  sceneTransitionY: motionTokens.interactionRules.sceneTransitionTranslateYPx,
} as const;
