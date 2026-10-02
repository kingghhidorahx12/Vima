export interface MotionPolicy {
  readonly reducedMotion: boolean;
  readonly allowVehicleInterpolation: boolean;
  readonly allowRouteReveal: boolean;
  readonly allowCameraAnimation: boolean;
  readonly navigation: 'translate-and-fade' | 'fade';
  readonly routeReveal: 'draw' | 'fade';
  readonly allowAmbientGradient: boolean;
  readonly allowDecorativeLoops: boolean;
  readonly searchPulse: 'rings' | 'static';
  readonly allowScaleTransforms: boolean;
}

export function createMotionPolicy(reducedMotion: boolean): MotionPolicy {
  return {
    reducedMotion,
    allowVehicleInterpolation: !reducedMotion,
    allowRouteReveal: !reducedMotion,
    allowCameraAnimation: !reducedMotion,
    navigation: reducedMotion ? 'fade' : 'translate-and-fade',
    routeReveal: reducedMotion ? 'fade' : 'draw',
    allowAmbientGradient: !reducedMotion,
    allowDecorativeLoops: !reducedMotion,
    searchPulse: reducedMotion ? 'static' : 'rings',
    allowScaleTransforms: !reducedMotion,
  };
}
