# dsh-deepseek-provider

DSH（DeepSeek Harness）插件：Web GUI 底部余额 pill（`conversation.composer.dock`，order 25），仅当前会话选用 DeepSeek 模型（`deepseek-official` / `deepseek` 路由）时显示，摘要展示主币种总额（优先 CNY），点击开面板看各币种总额 / 赠金 / 充值与 `is_available` 账户可用性。数据经 host 半面 `/api/deepseek-balance/*` 取自 DeepSeek 开放平台 `GET /user/balance`。

**不播种 provider**：内置 DeepSeek 供应商（web profile 的 `llm-deepseek-api-key` 条目，路由 `deepseek-official`）已就绪，本插件只加 pill。

## 安装

```powershell
pnpm install                                  # 先在本目录装依赖（link 安装不装本体依赖，缺失会报 failed to import）
dsh plugin --profile web add ./dsh-deepseek-provider
```

host 代码变更需重启 `dsh web` 生效；`dsh --profile web --dump-config` 可检查合成结果。

## 凭证

默认引用 **`DEEPSEEK_API_KEY`**（与内置 DeepSeek 路由同一把钥匙，零新增配置）；未配置时 pill 显示「未配置」。Key 只经 DSH 凭证机制或 `apiKeyEnv` 引用的环境变量存放，不入库、不写入日志与文档。

## 使用

重启 Web GUI 后，DeepSeek 会话输入卡片下方出现 pill；点击弹面板：账户可用性徽标、按币种明细、上次更新时间与刷新按钮；上游失败保留上次成功数据并标注「展示上次数据」。非 DeepSeek 会话 pill 隐藏但取数保温，切回即刻有数据。

## 设置项

行 config（`cordis.patch.yml`）只传 `balance.pollIntervalMs` / `balance.requestTimeoutMs`；schema 默认值：`apiKeyEnv: DEEPSEEK_API_KEY`、`baseUrl: https://api.deepseek.com`（代理网关可覆盖）、`pollIntervalMs: 0`（默认关自动轮询，手动刷新为主；client 另有 60s 软刷新）。

## 构建与测试

```powershell
pnpm run build    # tsdown → lib/index.js + lib/client.cjs → 包装为 lib/client.js
pnpm test         # node test/run-all.ts（Node 原生类型擦除，25/25）
```

开发期：`pnpm run dev`（tsdown watch）+ `pnpm run dev:client`（跟随重建 client.js）。
