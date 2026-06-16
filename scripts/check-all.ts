#!/usr/bin/env tsx
/**
 * 全面代码检查脚本
 *
 * 检查项目中的各类错误（排除 node_modules）：
 * 1. TypeScript 编译错误
 * 2. ESLint 代码规范错误
 * 3. 循环依赖错误
 * 4. 导入路径错误
 *
 * 使用方式：
 *   npx tsx scripts/check-all.ts
 *
 * 输出文件保存在执行目录下的 check-results/ 文件夹中
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 配置
const CONFIG = {
  // 输出目录（相对于执行目录）
  outputDir: 'check-results',
  // 要检查的源代码目录
  srcDirs: ['packages', 'apps'],
  // 忽略的目录
  ignoreDirs: ['node_modules', 'lib', 'dist', '.git'],
  // TypeScript 配置文件
  tsConfigPath: 'tsconfig.json',
  // 文件扩展名
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
};

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

interface CheckResult {
  name: string;
  passed: boolean;
  errorCount: number;
  warningCount: number;
  output: string;
  duration: number;
}

// 创建输出目录
function ensureOutputDir(): string {
  const outputPath = path.join(process.cwd(), CONFIG.outputDir);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  return outputPath;
}

// 获取时间戳
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// 打印带颜色的消息
function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

// 打印分隔线
function printSeparator(char: string = '─', length: number = 60): void {
  console.log(char.repeat(length));
}

// 执行命令并捕获输出
function runCommand(
  command: string,
  ignoreError: boolean = true,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    if (ignoreError) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
      };
    }
    throw error;
  }
}

// 过滤掉 node_modules 相关的错误
function filterNodeModulesErrors(output: string): string {
  const lines = output.split('\n');
  const filteredLines: string[] = [];

  for (const line of lines) {
    // 跳过包含 node_modules 路径的行
    if (line.includes('node_modules')) {
      continue;
    }
    filteredLines.push(line);
  }

  return filteredLines.join('\n').trim();
}

// 1. TypeScript 编译检查
function checkTypeScript(): CheckResult {
  log('\n📘 检查 TypeScript 编译错误...', colors.cyan);
  const startTime = Date.now();

  // 直接使用项目的 tsconfig.json，它已经包含了严格检查选项
  try {
    const { stdout, stderr } = runCommand(`npx tsc --project ${CONFIG.tsConfigPath} --noEmit 2>&1`);
    const rawOutput = stdout + stderr;

    // 过滤 node_modules 错误
    const filteredOutput = filterNodeModulesErrors(rawOutput);

    // 统计错误数 - 匹配 "error TS" 格式
    const errorMatches = filteredOutput.match(/error TS\d+/g) || [];
    const errorCount = errorMatches.length;

    // 也统计警告数 (未使用变量等在某些配置下可能是警告)
    const warningMatches = filteredOutput.match(/warning TS\d+/g) || [];
    const warningCount = warningMatches.length;

    const duration = Date.now() - startTime;

    return {
      name: 'TypeScript 编译检查',
      passed: errorCount === 0,
      errorCount,
      warningCount,
      output: filteredOutput || '✅ 没有 TypeScript 编译错误',
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return {
      name: 'TypeScript 编译检查',
      passed: false,
      errorCount: 1,
      warningCount: 0,
      output: `检查失败: ${error.message}`,
      duration,
    };
  }
}

// 2. ESLint 检查
function checkESLint(): CheckResult {
  log('\n📏 检查 ESLint 代码规范...', colors.cyan);
  const startTime = Date.now();

  const srcPaths = CONFIG.srcDirs.join(' ');
  const { stdout, stderr } = runCommand(
    `npx eslint ${srcPaths} --ext .ts,.tsx,.js,.jsx --format stylish --no-error-on-unmatched-pattern 2>&1`,
  );

  const rawOutput = stdout + stderr;
  const filteredOutput = filterNodeModulesErrors(rawOutput);

  // 检查是否有配置错误
  const hasConfigError = filteredOutput.includes("ESLint couldn't find a configuration file");
  if (hasConfigError) {
    const duration = Date.now() - startTime;
    return {
      name: 'ESLint 代码规范检查',
      passed: true,
      errorCount: 0,
      warningCount: 0,
      output: '⚠️  未找到 ESLint 配置文件，跳过检查',
      duration,
    };
  }

  // 解析错误和警告数量
  const summaryMatch = filteredOutput.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);
  let errorCount = 0;
  let warningCount = 0;

  if (summaryMatch) {
    errorCount = parseInt(summaryMatch[2], 10);
    warningCount = parseInt(summaryMatch[3], 10);
  }

  const duration = Date.now() - startTime;

  return {
    name: 'ESLint 代码规范检查',
    passed: errorCount === 0,
    errorCount,
    warningCount,
    output: filteredOutput || '✅ 没有 ESLint 错误',
    duration,
  };
}

// 3. 循环依赖检查
function checkCircularDependencies(): CheckResult {
  log('\n🔄 检查循环依赖...', colors.cyan);
  const startTime = Date.now();

  // 检查是否安装了 madge
  const { exitCode: madgeCheck } = runCommand('npx madge --version 2>&1');

  if (madgeCheck !== 0) {
    log('  ⚠️  madge 未安装，正在安装...', colors.yellow);
    runCommand('npm install --no-save madge 2>&1');
  }

  const srcPaths = CONFIG.srcDirs.join(' ');
  const { stdout, stderr } = runCommand(`npx madge --circular --extensions ts,tsx,js,jsx ${srcPaths} 2>&1`);

  const rawOutput = stdout + stderr;
  const filteredOutput = filterNodeModulesErrors(rawOutput);

  // 解析循环依赖
  const circularMatch = filteredOutput.match(/Found (\d+) circular/);
  const errorCount = circularMatch ? parseInt(circularMatch[1], 10) : 0;

  // 如果没有找到循环依赖的提示，但也没有错误，说明没有循环依赖
  const hasCircular = filteredOutput.includes('Circular') || filteredOutput.includes('circular');
  const hasError = filteredOutput.includes('Error:');
  const noCircularFound = filteredOutput.includes('No circular dependency found');
  const actualErrorCount = hasError ? 1 : hasCircular && !noCircularFound ? errorCount || 1 : 0;

  const duration = Date.now() - startTime;

  return {
    name: '循环依赖检查',
    passed: actualErrorCount === 0,
    errorCount: actualErrorCount,
    warningCount: 0,
    output: filteredOutput || '✅ 没有循环依赖',
    duration,
  };
}

// 4. 导入路径检查
function checkImports(): CheckResult {
  log('\n📦 检查导入路径...', colors.cyan);
  const startTime = Date.now();

  const errors: string[] = [];

  function walkDir(dir: string): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (!CONFIG.ignoreDirs.includes(file)) {
          walkDir(filePath);
        }
      } else if (CONFIG.extensions.some((ext) => file.endsWith(ext))) {
        checkFileImports(filePath, errors);
      }
    }
  }

  function checkFileImports(filePath: string, errors: string[]): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line: string, index: number) => {
      const lineNum = index + 1;

      // 检查 import 语句
      const importMatch = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
      const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);

      const modulePath = importMatch?.[1] || requireMatch?.[1];

      if (modulePath) {
        // 检查相对路径导入
        if (modulePath.startsWith('.')) {
          let resolvedPath = path.resolve(path.dirname(filePath), modulePath);

          // Strip .js/.jsx extension for TS projects (import './foo.js' resolves to './foo.ts')
          const ext = path.extname(resolvedPath);
          if (ext === '.js' || ext === '.jsx') {
            resolvedPath = resolvedPath.slice(0, -ext.length);
          }

          // 尝试解析实际文件
          const possiblePaths = [
            resolvedPath,
            `${resolvedPath}.ts`,
            `${resolvedPath}.tsx`,
            `${resolvedPath}.js`,
            `${resolvedPath}.jsx`,
            `${resolvedPath}/index.ts`,
            `${resolvedPath}/index.tsx`,
            `${resolvedPath}/index.js`,
            `${resolvedPath}/index.jsx`,
          ];

          const exists = possiblePaths.some((p) => fs.existsSync(p));

          if (!exists) {
            errors.push(`${filePath}:${lineNum}: 无法解析导入路径 '${modulePath}'`);
          }
        }
      }
    });
  }

  for (const srcDir of CONFIG.srcDirs) {
    if (fs.existsSync(srcDir)) {
      walkDir(srcDir);
    }
  }

  const duration = Date.now() - startTime;
  const output = errors.length > 0 ? errors.join('\n') : '✅ 没有导入路径错误';

  return {
    name: '导入路径检查',
    passed: errors.length === 0,
    errorCount: errors.length,
    warningCount: 0,
    output,
    duration,
  };
}

// 生成报告
function generateReport(results: CheckResult[], outputDir: string): string {
  const timestamp = getTimestamp();
  const reportFileName = `check-report-${timestamp}.txt`;
  const reportPath = path.join(outputDir, reportFileName);

  let report = '';
  report += '═'.repeat(70) + '\n';
  report += '                    代码检查报告\n';
  report += '═'.repeat(70) + '\n';
  report += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
  report += `项目目录: ${process.cwd()}\n`;
  report += '─'.repeat(70) + '\n\n';

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalDuration = 0;

  for (const result of results) {
    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
    totalDuration += result.duration;

    const status = result.passed ? '✅ 通过' : '❌ 失败';
    report += `\n${'━'.repeat(70)}\n`;
    report += `📋 ${result.name}\n`;
    report += `   状态: ${status}\n`;
    report += `   错误: ${result.errorCount}, 警告: ${result.warningCount}\n`;
    report += `   耗时: ${result.duration}ms\n`;
    report += `${'─'.repeat(70)}\n`;
    report += result.output + '\n';
  }

  report += '\n' + '═'.repeat(70) + '\n';
  report += '                        汇总\n';
  report += '═'.repeat(70) + '\n';
  report += `总错误数: ${totalErrors}\n`;
  report += `总警告数: ${totalWarnings}\n`;
  report += `总耗时: ${totalDuration}ms\n`;
  report += `检查结果: ${totalErrors === 0 ? '✅ 全部通过' : '❌ 存在错误'}\n`;
  report += '═'.repeat(70) + '\n';

  fs.writeFileSync(reportPath, report, 'utf-8');

  // 同时生成 JSON 格式的报告
  const jsonReportPath = path.join(outputDir, `check-report-${timestamp}.json`);
  const jsonReport = {
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    summary: {
      totalErrors,
      totalWarnings,
      totalDuration,
      passed: totalErrors === 0,
    },
    results: results.map((r) => ({
      name: r.name,
      passed: r.passed,
      errorCount: r.errorCount,
      warningCount: r.warningCount,
      duration: r.duration,
    })),
  };
  fs.writeFileSync(jsonReportPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  return reportPath;
}

// 主函数
async function main(): Promise<void> {
  console.clear();
  log('╔════════════════════════════════════════════════════════════════╗', colors.bold);
  log('║              🔍 全面代码检查工具 v1.0                          ║', colors.bold);
  log('║          排除 node_modules 中的所有外部错误                    ║', colors.bold);
  log('╚════════════════════════════════════════════════════════════════╝', colors.bold);

  const outputDir = ensureOutputDir();
  log(`\n📁 输出目录: ${outputDir}`, colors.blue);
  log(`📂 工作目录: ${process.cwd()}`, colors.blue);

  const results: CheckResult[] = [];

  // 执行所有检查
  printSeparator('─');

  // 1. TypeScript 编译检查
  results.push(checkTypeScript());

  // 2. ESLint 检查
  results.push(checkESLint());

  // 3. 循环依赖检查
  results.push(checkCircularDependencies());

  // 4. 导入路径检查
  results.push(checkImports());

  // 注意: 未使用导入/变量检查已合并到 TypeScript 编译检查中
  // tsconfig.json 中的 noUnusedLocals 和 noUnusedParameters 会处理这个

  // 生成报告
  printSeparator('═');
  const reportPath = generateReport(results, outputDir);

  // 打印汇总
  log('\n📊 检查结果汇总:', colors.bold);
  printSeparator('─');

  let hasErrors = false;
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? colors.green : colors.red;
    const info = `错误: ${result.errorCount}, 警告: ${result.warningCount}, 耗时: ${result.duration}ms`;
    log(`  ${icon} ${result.name}: ${info}`, color);

    if (!result.passed) {
      hasErrors = true;
    }
  }

  printSeparator('─');
  log(`\n📄 详细报告已保存至: ${reportPath}`, colors.cyan);

  // 最终结果
  if (hasErrors) {
    log('\n❌ 检查完成，发现错误，请查看报告了解详情', colors.red);
    process.exit(1);
  } else {
    log('\n✅ 检查完成，所有检查项均通过！', colors.green);
    process.exit(0);
  }
}

// 运行
main().catch((error) => {
  console.error('检查过程中发生错误:', error);
  process.exit(1);
});
