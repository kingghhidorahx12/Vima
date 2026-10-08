import type { IncomingMessage } from 'node:http';
import { allowFields } from '../validation.ts';
import { MatchingError, type AuthConfig } from './auth.ts';
import type { MatchingCoordinator } from './coordinator.ts';
import type { Coordinate } from '../../src/map/models.ts';

export async function matchingHttp(request: IncomingMessage, path: string, auth: AuthConfig | undefined,
  matching: MatchingCoordinator | undefined, read: () => Promise<unknown>, signal: AbortSignal,
  reply: (status: number, value: unknown) => void): Promise<boolean> {
  if (!/^\/v1\/(matching\/|driver\/|passenger\/requests)/.test(path)) return false;
  if (!auth) throw new MatchingError(503, 'matching_unavailable');
  const principal = auth.authenticate(request.headers.authorization);
  if (path === '/v1/matching/session' && request.method === 'GET') {
    reply(200, { ...principal, matchingAvailable: !!matching }); return true;
  }
  if (!matching) throw new MatchingError(503, 'matching_unavailable');
  const url = new URL(path, 'http://localhost'); const method = request.method;
  const poll = () => {
    if ([...url.searchParams.keys()].length !== 1 || !/^\d{1,16}$/.test(url.searchParams.get('afterRevision') ?? '')) throw new MatchingError(400, 'invalid_matching_input');
    return Number(url.searchParams.get('afterRevision'));
  };
  if (method === 'GET' && url.pathname === '/v1/passenger/requests/active') {
    if (url.search) throw new MatchingError(400, 'invalid_matching_input');
    reply(200, await matching.activeRequest(principal)); return true;
  }
  const trip = /^\/v1\/passenger\/requests\/([A-Za-z0-9-]+)(?:\/(commands|changes))?$/.exec(url.pathname);
  if (method === 'GET' && trip?.[2] === 'changes') { reply(200, await matching.wait(principal, trip[1]!, poll(), signal)); return true; }
  if (method === 'GET' && url.pathname === '/v1/driver/changes') { reply(200, await matching.wait(principal, undefined, poll(), signal)); return true; }
  if (url.search) throw new MatchingError(400, 'invalid_matching_input');
  if (method === 'POST' && path === '/v1/passenger/requests') {
    const body = allowFields(await read(), ['quoteId', 'requestId']);
    reply(200, await matching.create(principal, body.quoteId as string, body.requestId as string)); return true;
  }
  if (trip && method === 'GET' && !trip[2]) { reply(200, await matching.fetch(principal, trip[1]!)); return true; }
  if (trip && method === 'POST' && trip[2] === 'commands') {
    const body = allowFields(await read(), ['tripId', 'commandId', 'name', 'payload']);
    if (body.tripId !== trip[1] || body.name !== 'cancel') throw new MatchingError(400, 'invalid_matching_input');
    const payload = allowFields(body.payload, ['reason']);
    reply(200, await matching.cancel(principal, trip[1]!, body.commandId as string, payload.reason as string)); return true;
  }
  if (method === 'GET' && path === '/v1/driver/state') { reply(200, await matching.driver(principal)); return true; }
  if (method === 'POST' && path === '/v1/driver/availability') {
    const body = allowFields(await read(), ['availability', 'operationId']);
    if (body.availability === 'AVAILABLE' || body.availability === 'OFFLINE') matching.traceDriverAction('driver_action_http_received', principal,
      body.operationId as string, { kind: body.availability === 'AVAILABLE' ? 'availability_available' : 'availability_offline' });
    reply(200, await matching.availability(principal, body.availability as 'AVAILABLE' | 'OFFLINE', body.operationId as string)); return true;
  }
  if (method === 'POST' && path === '/v1/driver/location') {
    const body = allowFields(await read(), ['coordinate', 'heading', 'operationId']);
    reply(200, await matching.location(principal, body.coordinate as Coordinate, body.heading as number | undefined, body.operationId as string)); return true;
  }
  const offer = /^\/v1\/driver\/offers\/([A-Za-z0-9-]+)\/(accept|reject)$/.exec(path);
  if (method === 'POST' && offer) {
    const body = allowFields(await read(), ['actionId']);
    matching.traceDriverAction('driver_action_http_received', principal, body.actionId as string,
      { kind: offer[2] === 'accept' ? 'offer_accept' : 'offer_reject', offerId: offer[1]! });
    reply(200, await matching.offerAction(principal, offer[1]!, offer[2] as 'accept' | 'reject', body.actionId as string)); return true;
  }
  const assignment = /^\/v1\/driver\/assignments\/([A-Za-z0-9-]+)\/cancel$/.exec(path);
  if (method === 'POST' && assignment) {
    const body = allowFields(await read(), ['actionId']);
    matching.traceDriverAction('driver_action_http_received', principal, body.actionId as string,
      { kind: 'assignment_cancel', requestId: assignment[1]! });
    reply(200, await matching.cancelAssignment(principal, assignment[1]!, body.actionId as string)); return true;
  }
  throw new MatchingError(404, 'matching_endpoint_not_found');
}
