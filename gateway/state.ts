import { randomUUID } from 'node:crypto';
import { GeospatialError, type ResolvedPlace } from '../src/services/geospatial/contracts.ts';
import type { GatewayConfig } from './config.ts';

export interface PlaceReference { type: 'addresses' | 'streets' | 'intersections' | 'pois' | 'areas'; id: string }
export interface SearchSession {
  id: string; createdAt: number; lastActivity: number;
  choices: Map<string, PlaceReference | ResolvedPlace>;
}
export function createGatewayState(config: GatewayConfig, now = Date.now) {
  const sessions = new Map<string, SearchSession>();
  const rates = new Map<string, { count: number; starts: number }>();
  const cleanup = () => {
    for (const [id, session] of sessions) if (now() - session.lastActivity >= config.sessionTtlMs) sessions.delete(id);
    for (const [id, rate] of rates) if (now() - rate.starts >= config.rateWindowMs) rates.delete(id);
  };
  return {
    cleanup,
    create() {
      cleanup();
      if (sessions.size >= config.maxSessions) throw new GeospatialError('network_recoverable');
      const session: SearchSession = { id: randomUUID(), createdAt: now(), lastActivity: now(), choices: new Map() };
      sessions.set(session.id, session); return session;
    },
    get(id: string) {
      cleanup(); const session = sessions.get(id);
      if (!session) throw new GeospatialError('no_result');
      session.lastActivity = now(); return session;
    },
    close(id: string) { sessions.delete(id); },
    allow(client: string) {
      cleanup(); let rate = rates.get(client);
      if (!rate) {
        if (rates.size >= config.maxRateClients) return false;
        rate = { count: 0, starts: now() }; rates.set(client, rate);
      }
      rate.count += 1; return rate.count <= config.rateLimit;
    },
  };
}
