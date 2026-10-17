// DeepSeek 账号余额适配器（接口契约参考 https://api-docs.deepseek.com/zh-cn/api/get-user-balance）。
//
// 端点：GET {baseUrl}/user/balance，baseUrl 默认 https://api.deepseek.com
// 认证：Authorization: Bearer <key>（DeepSeek 开放平台标准认证，无裸 token 回退）
// 字段映射（balance_infos[]）：
//   currency → currency；total_balance → total（字符串金额，兼容数值）
//   granted_balance → granted；topped_up_balance → toppedUp
//   is_available → isAvailable（账户是否有余额可供 API 调用）
// 异常归类：HTTP 401/403 → auth；HTTP 429 → rate-limit；3xx 重定向按安全策略拒绝；
// 超时/网络失败 → network；响应非 JSON / 缺 balance_infos / 无任何可识别余额字段 → parse。

import {
  AdapterError,
  type BalanceEntry,
  isRecord,
  redact,
  toNumber,
} from './model.ts'

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com'

export interface DeepseekBalance {
  isAvailable?: boolean
  balances: BalanceEntry[]
}

/** 解析 /user/balance 响应体。失败抛 AdapterError。 */
export function parseDeepseekBalance(json: unknown): DeepseekBalance {
  if (!isRecord(json)) throw new AdapterError('parse', 'DeepSeek 响应不是 JSON 对象')

  const isAvailable = typeof json.is_available === 'boolean' ? json.is_available : undefined

  if (!Array.isArray(json.balance_infos)) {
    throw new AdapterError('parse', 'DeepSeek 响应缺少 balance_infos 字段')
  }
  const balances: BalanceEntry[] = []
  for (const item of json.balance_infos) {
    if (!isRecord(item)) continue
    const currency = typeof item.currency === 'string' ? item.currency.trim() : ''
    const total = toNumber(item.total_balance)
    const granted = toNumber(item.granted_balance)
    const toppedUp = toNumber(item.topped_up_balance)
    // 整行无可识别字段视为杂质跳过；币种缺失但金额在场时保留（currency 空串由 UI 回退展示）
    if (currency === '' && total === undefined && granted === undefined && toppedUp === undefined) continue
    balances.push({ currency, total, granted, toppedUp })
  }
  // balance_infos 为空数组但 is_available 在场是合法响应（账户无任何币种余额）；
  // 两者都缺才算解析失败
  if (balances.length === 0 && isAvailable === undefined) {
    throw new AdapterError('parse', 'DeepSeek 响应中未识别到余额字段')
  }
  return { isAvailable, balances }
}

export interface FetchDeepseekOptions {
  baseUrl: string
  apiKey: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export async function fetchDeepseekBalance(opts: FetchDeepseekOptions): Promise<DeepseekBalance> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const url = new URL('/user/balance', ensureTrailingSlash(opts.baseUrl))

  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${opts.apiKey}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (err) {
    throw mapFetchError(err)
  }
  if (res.status >= 300 && res.status < 400) {
    throw new AdapterError('network', `DeepSeek 端点发生重定向（${res.status}），已按安全策略拒绝跟随`)
  }
  if (res.status === 401 || res.status === 403) {
    throw new AdapterError('auth', 'DeepSeek 凭证无效或已过期')
  }
  if (res.status === 429) throw new AdapterError('rate-limit', 'DeepSeek 端点限流，请稍后重试')
  if (!res.ok) {
    const snippet = redact(await safeText(res), [opts.apiKey])
    throw new AdapterError('unknown', `DeepSeek 请求失败（HTTP ${res.status}）：${snippet}`)
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new AdapterError('parse', 'DeepSeek 响应不是合法 JSON')
  }
  return parseDeepseekBalance(json)
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : base + '/'
}

function mapFetchError(err: unknown): AdapterError {
  const name = err instanceof Error ? err.name : ''
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new AdapterError('network', 'DeepSeek 请求超时')
  }
  return new AdapterError('network', `DeepSeek 网络请求失败：${err instanceof Error ? err.message : String(err)}`)
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200)
  } catch {
    return ''
  }
}
