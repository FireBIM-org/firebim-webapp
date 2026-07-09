import { spawn } from 'node:child_process';

const commands = [
  {
    label: 'pnpm lint',
    command: process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
    args: ['pnpm', 'lint'],
  },
  {
    label: 'tsc --noEmit',
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsc', '--noEmit'],
  },
  {
    label: 'next build',
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['next', 'build'],
    env: {
      CI: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
];

function runStep({ label, command, args, env = {} }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`\n=== ${label} ===`);

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ...env,
      },
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      const durationMs = Date.now() - startedAt;
      const durationSeconds = (durationMs / 1000).toFixed(1);

      if (code === 0) {
        console.log(`=== ${label} completed in ${durationSeconds}s ===`);
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${label} failed with ${reason} after ${durationSeconds}s`));
    });
  });
}

for (const step of commands) {
  await runStep(step);
}

console.log('\nLocal CI checks passed.');
