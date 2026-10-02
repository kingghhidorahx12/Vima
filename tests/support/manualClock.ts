import type { FixtureClock } from '../../src/dev/passenger/gateway.ts';
export function manualClock() {
  let time = 0;
  const jobs = new Set<{ at: number; run: () => void }>();
  const clock: FixtureClock = {
    now: () => time, delay: async () => {},
    after(run, ms) { const job = { at: time + ms, run }; jobs.add(job); return () => { jobs.delete(job); }; },
  };
  return { clock, advance(ms: number) {
    const end = time + ms;
    for (;;) {
      const next = [...jobs].filter((job) => job.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      time = next.at; jobs.delete(next); next.run();
    }
    time = end;
  } };
}
