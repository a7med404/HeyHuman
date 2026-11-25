import type { Memento } from 'vscode';

const KEY = 'dailyStats';

export interface DailyStats {
  /** Local date as YYYY-MM-DD; the counters reset when it changes. */
  day: string;
  alerts: number;
  /** Total time between an alert and the user coming back to the window. */
  waitedMs: number;
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function getStats(store: Memento): DailyStats {
  const saved = store.get<DailyStats>(KEY);
  return saved?.day === today() ? saved : { day: today(), alerts: 0, waitedMs: 0 };
}

export function recordAlert(store: Memento): Thenable<void> {
  const stats = getStats(store);
  return store.update(KEY, { ...stats, alerts: stats.alerts + 1 });
}

export function recordWait(store: Memento, waitedMs: number): Thenable<void> {
  const stats = getStats(store);
  return store.update(KEY, { ...stats, waitedMs: stats.waitedMs + Math.max(0, waitedMs) });
}

export function describeStats(stats: DailyStats): string {
  if (stats.alerts === 0) return 'No alerts yet today';
  const alerts = `${stats.alerts} alert${stats.alerts === 1 ? '' : 's'} today`;
  const minutes = Math.round(stats.waitedMs / 60_000);
  if (minutes < 1) return alerts;
  return `${alerts}, Claude waited ${minutes} min for you`;
}
