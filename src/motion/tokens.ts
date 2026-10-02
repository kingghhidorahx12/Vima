import source from '../../docs/design/vima.motion.final.json' with { type: 'json' };

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
export const motionTokens: DeepReadonly<typeof source> = source;
export const motionSystemStatus = 'approved-p0' as const;
