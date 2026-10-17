# dsh-deepseek-provider

DSH（DeepSeek Harness）插件：Web GUI 底部余额 pill（`conversation.composer.dock`），仅当前会话选用 DeepSeek 模型时显示，摘要展示主币种总额（优先 CNY），点击开面板看各币种总额 / 赠金 / 充值与账户可用性。数据取自 DeepSeek 开放平台 `GET /user/balance`。

**不播种 provider**：内置 DeepSeek 供应商已就绪，本插件只加 pill。

## 使用方法

1. 安装：`pnpm install` 后 `dsh plugin --profile web add ./dsh-deepseek-provider`，重启 `dsh web`；
2. 凭证：默认引用 `DEEPSEEK_API_KEY`（与内置 DeepSeek 路由同一把钥匙，零新增配置）；未配置时 pill 显示「未配置」；
3. 使用：DeepSeek 会话输入卡片下方出现 pill，点击弹面板看明细并手动刷新；非 DeepSeek 会话 pill 隐藏，切回即刻有数据。

凭证只经 DSH 凭证机制或环境变量存放，不入库、不写入日志与文档。
