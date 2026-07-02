/**
 * Release vitest globalSetup —— 在任何 release 测试运行前再次校验 Release 级别。
 * 防止有人直接 `vitest --config vitest.release.config.ts` 而绕过 release runner。
 */
export default function setup(): void {
  const level = process.env.IMAGEN_TEST_LEVEL;
  if (level !== 'release') {
    throw new Error(
      `vitest.release.config invoked outside release mode (IMAGEN_TEST_LEVEL=${JSON.stringify(level)}).\n` +
        `Run release tests only via \`pnpm test:release\` / \`pnpm validate:release\`. They never run under \`pnpm test\`.`,
    );
  }
}
