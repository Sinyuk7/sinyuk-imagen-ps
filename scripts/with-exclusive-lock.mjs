#!/usr/bin/env node

import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const LOCK_ENV = 'IMAGEN_HEAVY_TASK_LOCKS';
const SIGNAL_EXIT_CODE = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

function usage() {
  console.error('Usage: node scripts/with-exclusive-lock.mjs --lock <name> --label <label> -- <command> [args...]');
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  if (separatorIndex === -1) {
    usage();
    process.exit(1);
  }

  const options = {
    label: undefined,
    lockName: undefined,
    command: argv.slice(separatorIndex + 1),
  };

  const flags = argv.slice(0, separatorIndex);
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--lock') {
      options.lockName = flags[index + 1];
      index += 1;
      continue;
    }
    if (flag === '--label') {
      options.label = flags[index + 1];
      index += 1;
      continue;
    }
    console.error(`Unknown option: ${flag}`);
    usage();
    process.exit(1);
  }

  if (!options.lockName || !options.label || options.command.length === 0) {
    usage();
    process.exit(1);
  }

  return options;
}

function repoRootFromScript() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  return resolve(scriptDir, '..');
}

function repoHash(repoRoot) {
  return createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
}

function lockId(repoRoot, lockName) {
  return `${repoHash(repoRoot)}:${lockName}`;
}

function sanitizeLockName(lockName) {
  return lockName.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function lockFilePath(repoRoot, lockName) {
  return join(tmpdir(), 'imagen-ps-task-locks', repoHash(repoRoot), `${sanitizeLockName(lockName)}.json`);
}

function parseInheritedLocks(rawValue) {
  if (!rawValue) {
    return new Set();
  }
  return new Set(rawValue.split(',').map((value) => value.trim()).filter(Boolean));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readLockMetadata(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeLockMetadata(fd, metadata) {
  writeFileSync(fd, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function formatBlockingMessage(requestedLabel, lockPath, metadata) {
  const lines = [
    `Blocked \`${requestedLabel}\`: another repository-wide build/test/validate task is already running.`,
    '',
  ];

  if (metadata) {
    lines.push(`Active task: ${metadata.label ?? 'unknown'}`);
    lines.push(`PID: ${metadata.pid ?? 'unknown'}`);
    lines.push(`Started: ${metadata.acquiredAt ?? 'unknown'}`);
    lines.push(`Working dir: ${metadata.cwd ?? 'unknown'}`);
  } else {
    lines.push('Active task metadata could not be read.');
  }

  lines.push(`Lock file: ${lockPath}`);
  lines.push('Wait for it to finish, or stop that PID before retrying.');

  return lines.join('\n');
}

function acquireLock(repoRoot, lockName, label) {
  const path = lockFilePath(repoRoot, lockName);
  mkdirSync(dirname(path), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    const metadata = {
      token,
      lockName,
      label,
      pid: process.pid,
      ppid: process.ppid,
      cwd: process.cwd(),
      repoRoot,
      acquiredAt: new Date().toISOString(),
      command: process.argv.slice(2),
    };

    try {
      const fd = openSync(path, 'wx', 0o600);
      try {
        writeLockMetadata(fd, metadata);
      } finally {
        closeSync(fd);
      }
      return { path, token };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      const existing = readLockMetadata(path);
      if (existing && isProcessAlive(existing.pid)) {
        console.error(formatBlockingMessage(label, path, existing));
        process.exit(1);
      }

      rmSync(path, { force: true });
    }
  }

  console.error(`Failed to acquire lock for \`${label}\` after removing a stale lock. Please retry.`);
  process.exit(1);
}

function releaseLock(lockState) {
  if (!lockState?.path || !lockState?.token) {
    return;
  }

  const metadata = readLockMetadata(lockState.path);
  if (metadata?.token === lockState.token) {
    rmSync(lockState.path, { force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = repoRootFromScript();
  const currentLockId = lockId(repoRoot, options.lockName);
  const inheritedLocks = parseInheritedLocks(process.env[LOCK_ENV]);
  const env = { ...process.env };

  if (!inheritedLocks.has(currentLockId)) {
    const lockState = acquireLock(repoRoot, options.lockName, options.label);
    inheritedLocks.add(currentLockId);
    env[LOCK_ENV] = Array.from(inheritedLocks).join(',');

    let released = false;
    const cleanup = () => {
      if (released) {
        return;
      }
      released = true;
      releaseLock(lockState);
    };

    process.on('exit', cleanup);
    process.on('uncaughtException', (error) => {
      cleanup();
      throw error;
    });
    process.on('unhandledRejection', (error) => {
      cleanup();
      throw error;
    });

    const child = spawn(options.command[0], options.command.slice(1), {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    let exitingFromSignal = false;
    for (const signal of Object.keys(SIGNAL_EXIT_CODE)) {
      process.on(signal, () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill(signal);
          exitingFromSignal = true;
          return;
        }
        cleanup();
        process.exit(SIGNAL_EXIT_CODE[signal]);
      });
    }

    child.on('exit', (code, signal) => {
      cleanup();
      if (signal) {
        process.exit(SIGNAL_EXIT_CODE[signal] ?? (exitingFromSignal ? 1 : 0));
      }
      process.exit(code ?? 1);
    });

    child.on('error', (error) => {
      cleanup();
      console.error(`Failed to start command for \`${options.label}\`: ${error.message}`);
      process.exit(1);
    });

    return;
  }

  const child = spawn(options.command[0], options.command.slice(1), {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(SIGNAL_EXIT_CODE[signal] ?? 1);
    }
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`Failed to start nested command for \`${options.label}\`: ${error.message}`);
    process.exit(1);
  });
}

main();
