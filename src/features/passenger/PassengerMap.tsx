import type { CircleAppearance } from '../../map/models';
import { useMemo, useState } from 'react';
import { advanceAssignmentView, initialAssignmentView } from './assignmentMapView';
import { useFreshVehicleLocation } from '../../map/useFreshVehicleLocation';
import { Camera, type CameraMode, type CameraTarget, type RecenterIntent } from '../../map/Camera';
import { TrafficFlowLayer } from '../../map/TrafficFlowLayer';
import { IncidentLayer } from '../../map/IncidentLayer';
import type { IncidentDetails } from '../../map/incidentDetails';
import type { TrafficLayerPreferences } from '../../map/traffic';
import { RouteLayer, type RouteLayerProps } from '../../map/RouteLayer';
import { VehicleMarker } from '../../map/DriverVehicleMarker';
import type { VehicleMotionConfig } from '../../map/vehicleMotion';
import type { RequestState } from '../../services/matching/contracts';
import type { Assignment, Place, RideQuote } from './model';
import { PassengerMapPin, PassengerUserLocation } from './PassengerMapPin';
import { visualTokens as t } from '../../design/tokens';
import type { PassengerRouteFitIntent } from './usePassengerRouteFit';
import { locationCtaHeight, mapControlSize, passengerPinClearance } from './mapCameraFootprint';

