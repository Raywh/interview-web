/**
 * Hono 环境类型与登录态读取。
 *
 * 约定（给 A3）：`api/src/auth/middleware.ts` 里的 requireAuth / requireAdmin
 * 必须是 `MiddlewareHandler<AppEnv>`，并通过 `c.set('user', user)` 注入 `User`。
 */
import type { Context } from 'hono';
import type { Env, User } from '../types';

/** 路由共用的 Hono 泛型：D1 绑定 + 登录用户变量 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user?: User;
  };
};

/** 读取当前登录用户；未登录返回 undefined（stub 阶段路由自行兜底 401） */
export function currentUser(c: Context<AppEnv>): User | undefined {
  return c.get('user');
}
