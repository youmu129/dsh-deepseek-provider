// DeepSeek 余额 pill（conversation.composer.dock，与官方「会话统计 / Token 用量」、
// plan-usage 套餐 pill、zhipu-usage / raven-usage pill 同一座位链）：pill 触发
// 按钮（数据库图标 + 账户余额摘要）+ 点击开 portal 面板（按币种展示总额 /
// 赠金 / 充值余额与账户可用性）。仅当前会话选用内置 deepseek provider 时渲染
// （座位 inject 面绑定的 useModelDirectory 读取会话模型目录，选择源缺失或
// 选了别家 → 渲染 null）。交互范式复刻 dsh-zhipu-provider 的 bar.tsx（进而
// 复刻官方 StatsPills / stat-dialog 与 plan-usage）：CSS 锚点定位（触发元素
// anchor-name + 面板 position-anchor，视口钳制与翻转交给 @position-try 回退链）、
// useDismissOnOutsidePointer + Escape 关闭、样式对齐官方设计
// token（--dsw-* / --dsh-*）。组件在渲染期才取数，不在 apply 期触碰服务。
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconDatabaseOutlineRegular,
  Tooltip,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { api, type BalanceDto, type BalanceSnapshotDto } from './api.ts'
import { PANEL_NS } from './locale.ts'
import { DEEPSEEK_PROVIDERS } from './providers.ts'
import { injectCss } from './styles.ts'

// dsh-zhipu-provider bar.tsx 的 token 化样式（类名换 dsb- 前缀，数值与官方产物
// 一致），进度条相关类（zpu-bar*）不需要——余额无百分比语义，改用明细行
// （dsb-amountRow*）与账户可用性徽标（dsb-avail*）。
const PILL_CSS = `
.dsb-root { min-width: 0; display: inline-flex; font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); }
.dsb-pill { box-sizing: border-box; max-width: 100%; color: var(--dsw-alias-label-tertiary); font: inherit; font-variant-numeric: tabular-nums; line-height: inherit; white-space: nowrap; background: none; border: none; border-radius: 999px; align-items: center; gap: 6px; padding: 1px 8px; display: inline-flex; cursor: pointer; }
.dsb-pill svg { flex: none; width: 14px; height: 14px; }
.dsb-pill:hover, .dsb-pill[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.dsb-label { text-overflow: ellipsis; min-width: 0; overflow: hidden; }
.dsb-val--muted { opacity: .55; }
.dsb-val--err { color: #d4380d; }
@media (max-width: 480px) { .dsb-label { display: none; } }
.dsb-panel { z-index: 1100; box-sizing: border-box; border-radius: var(--dsw-radius-lg); background: var(--dsw-specific-menu); width: max-content; min-width: min(280px, 100vw - 24px); max-width: min(400px, 100vw - 24px); backdrop-filter: var(--dsw-menu-backdrop-filter); --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-prominent); color: var(--dsw-alias-label-secondary); cursor: default; border: 0; padding: 16px; font-size: 12px; line-height: 18px; position: fixed; position-area: none; top: max(12px, var(--dsh-frame-overlay-top, 12px)); bottom: max(12px, calc(anchor(top) + 8px)); left: max(12px, anchor(left)); right: 12px; position-try-fallbacks: --dsb-stat-window, --dsb-stat-opposite, --dsb-stat-wide-opposite, --dsb-stat-tall, --dsb-stat-viewport; align-self: end; justify-self: start; height: fit-content; min-height: 0; margin: 0; max-height: calc(100dvh - 12px - max(12px, var(--dsh-frame-overlay-top, 12px))); overflow-x: hidden; overflow-y: auto; --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.dsb-title { color: var(--dsw-alias-label-primary); justify-content: space-between; gap: 16px; margin-bottom: 8px; font-weight: 500; display: flex; align-items: center; }
.dsb-titleLabel { align-items: center; gap: 6px; min-width: 0; display: inline-flex; }
.dsb-titleLabel svg { flex: none; width: 14px; height: 14px; }
.dsb-titleMeta { align-items: center; gap: 8px; font-variant-numeric: tabular-nums; font-weight: 400; color: var(--dsw-alias-label-tertiary); display: inline-flex; }
.dsb-titleRule { border-top: .5px solid var(--dsw-alias-border-l2); margin-bottom: 10px; }
.dsb-avail { font-size: 11px; font-weight: 400; }
.dsb-avail--yes { color: #389e0d; }
.dsb-avail--no { color: #d4380d; }
.dsb-rows { display: flex; flex-direction: column; gap: 10px; }
.dsb-currency + .dsb-currency { border-top: .5px solid var(--dsw-alias-border-l2); padding-top: 10px; }
.dsb-currencyName { color: var(--dsw-alias-label-primary); font-weight: 500; margin-bottom: 4px; }
.dsb-amountRow { display: flex; justify-content: space-between; gap: 16px; }
.dsb-amountRow dt { color: var(--dsw-alias-label-tertiary); }
.dsb-amountRow dd { margin: 0; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; text-align: right; }
.dsb-stale { color: #d48806; font-size: 11px; font-weight: 400; }
.dsb-hint { color: var(--dsw-alias-label-tertiary); line-height: 1.6; overflow-wrap: anywhere; }
.dsb-refresh { background: none; border: none; color: inherit; cursor: pointer; opacity: .55; font-size: 13px; line-height: 1; padding: 2px 4px; flex: none; }
.dsb-refresh:hover:not(:disabled) { opacity: .9; }
.dsb-refresh:disabled { opacity: .25; cursor: default; }
/* 定位回退链（对齐官方 stat-dialog.module.css）：默认在触发元素上方、左对齐；
   视口放不下时依次尝试贴左窗、翻到下方、贴窗翻下方、放宽左钳制、整窗铺开 */
@position-try --dsb-stat-window { position-area: none; top: max(12px, var(--dsh-frame-overlay-top, 12px)); bottom: max(12px, calc(anchor(top) + 8px)); left: 12px; right: 12px; margin: 0; align-self: safe end; justify-self: safe end; }
@position-try --dsb-stat-opposite { top: max(12px, calc(anchor(bottom) + 8px)); bottom: 12px; align-self: start; }
@position-try --dsb-stat-wide-opposite { top: max(12px, calc(anchor(bottom) + 8px)); bottom: 12px; left: 12px; right: 12px; align-self: start; justify-self: safe end; }
@position-try --dsb-stat-tall { position-area: none; top: max(12px, var(--dsh-frame-overlay-top, 12px)); bottom: 12px; left: max(12px, anchor(left)); right: 12px; margin: 0; align-self: safe start; justify-self: start; }
@position-try --dsb-stat-viewport { position-area: none; inset: max(12px, var(--dsh-frame-overlay-top, 12px)) 12px 12px; margin: 0; align-self: safe start; justify-self: safe end; }
`

