// host 半面入口：DeepSeek 账号余额 API。
//
// 本插件不播种 provider：DSH 的 llm-pi-ai 目录已内置 deepseek 路由（Models
// 页可管理，凭证引用 DEEPSEEK_API_KEY），无需也无权重复注册。cordis.patch.yml
// 只插入本插件自身的挂载行，宿主半面单一职责：启动、全部条目挂载 settle 后
// 注册 /api/deepseek-balance/* 同源路由，经 DSH 凭证机制按 apiKeyEnv 现解析
// DeepSeek API Key（每次刷新现读，热轮换友好；未配置 → unconfigured 快照），
// 直连 GET {baseUrl}/user/balance，归一化为统一余额模型缓存在内存，供给
// client 半面的底部余额 pill。
//
// connection 为可选取用：组合缺 connection 时跳过路由注册（pill 侧呈现
// 路由请求失败态，不阻断启动）。

import z from '@deepseek-ai/schemastery'
import { AdapterUnconfiguredError } from './model.ts'
import { DEEPSEEK_DEFAULT_BASE_URL, fetchDeepseekBalance } from './deepseek.ts'
import { BalanceStore } from './store.ts'

// ---------------------------------------------------------------------------
// Config（balance 子树；行 config 经 cordis.patch.yml 传入）
// ---------------------------------------------------------------------------

const BalanceSettings = z.object({
  // 凭证引用名（值只经 DSH 凭证机制；默认与内置 deepseek 路由同一把钥匙，零新增配置）
  apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
  baseUrl: z.string().default(DEEPSEEK_DEFAULT_BASE_URL),
  pollIntervalMs: z.number().default(0),
  requestTimeoutMs: z.number().default(10000),
})

export const Config = z.object({
  balance: BalanceSettings.default({}),
})

export type PluginConfig = z.infer<typeof Config>

export const name = 'dsh-deepseek-provider'

export function apply(ctx: any, config: PluginConfig): void {
  // 与 dsh-zhipu-provider 相同的 settle 等待：apply 期 connection 服务尚未
  // ACTIVE，ctx.get（strict）只返回 ACTIVE 实现，立即取会拿到 undefined 而
  // 误判缺组合（dsh-plugin-raven v0.6.0 首版即此缺陷：路由未注册，pill 取数 404）。
  void ctx.loader.await().then(() => setupBalanceApi(ctx, config)).catch(reportBalanceApi)

  function reportBalanceApi(error: unknown): void {
    // 余额 API 失败不阻断启动，pill 侧会呈现查询失败态
    ctx.logger.warn('dsh-deepseek-provider: 余额 API 初始化失败')
    ctx.logger.warn(error)
  }
}

// ---------------------------------------------------------------------------
// 余额 API：/api/deepseek-balance/usage | /api/deepseek-balance/refresh
// ---------------------------------------------------------------------------

function setupBalanceApi(ctx: any, config: PluginConfig): void {
  // 本函数在 loader settle 后调用：此时组合里要挂载的条目均已 ACTIVE，
  // ctx.get('connection') 能真实反映组合是否含 Web connection 服务。
  const connection = ctx.get('connection')
  if (connection === undefined) {
    ctx.logger.warn('dsh-deepseek-provider: connection 服务不可用，跳过余额 API（需要 Web 组合）')
    return
  }

  try {
    registerBalanceRoutes(ctx, config, connection)
  } catch (error) {
    // 路由注册失败（如 live reload 重挂载冲突）只告警，不影响其他功能
    ctx.logger.warn('dsh-deepseek-provider: 余额路由注册失败')
    ctx.logger.warn(error)
  }
}

function registerBalanceRoutes(ctx: any, config: PluginConfig, connection: any): void {
  // 每次刷新现 resolve 凭证（热轮换友好）；未配置 → unconfigured 快照
  const store = new BalanceStore(async () => {
    const creds = ctx.get('credentials')
    const resolved = creds ? await creds.resolve(config.balance.apiKeyEnv) : undefined
    const apiKey = resolved?.value
    if (!apiKey) {
      throw new AdapterUnconfiguredError(
        `DeepSeek 凭证未配置：请在设置页录入 ${config.balance.apiKeyEnv}，或在环境中设置该变量`,
      )
    }
    return fetchDeepseekBalance({
      baseUrl: config.balance.baseUrl,
      apiKey,
      timeoutMs: config.balance.requestTimeoutMs,
    })
  })

  // --- 轮询（默认关闭，手动/面板刷新为主） ---
  let disposePolling: (() => void) | undefined
  const armPolling = () => {
    disposePolling?.()
    disposePolling = undefined
    if (config.balance.pollIntervalMs > 0) {
      disposePolling = ctx.interval(() => void store.refresh(), config.balance.pollIntervalMs)
    }
  }
  armPolling()
  ctx.effect(() => () => disposePolling?.(), 'dsh-deepseek-provider: balance polling dispose')

  // --- /api 路由（认证由 Connection 统一负责） ---
  connection.fetch.register({
    path: '/api/deepseek-balance/usage',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      await store.ensureFresh()
      return Response.json({ snapshot: store.snapshot() })
    },
  })

  connection.fetch.register({
    path: '/api/deepseek-balance/refresh',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async () => {
      await store.refresh()
      return Response.json({ snapshot: store.snapshot() })
    },
  })
}
