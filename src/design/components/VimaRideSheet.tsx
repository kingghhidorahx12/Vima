import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { moveTo, type ApprovedTiming } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { useVimaTheme } from '../themes';
import { allowedSheetGeometry, nearestSheetSnap } from './rideSheetGeometry';

/** Low-level contract retained for screens with approved custom gesture arbitration. */
export interface RideSheetInteraction {
  readonly height?: number;
  readonly minOffset: number;
  readonly maxOffset: number;
  readonly targetOffset: number;
  readonly allowedOffsets: readonly number[];
  readonly activeOffsetY?: [number, number];
  readonly failOffsetX?: [number, number];
  /** Must be a worklet. No invented velocity thresholds or spring physics. */
  readonly settle: (offset: number, velocity: number) => number;
  readonly timing?: ApprovedTiming;
}

export function createRideSheetInteraction(height: number, targetOffset: number,
  allowedOffsets: readonly number[]): RideSheetInteraction {
  const geometry = allowedSheetGeometry(height, targetOffset, allowedOffsets);
  return { ...geometry, timing: motionTimings.sheetSnap, settle: (offset) => {
    'worklet';
    return nearestSheetSnap(offset, geometry.allowedOffsets);
  } };
}

export interface VimaRideSheetProps extends PropsWithChildren {
  readonly style?: StyleProp<ViewStyle>;
  readonly interaction?: RideSheetInteraction;
  readonly enabled?: boolean;
  readonly open?: boolean;
  /** Optional dedicated drag area so scrollable content does not compete with the pan. */
  readonly header?: ReactNode;
  readonly onVisibleHeightChange?: (height: number) => void;
}

export function VimaRideSheet({ children, style, interaction, enabled = true, open = true, header, onVisibleHeightChange }: VimaRideSheetProps) {
  const theme = useVimaTheme();
  const policy = useMotionPolicy();
  const offset = useSharedValue(interaction?.height ?? interaction?.targetOffset ?? 0);
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);
  const wasOpen = useRef(false);
  const reportedHeight = useSharedValue(-1);
  const sheetHeight = interaction?.height ?? 0;
  const restHeight = sheetHeight - (interaction?.targetOffset ?? 0);
  useAnimatedReaction(() => Math.max(0, sheetHeight - offset.get()), visible => {
    if (onVisibleHeightChange && (Math.abs(visible - reportedHeight.get()) >= 8 || visible === restHeight && visible !== reportedHeight.get())) {
      reportedHeight.set(visible); scheduleOnRN(onVisibleHeightChange, visible);
    }
  }, [sheetHeight, restHeight, onVisibleHeightChange]);
  useEffect(() => {
    cancelAnimation(offset);
    dragging.set(false);
    const target = open ? interaction?.targetOffset ?? 0 : interaction?.height ?? 0;
    const timing = !open ? motionTimings.sheetClose : !wasOpen.current
      ? motionTimings.sheetEnter : interaction?.timing ?? motionTimings.sheetSnap;
    wasOpen.current = open;
    offset.set(moveTo(target, policy.reducedMotion, timing));
    return () => cancelAnimation(offset);
  }, [dragging, interaction, offset, open, policy.reducedMotion]);

  const pan = Gesture.Pan().enabled(enabled && open && !!interaction)
    .onStart(() => { dragging.set(true); cancelAnimation(offset); start.set(offset.get()); })
    .onUpdate((event) => {
      if (!interaction) return;
      offset.set(Math.min(interaction.maxOffset, Math.max(interaction.minOffset, start.get() + event.translationY)));
    })
    .onFinalize((event, success) => {
      if (!interaction || !dragging.get()) return;
      dragging.set(false);
      const requested = interaction.settle(offset.get(), success ? event.velocityY : 0);
      const target = Math.min(interaction.maxOffset, Math.max(interaction.minOffset, requested));
      offset.set(moveTo(target, policy.reducedMotion, interaction.timing ?? motionTimings.sheetSnap));
    });
  if (interaction?.activeOffsetY) pan.activeOffsetY(interaction.activeOffsetY);
  if (interaction?.failOffsetX) pan.failOffsetX(interaction.failOffsetX);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const viewportStyle = useAnimatedStyle(() => interaction?.height
    ? { height: Math.max(0, interaction.height - offset.get()) } : {});
  const surface = <Animated.View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={[theme.surfaces.sheet, interaction?.height ? [styles.overlay, { height: interaction.height }] : null,
          style, !open && !interaction?.height ? { display: 'none' } : null, animatedStyle]}>
        <Animated.View style={viewportStyle}>
          {header ? <GestureDetector gesture={pan}><Animated.View>{header}</Animated.View></GestureDetector> : null}
          {children}
        </Animated.View>
      </Animated.View>;
  return header ? surface : <GestureDetector gesture={pan}>{surface}</GestureDetector>;
}

const styles = StyleSheet.create({ overlay: { position: 'absolute', bottom: 0, left: 0, right: 0 } });
