import * as fs from 'node:fs';
import * as path from 'node:path';
import { EVENTS_DIR, HookPayload } from './constants';
import { Logger } from './logger';

const MAX_EVENT_AGE_MS = 60_000;

/**
 * Watches the folder the Claude Code hooks write into and reports each new event once.
 * Event files are left in place for a minute so every VS Code window can read them.
 */
export class EventWatcher {
  private watcher: fs.FSWatcher | undefined;
  private readonly seen = new Set<string>();

  constructor(private readonly onEvent: (payload: HookPayload) => void) {}

  start(): void {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    // Ignore events that were written before this window started.
    for (const name of fs.readdirSync(EVENTS_DIR)) this.seen.add(name);

    this.watcher = fs.watch(EVENTS_DIR, (_type, name) => {
      if (name) this.handle(name.toString());
      this.prune();
    });
    Logger.info(`Watching ${EVENTS_DIR}`);
  }

  dispose(): void {
    this.watcher?.close();
  }

  private handle(name: string): void {
    if (!name.endsWith('.json') || this.seen.has(name)) return;
    this.seen.add(name);
    if (this.seen.size > 500) this.seen.clear();

    let payload: HookPayload = {};
    try {
      payload = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, name), 'utf8'));
    } catch {
      // Already pruned by another window, or not valid JSON: nothing to act on.
      return;
    }
    // File names are <seconds>-<hook pid>-<claude pid>.json.
    const claudePid = Number(/^\d+-\d+-(\d+)\.json$/.exec(name)?.[1]);
    if (Number.isInteger(claudePid) && claudePid > 1) payload.claudePid = claudePid;
    this.onEvent(payload);
  }

  private prune(): void {
    const now = Date.now();
    let names: string[];
    try {
      names = fs.readdirSync(EVENTS_DIR);
    } catch {
      return;
    }
    for (const name of names) {
      const file = path.join(EVENTS_DIR, name);
      try {
        if (now - fs.statSync(file).mtimeMs > MAX_EVENT_AGE_MS) fs.unlinkSync(file);
      } catch {
        // Another window removed it first.
      }
    }
  }
}
