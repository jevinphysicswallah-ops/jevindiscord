const { spawn } = require('node:child_process');

const commands = [
  { name: 'server', command: process.execPath, args: ['server.cjs'] },
  { name: 'client', command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'dev:client'] },
];

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    if (code && !process.exitCode) {
      console.error(`[${name}] exited with code ${code}`);
      process.exitCode = code;
      shutdown();
    }
  });
  return child;
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(process.exitCode || 0), 250).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
