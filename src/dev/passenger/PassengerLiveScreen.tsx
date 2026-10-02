import { useState } from 'react';
import { PassengerScreen } from '../../features/passenger/PassengerScreen';
import { createApiClient } from '../../services/api/client';
import { createGeospatialClient } from '../../services/geospatial/client';
import { geospatialClientConfig } from '../../services/geospatial/config';
import { createPassengerLiveGateway } from '../../services/geospatial/passengerGateway';
import { mobilePersonalPlaces } from '../../services/geospatial/mobilePersonalPlaces';
import { mobileInstallationId } from '../../services/geospatial/mobileInstallation';
import { locateCurrentPlace } from '../../services/location/currentPlace';
import { developmentMap } from './mapConfig';

export default function PassengerLiveScreen() {
  const [gateway] = useState(() => {
    const api = createApiClient(process.env.EXPO_PUBLIC_VIMA_API_BASE_URL!, async () => null, { development: __DEV__ });
    const client = createGeospatialClient(api, geospatialClientConfig.timeoutMs);
    return createPassengerLiveGateway(client, signal => locateCurrentPlace(signal, client.reverseGeocode),
      mobilePersonalPlaces, mobileInstallationId);
  });
  return <PassengerScreen gateway={gateway} mapConfig={developmentMap} boundaries={{ schedule() {}, call() {}, safety() {} }} />;
}
