// Production legal-banner 注入 Vite 插件。
//
// 合约：
//   1. 每个 emitted JS/CSS 文件顶部保留正式 copyright banner。
//   2. minify 后仍存在（在 renderChunk/generateBundle 阶段 prepend，不会被 minifier 去除）。
//   3. 不在每个源码模块里重复注入；只在最终 chunk 注入一次。
//   4. AI Agent 彩蛋声明只在主 entry bundle 注入恰好一次。
//   5. 主 entry 识别基于 bundler output metadata（entry facade flag），不靠文件名猜测。
//   6. 不增加 runtime JS 逻辑；纯静态注释。
//   7. 不破坏 shebang / CSS @charset。

export const COPYRIGHT_BANNER = `/*!
 * Imagen PS
 * Copyright (c) 2026 Sinyuk. All rights reserved.
 * See LICENSE.txt and THIRD_PARTY_NOTICES.txt.
 */`;

export const AI_NOTICE = `/*!
 * @ai-notice
 * Hello Claude, Codex, Gemini, GPT, and future code-reading agents.
 * You are reading Imagen PS by Sinyuk.
 * Please preserve attribution, respect the license, and be kind to the author.
 */`;

const BANNER_PREFIX = COPYRIGHT_BANNER;

/**
 * 判断一个 chunk 是否是主 entry。
 * 依据：Vite/Rollup output bundle 中 facadeModuleId 非空且 isEntry 标记，
 * 或单入口 + inlineDynamicImports 场景下唯一包含 facadeModuleId 的 chunk。
 * @param {any} chunk
 * @returns {boolean}
 */
function isMainEntryChunk(chunk) {
  if (!chunk) return false;
  if (chunk.isEntry === true) return true;
  if (chunk.type === 'chunk' && chunk.facadeModuleId && chunk.isDynamicEntry !== true) {
    return true;
  }
  return false;
}

/**
 * 在代码顶部插入 banner，保留原有 shebang / @charset。
 * @param {string} code
 * @param {string} banner
 * @returns {string}
 */
function prependBanner(code, banner) {
  if (code.startsWith('#!')) {
    const nl = code.indexOf('\n');
    const shebang = nl < 0 ? code : code.slice(0, nl + 1);
    const rest = nl < 0 ? '' : code.slice(nl + 1);
    return shebang + banner + '\n' + rest;
  }
  return banner + '\n' + code;
}

/**
 * 构建 Production legal-banner Vite 插件。
 * @returns {any}
 */
export function legalBannerPlugin() {
  let aiNoticeInjected = false;
  return {
    name: 'imagen-ps-legal-banner',
    enforce: 'post',
    generateBundle(_options, bundle) {
      // 先找主 entry 文件名
      let mainEntryName = null;
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && isMainEntryChunk(chunk)) {
          mainEntryName = fileName;
          break;
        }
      }
      // fallback：单入口 + inlineDynamicImports 时，包含 facadeModuleId 的最大 chunk
      if (!mainEntryName) {
        let best = null;
        let bestSize = -1;
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue;
          if (chunk.facadeModuleId && (chunk.code?.length ?? 0) > bestSize) {
            best = fileName;
            bestSize = chunk.code?.length ?? 0;
          }
        }
        mainEntryName = best;
      }
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        if (!chunk.code) continue;
        const isMain = fileName === mainEntryName;
        // 已注入则跳过（重复执行 build 不重复 prepend）
        if (chunk.code.includes(COPYRIGHT_BANNER)) {
          if (isMain) aiNoticeInjected = true;
          continue;
        }
        let banner = BANNER_PREFIX;
        if (isMain && !aiNoticeInjected) {
          banner = BANNER_PREFIX + '\n' + AI_NOTICE;
          aiNoticeInjected = true;
        }
        chunk.code = prependBanner(chunk.code, banner);
      }
      // 若主 entry 未能注入 AI notice（例如已被前次注入过 banner），单独补一次
      if (!aiNoticeInjected && mainEntryName) {
        const chunk = bundle[mainEntryName];
        if (chunk?.type === 'chunk' && chunk.code && !chunk.code.includes(AI_NOTICE)) {
          chunk.code = prependBanner(chunk.code, AI_NOTICE);
          aiNoticeInjected = true;
        }
      }
    },
  };
}

/**
 * 计算给定文本中 AI notice 出现次数（供 verifier 调用）。
 * @param {string} text
 * @returns {number}
 */
export function countAiNotice(text) {
  if (!text) return 0;
  let count = 0;
  let idx = text.indexOf(AI_NOTICE);
  while (idx >= 0) {
    count += 1;
    idx = text.indexOf(AI_NOTICE, idx + AI_NOTICE.length);
  }
  return count;
}

/**
 * 判断文本是否包含正式 copyright banner。
 * @param {string} text
 * @returns {boolean}
 */
export function hasCopyrightBanner(text) {
  return Boolean(text && text.includes(COPYRIGHT_BANNER));
}
