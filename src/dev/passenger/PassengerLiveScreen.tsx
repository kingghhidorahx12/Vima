import { useState } from 'react';
import { PassengerScreen } from '../../features/passenger/PassengerScreen';
import { createGeospatialClient } from '../../services/geospatial/client';
import { geospatialClientConfig } from '../../services/geospatial/config';
import { createPassengerLiveGateway } from '../../services/geospatial/passengerGateway';
import { mobilePersonalPlaces } from '../../services/geospatial/mobilePersonalPlaces';
import { mobileInstallationId } from '../../services/geospatial/mobileInstallation';
import { locateCurrentPlace } from '../../services/location/currentPlace';
import { developmentMap } from './mapConfig';
import { LiveAccountGate } from '../LiveAccountGate';
import type { ApiClient } from '../../services/api/client';
import type { MatchingClient } from '../../services/matching/client';
import type { MatchingIdentity } from '../../services/matching/contracts';

export default function PassengerLiveScreen() {
  return <LiveAccountGate role="passenger">{session => <AuthenticatedPassenger key={session.identity.accountId} {...session} />}</LiveAccountGate>;
}
function AuthenticatedPassenger({ api, matching, identity }: { api: ApiClient; matching: MatchingClient; identity: MatchingIdentity }) {
  const [gateway] = useState(() => {
    const client = createGeospatialClient(api, geospatialClientConfig.timeoutMs);
    return createPassengerLiveGateway(client, signal => locateCurrentPlace(signal, client.reverseGeocode),
      mobilePersonalPlaces, mobileInstallationId, process.env.EXPO_PUBLIC_VIMA_API_BASE_URL,
      { matching, accountId: identity.accountId, available: identity.matchingAvailable });
  });
  return <PassengerScreen gateway={gateway} mapConfig={developmentMap} boundaries={{ schedule() {}, call() {}, safety() {} }} />;
}
