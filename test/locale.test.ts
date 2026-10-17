// 词典完整性守卫：bar.tsx 渲染的全部文案键在 zh/en 词典都存在，
// 杜绝键名漂移把原始键名渲染到界面上（dsh-zhipu-provider 曾出现
// 「智谱 short.window-5h 2.1%」同类症状，见其实测记录）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { panelDict } from '../src/client/locale.ts'

const FIXED_KEYS = [
  'loading',
  'empty',
  'bar.brand',
  'panel.title',
  'state.error',
  'state.unconfigured',
  'stale.badge',
  'updated.at',
  'refresh',
  'refreshing',
  'avail.yes',
  'avail.no',
  'balance.total',
  'balance.granted',
  'balance.toppedUp',
  'currency.CNY',
  'currency.USD',
  'amount.none',
  'hint.unconfigured',
  'error.route',
  'error.network',
  'error.auth',
  'error.rate-limit',
  'error.parse',
  'error.unknown',
]

test('panel dict ships every fixed key the pill and panel render, in both languages', () => {
  for (const lang of ['zh', 'en'] as const) {
    const dict = panelDict[lang] as Record<string, string>
    for (const key of FIXED_KEYS) {
      assert.ok(key in dict, `${lang} 词典缺少 ${key}`)
      assert.ok(dict[key].length > 0, `${lang} 词典 ${key} 为空串`)
    }
  }
})

test('panel dict keeps zh and en key sets in sync', () => {
  const zhKeys = Object.keys(panelDict.zh).sort()
  const enKeys = Object.keys(panelDict.en).sort()
  assert.deepEqual(enKeys, zhKeys)
})
