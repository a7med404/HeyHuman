## Let Claude Code tell Hey, Human when it needs you

Hey, Human listens through **hooks**: small commands Claude Code runs at certain moments.

Installing them adds three entries to `~/.claude/settings.json`:

- **Notification** - Claude needs permission or is waiting for your reply
- **Stop** - Claude finished its turn
- **UserPromptSubmit** - you sent a prompt (used to time how long Claude worked)

Your existing settings are kept, and a backup is saved as `settings.json.bak`.
The hooks only write a small file on your machine. Nothing is sent anywhere.
