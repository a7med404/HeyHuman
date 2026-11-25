# Hey, Human

VS Code extension that plays a sound when Claude Code needs input or finishes a turn.
Published to the Marketplace as `a7med404.hey-human`; source at `github.com/a7med404/HeyHuman`.

## How it fits together

Claude Code hooks installed into `~/.claude/settings.json` (the list is `INSTALLED_HOOKS`
in `src/constants.ts`) write their JSON payload to `~/.claude/hey-human/events/`. Each VS
Code window watches that folder; `src/decide.ts` decides whether to alert. See the README
for the module layout.

## Commands

- `npm run compile` builds `src/` to `out/` with `tsc`. There is no bundler.
- `npm test` compiles and runs the unit tests in `src/test/` with `node --test`.
- `npm run test:integration` runs `src/test/integration/suite.ts` inside a real VS Code
  with a scratch `HOME`. It opens a window and plays sounds quietly for about a minute.
- `npm run package` builds the `.vsix`.
- `npx vsce publish` publishes to the Marketplace. Only run it when asked.
- `npm run generate-sounds` regenerates the original `.wav` sounds.

Run both before publishing. The unit tests cover `decide.ts` and `hooks-installer.ts`; the
integration test covers everything that touches the VS Code API.

## Things that must stay in sync

- **Sound list:** a new file in `sounds/` must be added to both `enum` lists in
  `package.json` (`heyHuman.needsInputSound` and `heyHuman.finishedSound`).
- **Defaults:** the default sounds are set in `package.json` and repeated as fallbacks in
  `src/config.ts`. Change both.
- **Commands:** a command registered in `src/extension.ts` must also be listed under
  `contributes.commands` in `package.json`.
- **Version:** bump `version` in `package.json` and add a `CHANGELOG.md` entry together.
  The Marketplace rejects a version that was already published.

## Traps

- Never run the hook installer against the real `~/.claude/settings.json` while testing.
  Pass a scratch file path to its functions instead.
- `constants.ts`, `hooks-installer.ts`, `decide.ts` and `snooze.ts` must not import
  `vscode` at runtime: the uninstall script and the tests load them outside VS Code.
- Changing `HOOK_COMMAND` or `INSTALLED_HOOKS` makes every installed copy "outdated"; the
  extension then rewrites the user's hooks on next start. Do it deliberately.
- Hook payload fields and notification types come from the Claude Code hooks reference
  (`code.claude.com/docs/en/hooks`). Check it before relying on a new field.
- Hooks are identified by the trailing `# hey-human` comment in their command.
  `# claude-is-waiting` is the marker from the extension's old name; the installer still
  removes it, so keep that handling.
- The Marketplace icon must be a PNG. Render `images/icon.svg` with
  `qlmanage -t -s 1024`, then trim and resize to 256px with ImageMagick. ImageMagick's own
  SVG renderer drops the stroked sound-wave paths.
- `sounds/` and `out/` must ship in the package; `.vscodeignore` excludes the rest.
- Playback is per platform in `src/audio-player.ts`. Only macOS has been exercised.

## Git

Work is on `main`. Commit, push and publish only when asked.
