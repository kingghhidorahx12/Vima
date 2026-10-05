import type { CircleAppearance } from '../../map/models';
import { useEffect, useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { Camera, type CameraMode, type CameraTarget, type RecenterIntent } from '../../map/Camera';
import { TrafficFlowLayer } from '../../map/TrafficFlowLayer';
import { IncidentLayer } from '../../map/IncidentLayer';
import type { IncidentDetails } from '../../map/incidentDetails';
import type { TrafficLayerPreferences } from '../../map/traffic';
import { RouteLayer, type RouteLayerProps } from '../../map/RouteLayer';
import { VehicleLayer } from '../../map/VehicleLayer';
import type { VehicleMotionConfig, VehicleSample } from '../../map/vehicleMotion';
import type { Assignment, Place, RideQuote } from './model';
import { PassengerMapPin, PassengerUserLocation } from './PassengerMapPin';
import { visualTokens as t } from '../../design/tokens';
import type { PassengerRouteFitIntent } from './usePassengerRouteFit';
import { locationCtaHeight, mapControlSize, mapLayersMenuWidth, passengerPinClearance } from './mapCameraFootprint';

/** Required appearance/viewports are injected. The unfinished map design gets no production defaults. */
export interface PassengerMapConfig {
  readonly route: RouteLayerProps['appearance'];
  readonly point: CircleAppearance;
  readonly vehicle: CircleAppearance;
  readonly viewport: (quote: RideQuote | undefined, assignment: Assignment | undefined, origin: Place | null) => CameraTarget;
  readonly vehicleMotion: VehicleMotionConfig;
}
export function PassengerMap({ quote, assignment, origin, destination, currentLocation, home, ready, sheetHeight, topOcclusion = 0, locationCtaVisible = false, layersMenuOpen = false, searchPresentationActive,
  cameraMode = 'automatic', recenter, fitRoute, layers, displayKeyAvailable = false, active = true, manualSelection, config, onIncidentSelect }: {
  quote?: RideQuote; assignment?: Assignment; origin: Place | null; destination: Place | null; currentLocation?: Place | null; home: boolean;
  ready: boolean; sheetHeight: number; topOcclusion?: number; locationCtaVisible?: boolean; layersMenuOpen?: boolean; searchPresentationActive?: boolean; cameraMode?: CameraMode;
  recenter?: RecenterIntent; fitRoute?: Omit<PassengerRouteFitIntent, 'sheetHeight'> & { sheetHeight?: number }; layers?: TrafficLayerPreferences; displayKeyAvailable?: boolean; active?: boolean;
  onIncidentSelect?: (details: IncidentDetails) => void;
  manualSelection?: { coordinate: Place['coordinate']; kind: 'origin' | 'destination' } | null; config: PassengerMapConfig;
}) {
  const sample = useSharedValue<VehicleSample | null>(null);
  useEffect(() => { sample.set(assignment?.sample ?? null); }, [assignment?.sample, sample]);
  const target = useMemo(() => {
    const view = config.viewport(quote, assignment, origin);
    // Safe area, outer gap and navigation are outside the measured map. Only overlapping
    // chrome and sheet enter this padding.
    return { ...view, padding: { ...view.padding, top: Math.max(view.padding?.top ?? 0, topOcclusion), bottom: (view.padding?.bottom ?? 0) + sheetHeight } };
  }, [assignment, config, origin, quote, sheetHeight, topOcclusion]);
  return <>
    <Camera target={ready ? target : undefined} mode={searchPresentationActive ? 'search-locked' : cameraMode}
      recenter={ready ? recenter : undefined} fitRoute={ready && fitRoute ? {
        ...fitRoute, padding: { ...target.padding,
          top: (target.padding.top ?? 0) + passengerPinClearance.top,
          bottom: (target.padding.bottom ?? 0) - sheetHeight + (fitRoute.sheetHeight ?? sheetHeight) +
            passengerPinClearance.bottom + (locationCtaVisible ? locationCtaHeight + t.spacing.scalePx[2]! : 0),
          left: Math.max(target.padding.left ?? 0, passengerPinClearance.side),
          right: Math.max(target.padding.right ?? 0,
            t.spacing.mobileHorizontalMarginPx + (layersMenuOpen ? mapLayersMenuWidth : mapControlSize) +
            t.spacing.scalePx[2]! + passengerPinClearance.side) },
      } : undefined} />
    {displayKeyAvailable ? <TrafficFlowLayer enabled={!!layers?.traffic} /> : null}
    {displayKeyAvailable ? <IncidentLayer enabled={!!layers?.incidents} onSelect={onIncidentSelect} /> : null}
    {!searchPresentationActive && quote ? <RouteLayer id="passenger-route" data={assignment?.routeToOrigin ?? quote.route}
      activeTone="accentBlue" state="active" appearance={config.route} active={active} /> : null}
    {!searchPresentationActive ? <VehicleLayer id="passenger-assigned-vehicle" kind="circle" sample={sample}
      appearance={config.vehicle} motion={config.vehicleMotion} /> : null}
    {currentLocation ? <PassengerUserLocation place={currentLocation} active={active} /> : null}
    {!searchPresentationActive && !home && (quote?.origin ?? origin) ? <PassengerMapPin place={(quote?.origin ?? origin)!} kind="origin" /> : null}
    {!searchPresentationActive && (quote?.destination ?? destination) ? <PassengerMapPin place={(quote?.destination ?? destination)!} kind="destination" /> : null}
    {manualSelection ? <PassengerMapPin place={{ id: 'manual-selection', name: '', address: '', coordinate: manualSelection.coordinate }}
      kind={manualSelection.kind} /> : null}
  </>;
}
