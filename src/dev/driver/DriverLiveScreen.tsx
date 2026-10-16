import { LiveAccountGate } from '../LiveAccountGate';
import { DriverSurface } from '../../features/driver/DriverOperationalSurface';

export default function DriverLiveScreen() {
  return <LiveAccountGate role="driver">{session => <DriverSurface key={session.identity.accountId}
    client={session.matching} accountId={session.identity.accountId} available={session.identity.matchingAvailable} />}</LiveAccountGate>;
}
