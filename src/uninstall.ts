// Runs once when the extension is uninstalled (the `vscode:uninstall` script), so no
// hooks are left behind in the user's Claude Code settings. Must not import `vscode`.
import { uninstallHooks } from './hooks-installer';

try {
  uninstallHooks();
} catch {
  // Nothing useful can be reported from here; the hooks are harmless if left behind.
}
