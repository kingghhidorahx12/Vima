import { RideShell, type RideShellProps } from '../trip/RideShell';

/** Keep this instance mounted for the entire passenger ride; phase is data. */
export function PassengerRideShell(props: RideShellProps) { return <RideShell {...props} />; }
