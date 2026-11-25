import * as fs from 'node:fs';
import * as path from 'node:path';
import { CLAUDE_SETTINGS_FILE, INSTALLED_HOOKS } from './constants';

// This module must not import `vscode`: it is also used by the uninstall script and the tests.

/** Trailing shell comment that identifies hooks owned by this extension. */
const MARKER = '# hey-human';
/** Marker used under the extension's previous name; still removed so no stale hooks linger. */
const LEGACY_MARKER = '# claude-is-waiting';

// Written to a temp name then renamed, so the watcher never sees a half-written file.
// The file name ends with $PPID, the Claude Code process, so the extension can find the
// terminal that session runs in.
const HOOK_COMMAND =
  'd="$HOME/.claude/hey-human/events"; mkdir -p "$d"; f="$d/$(date +%s)-$$-$PPID"; ' +
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

function readSettings(file: string): ClaudeSettings {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  return text.trim() ? JSON.parse(text) : {};
}

function writeSettings(file: string, settings: ClaudeSettings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
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
export function installHooks(file = CLAUDE_SETTINGS_FILE): void {
  const settings = readSettings(file);
  stripOurHooks(settings);
  settings.hooks ??= {};
  for (const { event, matcher } of INSTALLED_HOOKS) {
    (settings.hooks[event] ??= []).push({
      ...(matcher ? { matcher } : {}),
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });
  }
  writeSettings(file, settings);
}

/** Removes only this extension's hooks, leaving every other setting untouched. */
export function uninstallHooks(file = CLAUDE_SETTINGS_FILE): void {
  if (!fs.existsSync(file)) return;
  const settings = readSettings(file);
  stripOurHooks(settings);
  writeSettings(file, settings);
}

function ourHooks(file: string, event: string): Hook[] {
  const hooks = readSettings(file).hooks ?? {};
  return (hooks[event] ?? []).flatMap((group) => (group.hooks ?? []).filter(isOurs));
}

/** True when every hook is present and matches the command this version installs. */
export function hooksInstalled(file = CLAUDE_SETTINGS_FILE): boolean {
  try {
    return INSTALLED_HOOKS.every(({ event }) =>
      ourHooks(file, event).some((hook) => hook.command === HOOK_COMMAND),
    );
  } catch {
    return false;
  }
}

/** True when an earlier version's hooks are present and need replacing with the current ones. */
export function hooksOutdated(file = CLAUDE_SETTINGS_FILE): boolean {
  try {
    const settings = readSettings(file);
    const any = Object.values(settings.hooks ?? {}).some((groups) =>
      (groups ?? []).some((group) => (group.hooks ?? []).some(isOursOrLegacy)),
    );
    return any && !hooksInstalled(file);
  } catch {
    return false;
  }
}
