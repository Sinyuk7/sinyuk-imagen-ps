/**
 * 日志 schema 常量与辅助函数。
 */

import type { LogLevel, LogStatus, LogSurface, LogPackage, LogComponent } from './types.js';

/** 当前日志记录 schema 版本。 */
export const SCHEMA_VERSION = 1 as const;

/** 有效的 LogLevel 集合。 */
export const LOG_LEVELS: ReadonlySet<LogLevel> = new Set(['debug', 'info', 'warn', 'error']);

/** 有效的 LogStatus 集合。 */
export const LOG_STATUSES: ReadonlySet<LogStatus> = new Set(['start', 'ok', 'fail', 'retry']);

/** 有效的 LogSurface 集合。 */
export const LOG_SURFACES: ReadonlySet<LogSurface> = new Set(['cli', 'uxp', 'test', 'unknown']);

/** 有效的 LogPackage 集合。 */
export const LOG_PACKAGES: ReadonlySet<LogPackage> = new Set([
  'foundation',
  'application',
  'core-engine',
  'providers',
  'cli',
  'app',
]);

/** 有效的 LogComponent 集合。 */
export const LOG_COMPONENTS: ReadonlySet<LogComponent> = new Set([
  'runtime',
  'runner',
  'dispatch',
  'transport',
  'host',
  'sink',
  'session',
  'command',
  'provider',
]);

/** 判断 level 是否合法。 */
export function isLogLevel(level: string): level is LogLevel {
  return LOG_LEVELS.has(level as LogLevel);
}

/** 判断 status 是否合法。 */
export function isLogStatus(status: string): status is LogStatus {
  return LOG_STATUSES.has(status as LogStatus);
}

/** 判断 surface 是否合法。 */
export function isLogSurface(surface: string): surface is LogSurface {
  return LOG_SURFACES.has(surface as LogSurface);
}

/** 判断 package 是否合法。 */
export function isLogPackage(pkg: string): pkg is LogPackage {
  return LOG_PACKAGES.has(pkg as LogPackage);
}

/** 判断 component 是否合法。 */
export function isLogComponent(component: string): component is LogComponent {
  return LOG_COMPONENTS.has(component as LogComponent);
}
