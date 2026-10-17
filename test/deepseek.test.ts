// DeepSeek 余额适配器与 store 行为校验：
// 1. parseDeepseekBalance：文档示例形态（字符串金额）、数值兼容、杂质行跳过、
//    空余额数组与 is_available 的合法/非法组合；
// 2. fetchDeepseekBalance：Bearer 认证头、401/403/429/重定向/超时归类
//    （fetchImpl stub 不触网）、错误片段脱敏；
// 3. BalanceStore：成功快照、失败保留 stale、未配置态、ensureFresh 幂等。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AdapterError, AdapterUnconfiguredError } from '../src/model.ts'
import { fetchDeepseekBalance, parseDeepseekBalance } from '../src/deepseek.ts'
import { BalanceStore } from '../src/store.ts'

// DeepSeek 官方文档示例形态（金额为字符串）
const OK_BALANCE = {
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '100.00', granted_balance: '50.00', topped_up_balance: '50.00' },
    { currency: 'USD', total_balance: '10.00', granted_balance: '5.00', topped_up_balance: '5.00' },
  ],
}

// ---------------------------------------------------------------------------
// parseDeepseekBalance
// ---------------------------------------------------------------------------

test('parseDeepseekBalance maps balance_infos string amounts and is_available', () => {
  const r = parseDeepseekBalance(OK_BALANCE)
  assert.equal(r.isAvailable, true)
  assert.equal(r.balances.length, 2)
  const [cny, usd] = r.balances
  assert.equal(cny.currency, 'CNY')
  assert.equal(cny.total, 100)
  assert.equal(cny.granted, 50)
  assert.equal(cny.toppedUp, 50)
  assert.equal(usd.currency, 'USD')
  assert.equal(usd.total, 10)
  assert.equal(usd.granted, 5)
  assert.equal(usd.toppedUp, 5)
})

test('parseDeepseekBalance accepts numeric amounts and missing optional fields', () => {
  const r = parseDeepseekBalance({
    is_available: false,
    balance_infos: [{ currency: 'CNY', total_balance: 0, granted_balance: 0, topped_up_balance: 0 }],
  })
  assert.equal(r.isAvailable, false)
  assert.equal(r.balances.length, 1)
  assert.equal(r.balances[0].total, 0)
})

test('parseDeepseekBalance skips junk rows but keeps rows with amounts with no currency', () => {
  const r = parseDeepseekBalance({
    is_available: true,
    balance_infos: [
      null,
      { note: 'no recognizable fields' },
      { total_balance: '7.50', granted_balance: '2.50' },
    ],
  })
  assert.equal(r.balances.length, 1)
  assert.equal(r.balances[0].currency, '')
  assert.equal(r.balances[0].total, 7.5)
  assert.equal(r.balances[0].granted, 2.5)
  assert.equal(r.balances[0].toppedUp, undefined)
})

test('parseDeepseekBalance accepts empty balance_infos when is_available is present', () => {
  const r = parseDeepseekBalance({ is_available: false, balance_infos: [] })
  assert.equal(r.isAvailable, false)
  assert.deepEqual(r.balances, [])
})

test('parseDeepseekBalance rejects missing balance_infos / empty without is_available / non-object', () => {
  assert.throws(() => parseDeepseekBalance({ is_available: true }), (e: unknown) => {
    assert.ok(e instanceof AdapterError)
    assert.equal(e.kind, 'parse')
    return true
  })
  assert.throws(() => parseDeepseekBalance({ balance_infos: [] }), AdapterError)
  assert.throws(() => parseDeepseekBalance(null), AdapterError)
  assert.throws(() => parseDeepseekBalance('{"is_available":true}'), AdapterError)
})

// ---------------------------------------------------------------------------
// fetchDeepseekBalance（fetchImpl stub，不触网）
// ---------------------------------------------------------------------------

interface StubCall {
  status: number
  body?: unknown
  headers?: Record<string, string>
}

