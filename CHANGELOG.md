# Changelog

## 1.0.0

- Quiet when you are watching: while the window is focused, turns shorter than 10 seconds
  no longer make a sound (`heyHuman.minTurnSeconds`).
- Spoken alerts: optionally says which project is waiting.
- New alert for Claude stopping on an error, with its own sound.
- Claude's multiple-choice questions now alert as "needs input".
- Informational notifications, such as signing in, no longer make a sound.
- No more double alert: the idle reminder Claude Code sends a minute after a turn ends is
  dropped when you were already alerted for that turn.
- Status bar menu: click the bell to mute, snooze, choose a sound, or open settings.
- The status bar highlights "Claude is waiting"; click it to jump to the waiting terminal.
- Snooze for 15 minutes to 2 hours, shared across every VS Code window.
- Optional desktop notification showing Claude's message (macOS and Linux).
- A setup guide opens on first run.
- The menu shows how many alerts you had today and how long Claude waited for you.
- Four new original sounds: ding, pop, rise and knock.
- Hooks are removed from `~/.claude/settings.json` automatically when the extension is
  uninstalled, and updated automatically when a new version changes them.

## 0.3.1

- Added the extension icon.

## 0.3.0

- First Marketplace release.
