// 与 host 半面 /api/deepseek-balance/* 路由通信（同源 fetch，认证 cookie 由 Connection 统一负责）

/** 余额行（与 host 半面 model.ts 的 BalanceEntry 同构） */
export interface BalanceDto {
  currency: string
  total?: number
  granted?: number
  toppedUp?: number
}

/** 余额快照（与 host 半面 store.ts 的 BalanceSnapshot 同构） */
export interface BalanceSnapshotDto {
  status: 'ok' | 'error' | 'unconfigured'
  isAvailable?: boolean
  balances: BalanceDto[]
  fetchedAt?: string
  stale?: boolean
  error?: { kind: string; message: string }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export const api = {
  usage: () => request<{ snapshot: BalanceSnapshotDto | undefined }>('/api/deepseek-balance/usage'),
  refresh: () =>
    request<{ snapshot: BalanceSnapshotDto | undefined }>('/api/deepseek-balance/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
}
