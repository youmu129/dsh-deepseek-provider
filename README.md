# dsh-deepseek-provider

DSH（DeepSeek Harness）插件（双半面 bundle）：为内置 deepseek 供应商（`llm-pi-ai` 目录路由 `deepseek`）配套 Web GUI 账号余额展示（底部 pill + 弹出面板），数据取自 DeepSeek 开放平台 `GET /user/balance`。不做 provider 播种——DSH 已内置 deepseek 供应商，本插件只加余额 pill。

## 状态

- [x] 仓库基线初始化
- [ ] 插件实现（余额 API + 余额 pill）
- [ ] build + 单测通过

## 凭证纪律

DeepSeek API Key 只存放于 DSH 凭证机制或 `apiKeyEnv` 引用的环境变量，不入库、不写入日志与文档。