/** Required appearance/viewports are injected. The unfinished map design gets no production defaults. */
export interface PassengerMapConfig {
  readonly route: RouteLayerProps['appearance'];
  readonly point: CircleAppearance;
  readonly vehicle: CircleAppearance;
  readonly viewport: (quote: RideQuote | undefined, assignment: Assignment | undefined, origin: Place | null) => CameraTarget;
  readonly vehicleMotion: VehicleMotionConfig;
}
export function PassengerMap({ quote, assignment, requestState, origin, destination, currentLocation, home, ready, sheetHeight, topOcclusion = 0, homeBottomOcclusion, locationCtaVisible = false, searchPresentationActive,
  cameraMode = 'automatic', recenter, fitRoute, northRequest, layers, displayKeyAvailable = false, active = true, manualSelection, config, onIncidentSelect }: {
  quote?: RideQuote; assignment?: Assignment; requestState?: RequestState; origin: Place | null; destination: Place | null; currentLocation?: Place | null; home: boolean;
  ready: boolean; sheetHeight: number; topOcclusion?: number; homeBottomOcclusion?: number; locationCtaVisible?: boolean; layersMenuOpen?: boolean; searchPresentationActive?: boolean; cameraMode?: CameraMode;
  recenter?: RecenterIntent; fitRoute?: Omit<PassengerRouteFitIntent, 'sheetHeight'> & { sheetHeight?: number }; northRequest?: number;
  layers?: TrafficLayerPreferences; displayKeyAvailable?: boolean; active?: boolean;
  onIncidentSelect?: (details: IncidentDetails) => void;
  manualSelection?: { coordinate: Place['coordinate']; kind: 'origin' | 'destination' } | null; config: PassengerMapConfig;
}) {
  const vehicle = assignment?.sample;
  const location = vehicle?.capturedAt !== undefined && !home &&
    ['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS'].includes(requestState ?? '')
    ? { coordinate: vehicle.coordinate, receivedAt: vehicle.capturedAt,
      ...(vehicle.headingKnown !== false ? { heading: vehicle.heading } : {}) } : undefined;
  const pickupPhase = ['ASSIGNED', 'ARRIVED_PICKUP'].includes(requestState ?? '');
  const freshLocation = useFreshVehicleLocation(location);
  const view = config.viewport(quote, pickupPhase ? assignment : undefined, origin);
  const [assignmentView, setAssignmentView] = useState(initialAssignmentView);
  const freshCoordinate = freshLocation?.receivedAt === vehicle?.capturedAt &&
    freshLocation?.coordinate[0] === vehicle?.coordinate[0] && freshLocation?.coordinate[1] === vehicle?.coordinate[1]
    ? freshLocation?.coordinate : undefined;
  const nextView = advanceAssignmentView(assignmentView, assignment, requestState, view, freshCoordinate);
  if (nextView !== assignmentView) setAssignmentView(nextView);
  const phaseViewport = nextView.target ?? view;
  const phaseViewportKey = JSON.stringify(phaseViewport);
  const stableViewport = useMemo(() => JSON.parse(phaseViewportKey) as CameraTarget, [phaseViewportKey]);
  const targetValue = useMemo(() => {
    // The caller measures top chrome in the map's coordinate frame. Navigation remains
    // outside the map; the sheet contributes only its visible height.
    return { ...stableViewport, padding: { ...stableViewport.padding, top: Math.max(stableViewport.padding?.top ?? 0, topOcclusion), bottom: (stableViewport.padding?.bottom ?? 0) + sheetHeight } };
  }, [stableViewport, sheetHeight, topOcclusion]);
  // Live vehicle revisions must not reissue an identical camera command on every fix.
  const targetKey = JSON.stringify(targetValue);
  const target = useMemo(() => JSON.parse(targetKey) as typeof targetValue, [targetKey]);
  // Preserve previous non-Home recenter behavior. Normal Home uses the measured
  // search top as its bottom viewport boundary for both initial and explicit centers.
  const previousRecenterPadding = useMemo(() => ({ ...target.padding,
    bottom: (target.padding.bottom ?? 0) + 28 }), [target]);
  const centeredPadding = useMemo(() => home && homeBottomOcclusion !== undefined
    ? { ...target.padding, bottom: (target.padding.bottom ?? 0) - sheetHeight + homeBottomOcclusion }
    : previousRecenterPadding, [home, homeBottomOcclusion, target, sheetHeight, previousRecenterPadding]);
  const homeTarget = useMemo(() => home ? { ...target, padding: centeredPadding } : target,
    [home, target, centeredPadding]);
  const safetyMargin = fitRoute?.safetyMargin ?? 0;
  const horizontalFitPadding = Math.max(target.padding.left ?? 0, target.padding.right ?? 0, passengerPinClearance.side + safetyMargin);
  const rightFitPadding = safetyMargin > 0 ? Math.max(horizontalFitPadding,
    t.spacing.mobileHorizontalMarginPx + mapControlSize + passengerPinClearance.side + safetyMargin) : horizontalFitPadding;
  const fitPadding = { ...target.padding,
    top: (target.padding.top ?? 0) + passengerPinClearance.top + safetyMargin,
    bottom: (target.padding.bottom ?? 0) - sheetHeight + (fitRoute?.sheetHeight ?? sheetHeight) +
      passengerPinClearance.bottom + safetyMargin + (locationCtaVisible ? locationCtaHeight + t.spacing.scalePx[2]! : 0) +
      (fitRoute?.confirmationBottomPadding ?? 0),
    left: horizontalFitPadding, right: rightFitPadding };
  const fitSize = safetyMargin > 0 ? fitRoute?.viewportSize : undefined;
  // An intermediate/occluded layout must never send impossible padding to MapLibre.
  // The next settled geometry issues a fresh intent instead of shrinking safe margins.
  const fitHasRoom = !fitSize || fitSize.height > fitPadding.top + fitPadding.bottom &&
    fitSize.width > fitPadding.left + fitPadding.right;
  const visibleOrigin = !searchPresentationActive && !home ? origin ?? quote?.origin : null;
  const manualOrigin = manualSelection?.kind === 'origin' ? manualSelection.coordinate : null;
  const samePosition = (coordinate: Place['coordinate']) => currentLocation?.coordinate[0] === coordinate[0]
    && currentLocation.coordinate[1] === coordinate[1];
  const showCurrentLocation = !!currentLocation && !(visibleOrigin && samePosition(visibleOrigin.coordinate))
    && !(manualOrigin && samePosition(manualOrigin));
  return <>
    <Camera target={ready ? homeTarget : undefined} recenterPadding={ready ? centeredPadding : undefined} northRequest={ready ? northRequest : undefined}
      mode={searchPresentationActive ? 'search-locked' : cameraMode}
      recenter={ready ? recenter : undefined} fitRoute={ready && fitRoute && fitHasRoom ? { ...fitRoute, padding: fitPadding } : undefined} />
    {displayKeyAvailable ? <TrafficFlowLayer enabled={!!layers?.traffic} /> : null}
    {displayKeyAvailable ? <IncidentLayer enabled={!!layers?.incidents} onSelect={onIncidentSelect} /> : null}
    {!searchPresentationActive && (pickupPhase ? assignment?.routeToOrigin ?? quote?.route : quote?.route) ? <RouteLayer id="passenger-route" data={(pickupPhase ? assignment?.routeToOrigin ?? quote?.route : quote?.route)!}
      activeTone="accentBlue" state="active" appearance={config.route} active={active} /> : null}
    {!searchPresentationActive ? <VehicleMarker key={assignment?.id} id="passenger-assigned-vehicle"
      location={location} sequence={vehicle?.sequence ?? 0} /> : null}
    {showCurrentLocation ? <PassengerUserLocation place={currentLocation!} active={active} /> : null}
    {visibleOrigin ? <PassengerMapPin place={visibleOrigin} kind="origin" /> : null}
    {!searchPresentationActive && (quote?.destination ?? destination) ? <PassengerMapPin place={(quote?.destination ?? destination)!} kind="destination" /> : null}
    {manualSelection ? <PassengerMapPin place={{ id: 'manual-selection', name: '', address: '', coordinate: manualSelection.coordinate }}
      kind={manualSelection.kind} /> : null}
  </>;
}
