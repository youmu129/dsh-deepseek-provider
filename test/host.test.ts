// host 半面行为校验：
// 1. Config 默认值：apiKeyEnv=DEEPSEEK_API_KEY、baseUrl=api.deepseek.com、
//    轮询默认关闭（与内置 deepseek 路由同一把钥匙，零新增配置）；
// 2. patch 只插入本插件自身挂载行，绝不目标 llm-pi-ai 行（本插件不播种
//    provider，多 bundle 覆盖问题的回归守卫同样适用）；
// 3. apply 等 loader settle 后再注册余额路由（挂载顺序回归守卫，同源缺陷：
//    dsh-plugin-raven v0.6.0 首版 pill 取数 404）；
// 4. 凭证缺失时 usage 路由返回 unconfigured 快照（不报错）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, apply, name } from '../src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

test('config defaults resolve to the built-in deepseek credential and endpoint', () => {
  const config = Config({})
  assert.equal(config.balance.apiKeyEnv, 'DEEPSEEK_API_KEY')
  assert.equal(config.balance.baseUrl, 'https://api.deepseek.com')
  assert.equal(config.balance.pollIntervalMs, 0)
  assert.equal(config.balance.requestTimeoutMs, 10000)
  assert.equal(name, 'dsh-deepseek-provider')
})

test('patch inserts own row and never targets the llm-pi-ai row', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes('- id: dsh-deepseek-provider'), 'patch 应插入 dsh-deepseek-provider 自身挂载行')
  assert.ok(!/^\s*-\s+id:\s*llm-pi-ai\s*$/m.test(patch),
    'patch 不得目标 llm-pi-ai 行（整行替换会覆盖其他 bundle 的 providers）')
})

test('apply defers balance API setup until loader settles (mount-order fix)', async () => {
  // 回归守卫（dsh-plugin-raven v0.6.0 首版缺陷）：apply 期 ctx.get('connection')
  // （strict）只返回 ACTIVE 实现，而 apply 时 connection 尚未挂载——立即取会
  // 拿到 undefined，路由不注册，pill 取数 404。正确行为：等 loader settle 再取。
  const routes: string[] = []
  let settled = false
  const connection = { fetch: { register: (r: { path: string }) => { routes.push(r.path); return () => {} } } }
  const mockCtx = {
    logger: { warn: () => {}, info: () => {} },
    loader: { await: async () => { settled = true } },
    get(name: string) {
      // 仅在 loader settle 后才提供 connection（模拟挂载顺序）
      return name === 'connection' && settled ? connection : undefined
    },
    interval: () => () => {},
    effect: () => {},
  }
  apply(mockCtx, resolvedConfig())
  assert.equal(settled, true, 'loader.await 已被消费')
  // 等待微任务链（loader.await().then(...)）落定
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.ok(routes.includes('/api/deepseek-balance/usage'), 'settle 后应注册 usage 路由')
  assert.ok(routes.includes('/api/deepseek-balance/refresh'), 'settle 后应注册 refresh 路由')
})

test('usage routes report unconfigured when the credential seam is absent', async () => {
  const handlers = new Map<string, () => Promise<Response>>()
  const connection = {
    fetch: { register: (r: { path: string; fetch: () => Promise<Response> }) => { handlers.set(r.path, r.fetch); return () => {} } },
  }
  let settled = false
  const mockCtx = {
    logger: { warn: () => {}, info: () => {} },
    loader: { await: async () => { settled = true } },
    get(name: string) {
      if (name === 'connection' && settled) return connection
      if (name === 'credentials') return undefined // 凭证服务缺失 → unconfigured
      return undefined
    },
    interval: () => () => {},
    effect: () => {},
  }
  apply(mockCtx, resolvedConfig())
  await new Promise((resolve) => setTimeout(resolve, 0))
  const handler = handlers.get('/api/deepseek-balance/usage')
  assert.ok(handler, 'usage 路由已注册')
  const res = await handler()
  const body = (await res.json()) as { snapshot: { status: string; balances: unknown[] } }
  assert.equal(body.snapshot.status, 'unconfigured')
  assert.deepEqual(body.snapshot.balances, [])
})

/** apply 收到的是 schema 解析后的完整 config，测试直接给等价形状 */
function resolvedConfig() {
  return {
    balance: {
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      baseUrl: 'https://api.deepseek.com',
      pollIntervalMs: 0,
      requestTimeoutMs: 1000,
    },
  }
}
