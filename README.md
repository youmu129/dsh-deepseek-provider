# dsh-deepseek-provider

DSH（DeepSeek Harness）插件（双半面 bundle），一个包交付一件事：

**账号余额展示**：Web GUI 底部状态 pill（`conversation.composer.dock`，与官方「会话统计 / Token 用量」、plan-usage 套餐 pill、zhipu-usage / raven-usage pill 同一座位链，order 25）——**仅当前会话选用内置 `deepseek` provider 时显示**；pill 显示账户余额摘要（品牌 + 主币种总额），点击开面板展示按币种的总额 / 赠金 / 充值余额与账户可用性。数据经 host 半面 `/api/deepseek-balance/*` 同源路由取自 DeepSeek 开放平台 `GET /user/balance`。

**本插件不播种 provider**：DSH 的 `llm-pi-ai` 目录已内置 `deepseek` 路由（Models 页可管理），无需也无权重复注册。

## 用法

### 安装

```powershell
dsh plugin --profile web add ./dsh-deepseek-provider
```

`dsh plugin` 会把包 link 进 profile 并追加到 `dsh.profile.bundles`。host 半面模块代码变更需重启 `dsh web` 生效（模块 import 发生在启动时）；patch 结构变更走 `patchReload: live` 热重组。可用 `dsh --profile web --dump-config` 检查合成结果。

> **依赖必须在被 link 的目录内就位**：profile 记录的是 `link:<目录>` 规格，pnpm 只做目录软链，**不会安装该目录自身的依赖**。若本体目录没有 `node_modules`，启动时报 `dsh-deepseek-provider (dsh-deepseek-provider): failed to import`。安装后在该目录执行一次 `pnpm install` 即可；`node_modules` 已被 `.gitignore` 忽略，不影响仓库干净度。

### 凭证配置

DeepSeek API Key 只通过 `apiKeyEnv` 引用的环境变量或 DSH 凭证机制存放，不入库、不写入日志：

- 默认引用名 **`DEEPSEEK_API_KEY`**——与内置 `deepseek` 路由同一把钥匙，**零新增配置**（设置页录入一次，模型调用与余额查询共用）；
- 未配置凭证时 pill 显示「未配置」态并给出指引。

### 使用

安装并重启 Web GUI 后，会话选用 DeepSeek 模型时，输入卡片下方出现 DeepSeek 余额 pill：

- 摘要段显示品牌 + 主币种总额（优先 CNY，无总额时用赠金 + 充值合成），数据保温机制与 zhipu-usage 一致（切会话即刻有数据）；
- 点击弹出面板：账户可用性徽标（`is_available`）、按币种（人民币 / 美元）的总额 / 赠金 / 充值明细、上次更新时间、手动刷新按钮；上游失败时保留上次成功数据并标注「展示上次数据」。

### 设置项

行 config（`cordis.patch.yml`）只传 `balance.pollIntervalMs` / `balance.requestTimeoutMs`；schema 默认值：`apiKeyEnv: DEEPSEEK_API_KEY`、`baseUrl: https://api.deepseek.com`（代理网关可覆盖 baseUrl）、`pollIntervalMs: 0`（默认关闭自动轮询，手动/面板刷新为主；client 半面另有 60s 软刷新）。

## 工作机制

- **余额数据流**：host 半面经 DSH 凭证机制按 `apiKeyEnv` 现解析 DeepSeek API Key（每次刷新现读，热轮换友好；未配置 → `unconfigured` 快照），直连 `GET {baseUrl}/user/balance`（Bearer 认证；401/403 → auth、429 → rate-limit、3xx 重定向按安全策略拒绝），归一化为统一余额模型缓存在内存；经 `/api/deepseek-balance/usage | refresh` 路由暴露；client 半面渲染 pill 与弹出面板。接口契约参考 [DeepSeek API 文档](https://api-docs.deepseek.com/zh-cn/api/get-user-balance)。
- **pill 显隐**：座位 inject 面绑定会话模型目录（官方 `ui-model-selection`），非 DeepSeek 会话渲染 `null` 但组件保持挂载、取数保温（机制同 zhipu-usage / plan-usage）。
- **与 dsh-zhipu-provider / dsh-kimi-provider 的关系**：同一座位链、互不冲突——zhipu pill order 15、raven order 20，本 pill order 25 排末位；插件互不感知，可按需独立装卸。

## 构建与测试

```powershell
pnpm install
pnpm run build    # tsdown → lib/index.js + lib/client.cjs → 包装为 lib/client.js
pnpm test         # node test/run-all.ts（Node 原生类型擦除，22/22）
```

开发期：`pnpm run dev`（tsdown watch）+ `pnpm run dev:client`（跟随重建包装 client.js）。

## 凭证纪律

DeepSeek API Key 只存放于 DSH 凭证机制或 `apiKeyEnv` 引用的环境变量，不入库、不写入日志与文档。