type Translate = (key: string, params?: Record<string, string | number>) => string

// ---------------------------------------------------------------------------
// 会话模型选择（官方 ui-model-selection 服务的使用子集，类型本地镜像；
// 与 primitives.d.ts 同理：DSH 内部包无可安装类型，运行时对象由宿主供给）
// ---------------------------------------------------------------------------

/** 模型选择（镜像官方 ModelSelection 的使用子集） */
interface ModelSelectionLike {
  provider: string
  model: string
}

/** 会话模型目录快照（镜像官方 ModelDirectoryState 的使用子集） */
interface ModelDirectorySnapshotLike {
  current: ModelSelectionLike | null
}

/** 可观察快照源（官方 HostObservable 的使用子集：getSnapshot + subscribe） */
export interface SnapshotSourceLike {
  getSnapshot(): ModelDirectorySnapshotLike | undefined
  subscribe(fn: () => void): () => void
}

/** 座位机制绑定后的选择器 hook（hooks.modelDirectory → useModelDirectory prop） */
export type UseModelDirectory = <S>(selector: (s: ModelDirectorySnapshotLike | undefined) => S) => S

/** 选择源缺失时的降级源：snapshot 恒 undefined（pill 据此隐藏） */
export const ABSENT_MODEL_SOURCE: SnapshotSourceLike = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
}

/** 金额文案：币种符号优先（CNY/USD），否则币种代码前缀；固定两位小数 */
function fmtMoney(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const symbol = CURRENCY_SYMBOLS[currency]
  return symbol ? `${symbol}${formatted}` : `${currency} ${formatted}`
}

/** 一行的展示金额：总额优先，缺总额时用赠金 + 充值合成；都无则缺省 */
function entryAmount(entry: BalanceDto): number | undefined {
  if (entry.total !== undefined) return entry.total
  if (entry.granted !== undefined || entry.toppedUp !== undefined) {
    return (entry.granted ?? 0) + (entry.toppedUp ?? 0)
  }
  return undefined
}

