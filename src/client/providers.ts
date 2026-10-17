// 内置 DeepSeek provider 路由 id 集合（pill 显隐判定）：
// - deepseek-official：web profile 的内置 DeepSeek 模型走 llm-deepseek-api-key
//   条目（packages/llm/llm-deepseek-api-key 的 PROVIDER 常量），这是 GUI 实际
//   选用的 DeepSeek 路由；
// - deepseek：llm-pi-ai 的 pi-ai 目录路由，若用户在 Models 页显式配置也会命中。
// 两者同一把 DEEPSEEK_API_KEY，余额查询共用。
// 独立成模块以便 node:test 直接断言（bar.tsx 依赖浏览器基线模块，node 无法导入）。
export const DEEPSEEK_PROVIDERS: ReadonlySet<string> = new Set(['deepseek-official', 'deepseek'])
