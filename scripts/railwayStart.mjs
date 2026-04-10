import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const roleHint = [
  process.env.APP_RUNTIME,
  process.env.RAILWAY_SERVICE_NAME,
  process.env.RAILWAY_REPLICA_ID,
]
  .filter(Boolean)
  .join(' ')
  .trim()
  .toLowerCase();

const role = roleHint.includes('worker') ? 'worker' : 'web';

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });

    child.on('error', reject);
  });
}

async function hasNextBuild() {
  const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');

  try {
    await access(buildIdPath);
    return true;
  } catch {
    return false;
  }
}

async function startWeb() {
  const port = process.env.PORT || '3000';

  await run('node', ['scripts/runMigrations.mjs']);
  await run('node', ['scripts/seedAdmin.mjs']);

  if (!(await hasNextBuild())) {
    await run('npm', ['run', 'build']);
  }

  await run('npx', ['next', 'start', '-H', '0.0.0.0', '-p', port]);
}

async function startWorker() {
  await run('npm', ['run', 'worker:ai-match']);
}

async function main() {
  if (role === 'worker') {
    await startWorker();
    return;
  }

  await startWeb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