/** pill 摘要取数：优先 CNY 行，否则第一行有可算金额的行 */
function primaryEntry(balances: BalanceDto[]): { entry: BalanceDto; amount: number } | undefined {
  const withAmount = balances
    .map((entry) => ({ entry, amount: entryAmount(entry) }))
    .filter((row): row is { entry: BalanceDto; amount: number } => row.amount !== undefined)
  const cny = withAmount.find((row) => row.entry.currency === 'CNY')
  return cny ?? withAmount[0]
}

/** 币种展示名：词典本地化优先，缺省回退币种代码本身 */
function currencyName(currency: string, t: Translate): string {
  const localized = t(`currency.${currency}`)
  return localized === `currency.${currency}` ? currency : localized
}

/** 错误行文案键：按 error.kind 映射，未知 kind 回退通用文案 */
function errorTextKey(kind: string | undefined): string {
  return kind === 'network' || kind === 'auth' || kind === 'rate-limit' || kind === 'parse'
    ? `error.${kind}`
    : 'error.unknown'
}

export function createBalancePill(ctx: any) {
  const t: Translate = (key, params) => ctx.locale.bind(PANEL_NS)(key, params)

  function BalancePill({ useModelDirectory }: { useModelDirectory?: UseModelDirectory }) {
    const [snapshot, setSnapshot] = useState<BalanceSnapshotDto | undefined>(undefined)
    // 与「从未请求成功」区分：true 表示至少拿到过一次 host 响应（含错误快照）
    const [loaded, setLoaded] = useState(false)
    // 请求级失败（host 路由缺失 / 网络断开）：与「暂无数据」区分呈现
    const [loadError, setLoadError] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLSpanElement | null>(null)
    const panelRef = useRef<HTMLDivElement | null>(null)
    // 复刻官方 useStatDialog：CSS 锚点定位（触发元素命名 anchor-name，portal
    // 面板经 position-anchor 引用同名锚点，钳制与翻转由 CSS 回退链完成）
    const anchorName = `--dsb-stat-${useId().replaceAll(':', '')}`
    useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
    useEffect(() => {
      if (!open) return
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false)
      }
      // 键盘激活相邻 pill 只触发 click 不触发 pointerdown：捕获期外点 click
      // 先收起本面板，再让相邻触发器开自己的（与官方 useStatDialog 一致）
      const onClick = (e: MouseEvent) => {
        if (e.target instanceof Node
          && rootRef.current?.contains(e.target) !== true
          && panelRef.current?.contains(e.target) !== true) {
          setOpen(false)
        }
      }
      document.addEventListener('keydown', onKeyDown)
      document.addEventListener('click', onClick, true)
      return () => {
        document.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('click', onClick, true)
      }
    }, [open])

    const load = useCallback(async () => {
      try {
        const data = await api.usage()
        setSnapshot(data.snapshot)
      } catch {
        setLoadError(true)
      } finally {
        setLoaded(true)
      }
    }, [])

    const refresh = useCallback(async () => {
      setRefreshing(true)
      try {
        const data = await api.refresh()
        setSnapshot(data.snapshot)
        setLoaded(true)
      } catch {
        /* 保留现状 */
      } finally {
        setRefreshing(false)
      }
    }, [])

    useEffect(() => {
      injectCss('pill', PILL_CSS)
      void load().catch(() => setLoaded(true))
      const timer = setInterval(() => void refresh(), 60_000)
      return () => clearInterval(timer)
    }, [load, refresh])

    // 显隐判定：仅当前会话选用 deepseek provider 时显示。注：座位
    // inject 面按（entry × 会话绑定）缓存，useModelDirectory 在一次挂载内恒
    // 存在或恒缺失，条件调用不破坏 hook 调用序稳定性；选择源缺失时 selection
    // 恒 null，pill 隐藏而非退化常显。
    const hasSelectionSource = typeof useModelDirectory === 'function'
    const selection = hasSelectionSource
      ? useModelDirectory((s: ModelDirectorySnapshotLike | undefined) => s?.current ?? null)
      : null

    // 非 DeepSeek 会话（或选择未就绪 / 选择源缺失）不渲染 pill；组件仍保持挂载，
    // 取数副作用照常运行（数据保温），切到 DeepSeek 时 pill 即刻有数据。
    if (!DEEPSEEK_PROVIDERS.has(selection?.provider ?? '')) return null

    const status = snapshot?.status
    const primary = snapshot?.balances ? primaryEntry(snapshot.balances) : undefined

    // pill 文案：加载中 → 请求失败/错误/未配置/余额摘要（平台名风格，对齐
    // plan-usage 的 "Kimi 45%"：单段 → 「DeepSeek ¥12.34」）
    const label = !loaded
      ? t('loading')
      : loadError && status === undefined
        ? t('state.error')
        : status === 'error'
          ? t('state.error')
          : status === 'unconfigured'
            ? t('state.unconfigured')
            : primary
              ? `${t('bar.brand')} ${fmtMoney(primary.amount, primary.entry.currency)}`
              : t('panel.title')

    return (
      <span className="dsb-root" ref={rootRef} style={{ anchorName }}>
        <button
          type="button"
          className="dsb-pill"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen(!open)}
        >
          <IconDatabaseOutlineRegular />
          <span className="dsb-label">
            {!loaded ? null : loadError && status === undefined ? (
              <span className="dsb-val dsb-val--err">{t('state.error')}</span>
            ) : status === 'error' ? (
              <span className="dsb-val dsb-val--err">{t('state.error')}</span>
            ) : status === 'unconfigured' ? (
              <span className="dsb-val dsb-val--muted">{t('state.unconfigured')}</span>
            ) : primary ? (
              <span>
                <span>{t('bar.brand')} </span>
                <span className={snapshot?.stale ? 'dsb-val dsb-val--muted' : 'dsb-val'}>
                  {fmtMoney(primary.amount, primary.entry.currency)}
                </span>
              </span>
            ) : (
              <span className="dsb-val dsb-val--muted">{t('panel.title')}</span>
            )}
          </span>
        </button>
        {open &&
          createPortal(
            <div
              ref={panelRef}
              className="dsb-panel"
              role="dialog"
              aria-label={t('panel.title')}
              style={{ positionAnchor: anchorName }}
            >
              <div className="dsb-title">
                <span className="dsb-titleLabel">
                  <IconDatabaseOutlineRegular />
                  {t('panel.title')}
                </span>
                <span className="dsb-titleMeta">
                  {snapshot?.isAvailable === true && <span className="dsb-avail dsb-avail--yes">{t('avail.yes')}</span>}
                  {snapshot?.isAvailable === false && <span className="dsb-avail dsb-avail--no">{t('avail.no')}</span>}
                  {status === 'ok' && snapshot?.stale && <span className="dsb-stale">{t('stale.badge')}</span>}
                  {snapshot?.fetchedAt && (
                    <span>{t('updated.at', { time: new Date(snapshot.fetchedAt).toLocaleTimeString() })}</span>
                  )}
                  <Tooltip label={refreshing ? t('refreshing') : t('refresh')} side="top" delayMs={300}>
                    <button
                      type="button"
                      className="dsb-refresh"
                      aria-label={t('refresh')}
                      disabled={refreshing}
                      onClick={refresh}
                    >
                      ⟳
                    </button>
                  </Tooltip>
                </span>
              </div>
              <div className="dsb-titleRule" aria-hidden="true" />
              {!loaded && <div>{t('loading')}</div>}
              {loaded && loadError && status === undefined && (
                <div className="dsb-hint">{t('error.route')}</div>
              )}
              {loaded && !loadError && status === undefined && <div>{t('empty')}</div>}
              {loaded && status === 'unconfigured' && <div className="dsb-hint">{t('hint.unconfigured')}</div>}
              {loaded && status === 'error' && (
                <div className="dsb-hint">
                  {t(errorTextKey(snapshot?.error?.kind))}
                  {snapshot?.error?.message ? `：${snapshot.error.message}` : ''}
                </div>
              )}
              {status === 'ok' && (
                <div className="dsb-rows">
                  {snapshot!.balances.length === 0 && <div className="dsb-hint">{t('avail.no')}</div>}
                  {snapshot!.balances.map((entry, idx) => (
                    <div className="dsb-currency" key={entry.currency || idx}>
                      <div className="dsb-currencyName">{currencyName(entry.currency, t)}</div>
                      <dl className="dsb-amountRow">
                        <dt>{t('balance.total')}</dt>
                        <dd>{entry.total !== undefined ? fmtMoney(entry.total, entry.currency) : t('amount.none')}</dd>
                      </dl>
                      <dl className="dsb-amountRow">
                        <dt>{t('balance.granted')}</dt>
                        <dd>{entry.granted !== undefined ? fmtMoney(entry.granted, entry.currency) : t('amount.none')}</dd>
                      </dl>
                      <dl className="dsb-amountRow">
                        <dt>{t('balance.toppedUp')}</dt>
                        <dd>{entry.toppedUp !== undefined ? fmtMoney(entry.toppedUp, entry.currency) : t('amount.none')}</dd>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )}
      </span>
    )
  }

  return BalancePill
}
