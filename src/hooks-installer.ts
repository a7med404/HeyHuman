import * as fs from 'node:fs';
import * as path from 'node:path';
import { CLAUDE_SETTINGS_FILE, HOOK_EVENTS } from './config';

/** Trailing shell comment that identifies hooks owned by this extension. */
const MARKER = '# hey-human';
/** Marker used under the extension's previous name; still removed so no stale hooks linger. */
const LEGACY_MARKER = '# claude-is-waiting';

// Written to a temp name then renamed, so the watcher never sees a half-written file.
const HOOK_COMMAND =
  'd="$HOME/.claude/hey-human/events"; mkdir -p "$d"; f="$d/$(date +%s)-$$"; ' +
  `cat > "$f.tmp" && mv "$f.tmp" "$f.json" ${MARKER}`;

interface Hook {
  type?: string;
  command?: string;
}
interface HookGroup {
  matcher?: string;
  hooks?: Hook[];
}
interface ClaudeSettings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

function readSettings(): ClaudeSettings {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) return {};
  const text = fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf8');
  return text.trim() ? JSON.parse(text) : {};
}

function writeSettings(settings: ClaudeSettings): void {
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_FILE), { recursive: true });
  if (fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    fs.copyFileSync(CLAUDE_SETTINGS_FILE, `${CLAUDE_SETTINGS_FILE}.bak`);
  }
  fs.writeFileSync(CLAUDE_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
}

function isOurs(hook: Hook): boolean {
  return typeof hook?.command === 'string' && hook.command.includes(MARKER);
}

function isOursOrLegacy(hook: Hook): boolean {
  return isOurs(hook) || (typeof hook?.command === 'string' && hook.command.includes(LEGACY_MARKER));
}

/** Removes our hook from every event, dropping groups and events left empty. */
function stripOurHooks(settings: ClaudeSettings): void {
  if (!settings.hooks) return;
  for (const event of Object.keys(settings.hooks)) {
    const groups = (settings.hooks[event] ?? [])
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !isOursOrLegacy(h)) }))
      .filter((group) => group.hooks.length > 0);
    if (groups.length > 0) settings.hooks[event] = groups;
    else delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}

/** Adds our hooks to the user's Claude Code settings. Safe to run repeatedly. */
export function installHooks(): void {
  const settings = readSettings();
  stripOurHooks(settings);
  settings.hooks ??= {};
  for (const event of HOOK_EVENTS) {
    (settings.hooks[event] ??= []).push({ hooks: [{ type: 'command', command: HOOK_COMMAND }] });
  }
  writeSettings(settings);
}

/** Removes only this extension's hooks, leaving every other setting untouched. */
export function uninstallHooks(): void {
  const settings = readSettings();
  stripOurHooks(settings);
  writeSettings(settings);
}

export function hooksInstalled(): boolean {
  try {
    const hooks = readSettings().hooks ?? {};
    return HOOK_EVENTS.every((event) =>
      (hooks[event] ?? []).some((group) => (group.hooks ?? []).some(isOurs)),
    );
  } catch {
    return false;
  }
}
