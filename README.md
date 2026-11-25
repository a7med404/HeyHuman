# Hey, Human

**Hear when Claude Code needs you.**

You hand Claude a task, switch to something else, and come back ten minutes later to find
it has been sitting on a permission prompt the whole time. Hey, Human plays a sound the
moment Claude Code asks for permission, waits for your reply, or finishes its turn.

## Features

- **Sounds for the moments that matter:** Claude needs your input (a permission prompt
  or a question), Claude finished its turn, and Claude stopped on an error. Each has its
  own sound; set any to `none`.
- **Quiet when you are watching:** quick replies you saw arrive do not make a sound.
  Step away and every turn alerts.
- **Spoken alerts (optional):** "Claude needs you in my-app", so you know which of
  several sessions is waiting.
- **No double alerts:** the reminder Claude Code sends a minute after a turn ends is
  dropped if you were already alerted.
- **Right window only:** with several VS Code windows open, only the one that owns the
  Claude session makes a sound.
- **Jump to the terminal:** the status bar lights up with "Claude is waiting"; click it
  to go to the terminal that needs you.
- **Snooze and mute:** from the bell in the status bar, shared across all windows.
- **Desktop notification (optional):** shows what Claude is asking, on macOS and Linux.
- **13 built-in sounds or your own:** clean chimes, meme clips, or any `.wav` / `.mp3`.
- **Works everywhere Claude Code runs:** the integrated terminal, an external terminal,
  and the Claude Code VS Code extension.
- **Leaves no trace:** hooks are removed when you uninstall.

## Quick start

1. Install the extension.
2. Follow the setup guide that opens and click **Install hooks**. This adds the hooks
   to `~/.claude/settings.json` and backs the file up first.
3. Start a new Claude Code session. Sessions that were already running need a restart.

Run **Hey, Human: Play Test Sound** from the Command Palette to check your audio.

## Commands

| Command | What it does |
| --- | --- |
| Hey, Human: Open Menu | The status bar menu: mute, snooze, sounds, settings |
| Hey, Human: Choose Sound... | Pick a sound per moment, with a preview as you move through the list |
| Hey, Human: Play Test Sound | Plays the "needs input" sound |
| Hey, Human: Toggle Mute | Turns all sounds off or on |
| Hey, Human: Snooze... / End Snooze | Silence every window for 15 minutes to 2 hours |
| Hey, Human: Install Claude Code Hooks | Adds the hooks (backs up `settings.json` to `settings.json.bak`) |
| Hey, Human: Remove Claude Code Hooks | Removes only this extension's hooks |
| Hey, Human: Open Setup Guide | Reopens the first-run walkthrough |
| Hey, Human: Show Log | Shows every alert and why any were skipped |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `heyHuman.enabled` | `true` | Master switch |
| `heyHuman.needsInputSound` | `faaah` | Sound for permission prompts and idle input waits |
| `heyHuman.finishedSound` | `faaah` | Sound when Claude finishes its turn |
| `heyHuman.errorSound` | `error` | Sound when Claude stops on an error such as a rate limit |
| `heyHuman.customSoundPath` | `""` | `.wav` or `.mp3` used by any sound set to `custom` |
| `heyHuman.volume` | `70` | 0-100 |
| `heyHuman.spokenAlerts` | `false` | After the sound, say which project is waiting |
| `heyHuman.minTurnSeconds` | `10` | While the window is focused, stay quiet for turns shorter than this; `0` alerts every time |
| `heyHuman.desktopNotification` | `false` | Also show a desktop notification when the window is not focused |
| `heyHuman.onlyWhenUnfocused` | `false` | Stay silent while the window is focused |
| `heyHuman.matchWorkspace` | `true` | Only alert in the window that owns the session's directory |
| `heyHuman.cooldownMs` | `1500` | Minimum gap between sounds |

Built-in sounds: `faaah`, `chime`, `ding`, `pop`, `rise`, `knock`, `vine-boom`, `error`,
`heknew`, `brother-ewwwwwww`, `chicken-on-tree-screaming`, `emotional-damage-meme`,
`oh-shit-not-good`.

## How it works

The extension adds hooks to your Claude Code settings: `Notification`, `Stop`,
`StopFailure`, `UserPromptSubmit`, and `PreToolUse` for Claude's questions only. Each hook
writes its event to `~/.claude/hey-human/events/`. Every VS Code window watches that folder
and decides whether the event is its own. Nothing leaves your machine.

### Use it from other tools

Any script or tool can raise an alert by writing a JSON file into that folder:

```sh
d="$HOME/.claude/hey-human/events"; mkdir -p "$d"
f="$d/$(date +%s)-$$-$PPID"
echo '{"hook_event_name":"Stop","cwd":"'"$PWD"'"}' > "$f.tmp" && mv "$f.tmp" "$f.json"
```

Use `Notification`, `Stop` or `StopFailure` as the event name.

## Troubleshooting

- **No sound at all:** run **Play Test Sound**. If that is silent, check the system volume
  and **Show Log**.
- **Quick replies are silent:** that is the `heyHuman.minTurnSeconds` filter. It only
  applies while the window is focused; set it to `0` to alert every time.
- **Test sound works, Claude is silent:** restart the Claude Code session, and check the
  status bar. A warning icon means the hooks are not installed.
- **Sound plays in the wrong window, or not at all:** the session's directory must be
  inside the window's open folder. Turn off `heyHuman.matchWorkspace` to alert everywhere.
- **Remote SSH, WSL and dev containers:** not supported yet. Hooks and sound must be on
  the same machine.
- **Linux:** needs one of `ffplay`, `paplay`, `mpg123` or `aplay`; `notify-send` for
  desktop notifications; `spd-say` or `espeak` for spoken alerts.
- **Windows:** the hooks need Git Bash, which Claude Code already uses.

## Development

```sh
npm install
npm test          # compile and run the unit tests
npm run package   # build the .vsix
```

| Path | Role |
| --- | --- |
| `src/extension.ts` | Activation, commands, status bar |
| `src/decide.ts` | Pure "should this window alert?" logic |
| `src/hooks-installer.ts` | Adds and removes the hooks in `~/.claude/settings.json` |
| `src/event-watcher.ts` | Watches the events folder and reports each event once |
| `src/audio-player.ts` | Resolves a sound name to a file and plays it per platform |
| `src/notifier.ts` | Desktop notifications |
| `src/speech.ts` | Spoken alerts |
| `src/terminal-finder.ts` | Finds the terminal a session runs in |
| `src/stats.ts` | Daily alert and wait-time counters |
| `src/snooze.ts` | Snooze state shared between windows |
| `src/uninstall.ts` | Removes the hooks when the extension is uninstalled |
| `scripts/generate-sounds.js` | Regenerates the original `.wav` sounds |

Hey, Human is an independent project and is not affiliated with Anthropic.

## License

MIT
