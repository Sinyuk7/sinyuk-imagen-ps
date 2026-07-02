/**
 * Release 测试共享 env 校验 helper。
 *
 * 合约：
 * - 仅供 *.release.test.* 文件使用。
 * - 真实测试入口必须先调用 assertReleaseMode() 确认 IMAGEN_TEST_LEVEL=release，
 *   缺失或非 release 值时立即抛错（不允许静默 skip）。
 * - requireReleaseEnv(names) 按声明校验必需凭证；缺失即抛错，错误信息只列变量名。
 * - 任何错误路径都不打印 secret value。
 */

const RELEASE_LEVEL = 'release' as const;

/**
 * 校验当前进程处于 Release 级别；否则立即抛错。
 * 双重开关 (2)：即便 vitest.release.config 被直接命中，进程内也必须确认该值。
 */
export function assertReleaseMode(): void {
  const level = process.env.IMAGEN_TEST_LEVEL;
  if (level !== RELEASE_LEVEL) {
    throw new Error(
      `Release test invoked outside release mode. Expected IMAGEN_TEST_LEVEL=${RELEASE_LEVEL}, got ${JSON.stringify(level)}.\n` +
        `Release tests only run via \`pnpm test:release\` / \`pnpm validate:release\`. They never run under \`pnpm test\`.`,
    );
  }
}

/**
 * 按声明校验必需 env 变量；缺失或空值即抛错，信息只列变量名。
 * @param names 必需的环境变量名
 */
export function requireReleaseEnv(names: readonly string[]): void {
  assertReleaseMode();
  const missing = names.filter((name) => !process.env[name] || process.env[name]!.length === 0);
  if (missing.length > 0) {
    throw new Error(
      `Release env incomplete for this test. Missing required variables (names only, values redacted):\n  - ${missing.join('\n  - ')}\n` +
        `Add them to the repo-root .test.env (gitignored). Never print or log these values.`,
    );
  }
}

/**
 * 读取一个 release env 变量；调用方需先 requireReleaseEnv 声明依赖。
 * 不做日志输出，避免泄漏。
 */
export function releaseEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`releaseEnv: ${name} is not set. Call requireReleaseEnv([.., '${name}', ..]) first.`);
  }
  return value;
}
