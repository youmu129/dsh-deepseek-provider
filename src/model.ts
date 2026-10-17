// 统一余额模型（结构对齐 dsh-zhipu-provider 的 src/model.ts 语义，单平台
// 余额版无套餐/配额概念）。host 半面把 DeepSeek /user/balance 接口归一化为
// 本模型；解析原则：容忍字段缺失（单字段失败只丢该字段）、金额字符串兼容
// 数值，解析异常归一为 error.kind: 'parse'。

export interface BalanceEntry {
  /** 币种（DeepSeek balance_infos[].currency，如 CNY / USD；缺失时为空串，UI 以「余额 #序号」回退展示） */
  currency: string
  /** 总的可用余额（含赠金与充值余额；接口未提供则缺省） */
  total?: number
  /** 未过期的赠金余额 */
  granted?: number
  /** 充值余额 */
  toppedUp?: number
}

export type BalanceErrorKind = 'network' | 'auth' | 'rate-limit' | 'parse' | 'unknown'

export interface BalanceError {
  kind: BalanceErrorKind
  /** 用户可理解的摘要（已脱敏，不含凭证片段） */
  message: string
}

export class AdapterError extends Error {
  readonly kind: BalanceErrorKind

  constructor(kind: BalanceErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'AdapterError'
  }
}

/**
 * 适配器"环境未就绪"信号（如凭证未录入）：host 侧捕获后映射为
 * snapshot.status = 'unconfigured'（该状态不带 error 字段）。
 */
export class AdapterUnconfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdapterUnconfiguredError'
  }
}

// ---------------------------------------------------------------------------
// 解析通用工具
// ---------------------------------------------------------------------------

/** 数值兼容字符串（DeepSeek 金额字段为字符串，如 "100.50"），无法解析时返回 undefined */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** 从快照展示/日志前剔除可能的凭证片段 */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join('<redacted>')
  }
  return out.slice(0, 500)
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
