// pill 显隐判定守卫：web profile 的内置 DeepSeek 模型实际走 llm-deepseek-api-key
// 条目，路由 id 为 deepseek-official（非 llm-pi-ai 目录路由 deepseek）。首版只
// 匹配 'deepseek' 导致 DeepSeek 会话 pill 永不显示（线上实测排查），此处锁定
// deepseek-official 必须在集合内。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEEPSEEK_PROVIDERS } from '../src/client/providers.ts'

test('DEEPSEEK_PROVIDERS contains the web profile built-in route deepseek-official', () => {
  assert.ok(DEEPSEEK_PROVIDERS.has('deepseek-official'),
    'GUI 内置 DeepSeek 模型路由是 deepseek-official（llm-deepseek-api-key 条目），缺失则 pill 永不显示')
})

test('DEEPSEEK_PROVIDERS keeps the pi-ai catalog route deepseek for compat', () => {
  assert.ok(DEEPSEEK_PROVIDERS.has('deepseek'))
})

test('DEEPSEEK_PROVIDERS excludes unrelated provider routes', () => {
  for (const other of ['zhipu-coding-plan', 'kimi-coding-plan', 'bailian-token-plan', '']) {
    assert.ok(!DEEPSEEK_PROVIDERS.has(other), `${other} 不应触发 DeepSeek 余额 pill`)
  }
})
