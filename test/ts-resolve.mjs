/**
 * Node ESM 解析钩子（只给测试用，不进 Worker bundle）。
 *
 * 仓库里 API 源码用的是「无扩展名」相对导入（tsconfig moduleResolution = Bundler，
 * 由 wrangler/esbuild 打包时解析）。Node 直接跑 .ts 时只会按 ESM 规则解析，
 * 找不到 `../lib/response` 这种写法，这里补一条回退：
 *   相对路径解析失败 → 依次尝试 `<path>.ts`、`<path>/index.ts`
 *
 * 用法见 test/auth.test.ts 顶部的 register()。
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUFFIXES = ['.ts', '/index.ts'];

function isRelative(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!isRelative(specifier) || err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;

    for (const suffix of SUFFIXES) {
      const candidate = `${specifier}${suffix}`;
      try {
        const url = new URL(candidate, context.parentURL);
        if (existsSync(fileURLToPath(url))) return await nextResolve(candidate, context);
      } catch {
        // 换下一个后缀继续试
      }
    }
    throw err;
  }
}
