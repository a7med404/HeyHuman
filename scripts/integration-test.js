// Launches a real VS Code with the extension loaded and runs out/test/integration/suite.js
// inside it. HOME is a scratch directory so the real ~/.claude/settings.json is never touched.
// Run with `npm run test:integration`. Sounds play quietly while it runs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

const root = path.join(__dirname, '..');
const installed = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hey-human-it-'));
  const workspace = path.join(home, 'my-project');
  fs.mkdirSync(workspace, { recursive: true });

  // Pre-install the hooks: the extension's own install command asks through a modal
  // dialog, which a test cannot click.
  const settingsFile = path.join(home, '.claude', 'settings.json');
  require(path.join(root, 'out', 'hooks-installer.js')).installHooks(settingsFile);

  await runTests({
    // Use the installed VS Code when there is one; otherwise test-electron downloads it.
    vscodeExecutablePath: process.platform === 'darwin' && fs.existsSync(installed) ? installed : undefined,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'out', 'test', 'integration', 'suite.js'),
    extensionTestsEnv: { HOME: home },
    launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust'],
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
