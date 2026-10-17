// 余额刷新编排与内存缓存（语义对齐 dsh-zhipu-provider 的 UsageStore）。
// - 成功 → 更新快照；失败 → 保留上次成功数据并标注 stale，无旧数据则只给错误；
// - 不做磁盘持久化：重启后首个请求触发一次刷新并等待。

import {
  AdapterError,
  AdapterUnconfiguredError,
  type BalanceEntry,
  type BalanceError,
  type BalanceErrorKind,
} from './model.ts'

export type BalanceStatus = 'ok' | 'error' | 'unconfigured'

export interface BalanceSnapshot {
  status: BalanceStatus
  /** 账户是否有余额可供 API 调用（DeepSeek is_available） */
  isAvailable?: boolean
  balances: BalanceEntry[]
  /** 上次成功获取时间（ISO） */
  fetchedAt?: string
  /** true = 本次失败，展示的是上次成功数据 */
  stale?: boolean
  error?: BalanceError
}

/** 适配器产出（DeepseekBalance 的结构子集，解耦 src/deepseek.ts 的类型） */
export interface BalanceData {
  isAvailable?: boolean
  balances: BalanceEntry[]
}

export type BalanceAdapter = () => Promise<BalanceData>

export class BalanceStore {
  private snapshotValue: BalanceSnapshot | undefined
  private inflight: Promise<void> | undefined
  private adapter: BalanceAdapter

  constructor(adapter: BalanceAdapter) {
    this.adapter = adapter
  }

  snapshot(): BalanceSnapshot | undefined {
    return this.snapshotValue
  }

  /** 触发一次刷新并等待完成（成功/失败都落定到快照） */
  async refresh(): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.refreshOne().finally(() => {
        this.inflight = undefined
      })
    }
    await this.inflight
  }

  /**
   * GET /usage 的实现：已有快照（含错误快照）直接返回；
   * 从未取过数则触发一次刷新并等待（重启后首请求场景）。
   */
  async ensureFresh(): Promise<void> {
    if (this.snapshotValue !== undefined) return
    await this.refresh()
  }

  private async refreshOne(): Promise<void> {
    const previous = this.snapshotValue
    try {
      const data = await this.adapter()
      this.snapshotValue = {
        status: 'ok',
        isAvailable: data.isAvailable,
        balances: data.balances,
        fetchedAt: new Date().toISOString(),
      }
    } catch (err) {
      this.snapshotValue = toErrorSnapshot(err, previous)
    }
  }
}

function toErrorSnapshot(err: unknown, previous: BalanceSnapshot | undefined): BalanceSnapshot {
  if (err instanceof AdapterUnconfiguredError) {
    return { status: 'unconfigured', balances: [] }
  }
  const error: BalanceError =
    err instanceof AdapterError
      ? { kind: err.kind as BalanceErrorKind, message: err.message }
      : { kind: 'unknown', message: err instanceof Error ? err.message : String(err) }
  // 保留并标注上一次成功获取的数据，避免界面清空造成误导
  if (previous?.status === 'ok' && previous.balances.length > 0) {
    return { ...previous, status: 'error', stale: true, error }
  }
  return { status: 'error', balances: [], error }
}
