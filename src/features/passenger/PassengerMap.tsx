import type { CircleAppearance } from '../../map/models';
import { useEffect, useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { Camera, type CameraTarget } from '../../map/Camera';
import { RouteLayer, type RouteLayerProps } from '../../map/RouteLayer';
import { VehicleLayer } from '../../map/VehicleLayer';
import type { VehicleMotionConfig, VehicleSample } from '../../map/vehicleMotion';
import type { Assignment, Place, RideQuote } from './model';
import { PassengerMapPin, PassengerUserLocation } from './PassengerMapPin';

/** Required appearance/viewports are injected. The unfinished map design gets no production defaults. */
export interface PassengerMapConfig {
  readonly route: RouteLayerProps['appearance'];
  readonly point: CircleAppearance;
  readonly vehicle: CircleAppearance;
  readonly viewport: (quote: RideQuote | undefined, assignment: Assignment | undefined, origin: Place | null) => CameraTarget;
  readonly vehicleMotion: VehicleMotionConfig;
}
export function PassengerMap({ quote, assignment, origin, destination, home, ready, sheetHeight, config }: {
  quote?: RideQuote; assignment?: Assignment; origin: Place | null; destination: Place | null; home: boolean;
  ready: boolean; sheetHeight: number; config: PassengerMapConfig;
}) {
  const sample = useSharedValue<VehicleSample | null>(null);
  useEffect(() => { sample.set(assignment?.sample ?? null); }, [assignment?.sample, sample]);
  const target = useMemo(() => {
    const view = config.viewport(quote, assignment, origin);
    return { ...view, padding: { ...view.padding, bottom: (view.padding?.bottom ?? 0) + sheetHeight } };
  }, [assignment, config, origin, quote, sheetHeight]);
  return <>
    <Camera target={ready ? target : undefined} />
    {home && origin ? <PassengerUserLocation place={origin} />
      : (quote?.origin ?? origin) ? <PassengerMapPin place={(quote?.origin ?? origin)!} kind="origin" /> : null}
    {(quote?.destination ?? destination) ? <PassengerMapPin place={(quote?.destination ?? destination)!} kind="destination" /> : null}
    {quote ? <RouteLayer id="passenger-route" data={assignment?.routeToOrigin ?? quote.route}
      activeTone="greenDark" state="active" appearance={config.route} /> : null}
    <VehicleLayer id="passenger-assigned-vehicle" kind="circle" sample={sample} appearance={config.vehicle} motion={config.vehicleMotion} />
  </>;
}
