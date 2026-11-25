import * as fs from 'node:fs';
import * as path from 'node:path';
import { SNOOZE_FILE } from './constants';

// Kept in a file rather than extension state so every VS Code window sees the same snooze.

/** Epoch milliseconds until which sounds are snoozed; 0 when not snoozed. */
export function getSnoozedUntil(file = SNOOZE_FILE): number {
  try {
    const until = Number(fs.readFileSync(file, 'utf8'));
    return Number.isFinite(until) && until > Date.now() ? until : 0;
  } catch {
    return 0;
  }
}

export function setSnoozedUntil(until: number, file = SNOOZE_FILE): void {
  if (until <= 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(until));
}