function stubFetch(calls: StubCall[]): { fetchImpl: typeof fetch; authHeaders: Array<string | undefined>; urls: string[] } {
  const authHeaders: Array<string | undefined> = []
  const urls: string[] = []
  let i = 0
  const fetchImpl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    urls.push(String(input))
    authHeaders.push(init?.headers?.Authorization)
    const call = calls[Math.min(i, calls.length - 1)]
    i += 1
    return new Response(JSON.stringify(call.body ?? {}), {
      status: call.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return { fetchImpl, authHeaders, urls }
}

const FETCH_OPTS = { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test-key', timeoutMs: 1000 }

test('fetchDeepseekBalance sends Bearer auth and resolves balance', async () => {
  const { fetchImpl, authHeaders, urls } = stubFetch([{ status: 200, body: OK_BALANCE }])
  const balance = await fetchDeepseekBalance({ ...FETCH_OPTS, fetchImpl })
  assert.equal(balance.isAvailable, true)
  assert.equal(balance.balances.length, 2)
  assert.deepEqual(authHeaders, ['Bearer sk-test-key'])
  assert.deepEqual(urls, ['https://api.deepseek.com/user/balance'])
})

test('fetchDeepseekBalance maps 401 and 403 to auth error', async () => {
  for (const status of [401, 403]) {
    const { fetchImpl } = stubFetch([{ status, body: {} }])
    await assert.rejects(
      () => fetchDeepseekBalance({ ...FETCH_OPTS, fetchImpl }),
      (e: unknown) => e instanceof AdapterError && e.kind === 'auth',
    )
  }
})

test('fetchDeepseekBalance maps 429 to rate-limit error', async () => {
  const { fetchImpl } = stubFetch([{ status: 429, body: {} }])
  await assert.rejects(
    () => fetchDeepseekBalance({ ...FETCH_OPTS, fetchImpl }),
    (e: unknown) => e instanceof AdapterError && e.kind === 'rate-limit',
  )
})

test('fetchDeepseekBalance refuses redirect (3xx) as network error', async () => {
  const { fetchImpl } = stubFetch([{ status: 302, body: {} }])
  await assert.rejects(
    () => fetchDeepseekBalance({ ...FETCH_OPTS, fetchImpl }),
    (e: unknown) => e instanceof AdapterError && e.kind === 'network',
  )
})

test('fetchDeepseekBalance maps timeout to network error', async () => {
  const fetchImpl = (async () => {
    throw Object.assign(new Error('aborted'), { name: 'TimeoutError' })
  }) as typeof fetch
  await assert.rejects(
    () => fetchDeepseekBalance({ ...FETCH_OPTS, fetchImpl }),
    (e: unknown) => e instanceof AdapterError && e.kind === 'network',
  )
})

test('fetchDeepseekBalance redacts the api key from error snippets', async () => {
  const fetchImpl = (async () =>
    new Response(`invalid key ${FETCH_OPTS.apiKey}`, { status: 500 })) as typeof fetch
  await assert.rejects(
    () => fetchDeepseekBalance({ ...FETCH_OPTS, fetchImpl }),
    (e: unknown) => {
      assert.ok(e instanceof AdapterError)
      assert.equal(e.kind, 'unknown')
      assert.ok(!e.message.includes(FETCH_OPTS.apiKey), '错误信息不得包含凭证原文')
      assert.ok(e.message.includes('<redacted>'))
      return true
    },
  )
})

// ---------------------------------------------------------------------------
// BalanceStore
// ---------------------------------------------------------------------------

test('BalanceStore keeps ok snapshot with isAvailable and balances', async () => {
  const store = new BalanceStore(async () => parseDeepseekBalance(OK_BALANCE))
  await store.refresh()
  const snap = store.snapshot()
  assert.equal(snap?.status, 'ok')
  assert.equal(snap?.isAvailable, true)
  assert.equal(snap?.balances.length, 2)
  assert.ok(snap?.fetchedAt)
})

test('BalanceStore preserves last ok data with stale flag on later failure', async () => {
  let fail = false
  const store = new BalanceStore(async () => {
    if (fail) throw new AdapterError('network', 'DeepSeek 请求超时')
    return parseDeepseekBalance(OK_BALANCE)
  })
  await store.refresh()
  fail = true
  await store.refresh()
  const snap = store.snapshot()
  assert.equal(snap?.status, 'error')
  assert.equal(snap?.stale, true)
  assert.equal(snap?.balances.length, 2)
  assert.equal(snap?.error?.kind, 'network')
})

test('BalanceStore maps unconfigured error without error field', async () => {
  const store = new BalanceStore(async () => {
    throw new AdapterUnconfiguredError('DeepSeek 凭证未配置')
  })
  await store.refresh()
  const snap = store.snapshot()
  assert.equal(snap?.status, 'unconfigured')
  assert.equal(snap?.error, undefined)
  assert.deepEqual(snap?.balances, [])
})

test('BalanceStore ensureFresh only refreshes once when a snapshot exists', async () => {
  let calls = 0
  const store = new BalanceStore(async () => {
    calls += 1
    return parseDeepseekBalance(OK_BALANCE)
  })
  await store.ensureFresh()
  await store.ensureFresh()
  assert.equal(calls, 1)
  assert.equal(store.snapshot()?.status, 'ok')
})

test('BalanceStore ensureFresh surfaces error snapshot from a failing adapter', async () => {
  const store = new BalanceStore(async () => {
    throw new AdapterError('parse', 'DeepSeek 响应不是合法 JSON')
  })
  await store.ensureFresh()
  assert.equal(store.snapshot()?.status, 'error')
  assert.equal(store.snapshot()?.error?.kind, 'parse')
})
