import { RideShell, type RideShellProps } from '../trip/RideShell';

/** Keep this instance mounted for the entire driver ride; phase is data. */
export function DriverRideShell(props: RideShellProps) { return <RideShell {...props} />; }
