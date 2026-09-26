import { useEffect, useState } from "react";
import {
  printConsoleStateSchema,
  holdPrintNumber,
  type PrintConsoleState,
  type PrintRow
} from "@live-alerts/shared";
import "./printConsole.css";
import { usePrintLanguage } from "./language.js";
const statusLabels: Record<PrintRow["status"], string> = {
  queued: "等待打印",
  printing: "正在提交",
  submitted: "Printed",
  preview: "预览已生成",
  failed: "Failed",
  fixed: "Fixed"
};
export function PrintConsole() {
  const { language, setLanguage, t } = usePrintLanguage();
  const [state, setState] = useState<PrintConsoleState>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    document.title = t("打印工作台 · Live Orders");
  }, [t]);

  useEffect(() => {
    const abort = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const response = await fetch("/api/print-console", { signal: abort.signal });
        if (!response.ok) throw new Error("Local print agent unavailable");
        const next = printConsoleStateSchema.parse(await response.json());
        if (abort.signal.aborted) return;
        setState(next);
        setFresh(true);
      } catch {
        if (!abort.signal.aborted) setFresh(false);
      } finally {
        if (!abort.signal.aborted) timer = window.setTimeout(() => void refresh(), 700);
      }
    }
    void refresh();
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, []);
  async function action(path: string, body: object) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/print-console/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error("Print console action failed");
      if (path === "settings") setState(printConsoleStateSchema.parse(data));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const selected = state?.selectedWarehouseId ?? "";
  const destinations = state?.shopProfiles.length
    ? state.shopProfiles.flatMap((profile) =>
        profile.warehouses.map((warehouse) => ({
          profileId: profile.id,
          shopName: profile.name,
          warehouse
        }))
      )
    : (state?.warehouses ?? []).map((warehouse) => ({ profileId: "", shopName: "", warehouse }));
  const history =
    state?.history.filter((row) => !row.warehouseId || row.warehouseId === selected) ?? [];
  const latest =
    state?.lastPrintedByWarehouse[selected] ??
    history.find(
      (row) =>
        row.warehouseId === selected && ["submitted", "fixed", "preview"].includes(row.status)
    );
  const holds =
    state?.paymentHolds.filter((row) => !row.warehouseId || row.warehouseId === selected) ?? [];
  const rows = history.filter((row) =>
    `${row.pickCode} ${row.buyerDisplayName}`.toLowerCase().includes(search.toLowerCase())
  );
  const connectionLabel = !fresh
    ? t("本机代理离线")
    : state?.switchingStore
      ? t("正在切换店铺")
      : state?.connection === "connecting"
        ? t("正在核对店铺身份")
        : state?.connection === "connected"
          ? t("订单服务已连接")
          : t("订单服务未连接");
  return (
    <main className="print-app">
      <aside className="print-sidebar">
        <a className="print-brand" href="/print-control">
          <span className="print-brand-icon">P</span>
          <span>
            Print desk<small>LIVE ORDER WORKSPACE</small>
          </span>
        </a>
        <p className="print-nav-label">{t("工作空间")}</p>
        <div className="print-nav-active">
          <span>▤</span>
          {t("打印工作台")}
          <span className="print-live-dot" />
        </div>
        <div className="print-sidebar-note">
          <span className="print-live-dot" />
          {t("本机打印代理")}
          <p>{t("保持程序运行，订单会自动进入对应仓库的队列。")}</p>
        </div>
      </aside>
      <div className="print-main">
        <header className="print-topbar">
          <span>
            {t("工作空间")}
            <span className="print-slash">/</span>
            {t("打印工作台")}
          </span>
          <div className="print-topbar-actions">
            <button
              type="button"
              className="print-language-toggle"
              aria-label={language === "zh" ? "Switch to English" : "切换到中文"}
              onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            >
              <span lang="zh-CN" className={language === "zh" ? "is-active" : ""}>
                中文
              </span>
              <span aria-hidden="true"> / </span>
              <span lang="en" className={language === "en" ? "is-active" : ""}>
                EN
              </span>
            </button>
            <span
              className={`print-chip ${fresh && state?.connection === "connected" ? "print-chip-green" : "print-chip-amber"}`}
            >
              {connectionLabel}
            </span>
          </div>
        </header>
        <div className="print-content">
          <div className="print-heading">
            <div>
              <p className="print-eyebrow">ORDER PRINTING</p>
              <h1>{t("打印工作台")}</h1>
              <p>{t("选好仓库，随时掌握每一张订单的打印进度。")}</p>
            </div>
            {state?.dryRun && <span className="print-mode">{t("预览模式 · 不出纸")}</span>}
          </div>
          {!fresh && (
            <div className="print-notice" role="status">
              {t(
                "正在等待本机代理。请运行 pnpm print-console，并从 http://127.0.0.1:3002/print-control 打开此页。"
              )}
              {state ? t("下方保留最后一次状态，暂不可操作。") : ""}
            </div>
          )}
          {state?.connectionError && (
            <div className="print-notice" role="status">
              {t(state.connectionError)}
            </div>
          )}
          {error && (
            <div className="print-notice print-notice-error" role="alert">
              {t("操作未完成，请检查代理连接和仓库设置。")}
            </div>
          )}
          <section className="print-toolbar" aria-label={t("打印设置")}>
            <label htmlFor="warehouse">
              {t("店铺 / 打印仓库")}
              <select
                id="warehouse"
                value={JSON.stringify([state?.selectedProfileId ?? "", selected])}
                disabled={!fresh || busy || state?.switchingStore}
                onChange={(event) => {
                  const [profileId, warehouseId] = JSON.parse(event.target.value) as [
                    string,
                    string
                  ];
                  void action("settings", { warehouseId, ...(profileId ? { profileId } : {}) });
                }}
              >
                <option value="" disabled>
                  {t("请选择仓库")}
                </option>
                {destinations.map(({ profileId, shopName, warehouse }) => (
                  <option
                    key={`${profileId}:${warehouse.id}`}
                    value={JSON.stringify([profileId, warehouse.id])}
                  >
                    {shopName ? `${shopName} · ` : ""}
                    {warehouse.name === `仓库 ${warehouse.id}`
                      ? `${t("仓库")} ${warehouse.id}`
                      : warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="print-toolbar-state">
              <span
                className={`print-live-dot ${state?.paused || !selected || state?.connection !== "connected" || state?.switchingStore ? "print-dot-paused" : ""}`}
              />
              {state?.switchingStore
                ? t("正在切换店铺")
                : state?.connection !== "connected"
                  ? t("等待店铺连接，暂不打印")
                  : !selected
                    ? t("选择仓库后开始")
                    : state?.paused
                      ? t("打印已暂停")
                      : t("自动打印已开启")}
              <small>{t("切换店铺会同步切换凭据，当前一张完成后生效")}</small>
            </div>
            <button
              className="print-button print-pause-button"
              type="button"
              aria-label={state?.paused ? t("继续打印") : t("暂停打印")}
              title={state?.paused ? t("继续打印") : t("暂停打印")}
              disabled={
                !fresh ||
                busy ||
                !selected ||
                state?.switchingStore ||
                state?.connection !== "connected"
              }
              onClick={() => void action("settings", { paused: !state?.paused })}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
              >
                {state?.paused ? (
                  <path d="M7 4v16l13-8z" />
                ) : (
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                )}
              </svg>
            </button>
            {state?.dryRun && (
              <button
                className="print-button print-button-primary"
                disabled={
                  !fresh ||
                  busy ||
                  !selected ||
                  state?.switchingStore ||
                  state?.connection !== "connected"
                }
                onClick={() => void action("demo", {})}
              >
                {t("生成测试预览")}
              </button>
            )}
          </section>
          <section className="print-last-number" aria-label="Last print number">
            <article className="print-metric print-metric-current">
              <span>Last print number</span>
              <strong>{latest?.pickCode ?? "—"}</strong>
              {state?.dryRun && <p>{t("预览模式 · 不出纸")}</p>}
            </article>
          </section>
          <div className="print-columns">
            <section className="print-panel">
              <header className="print-panel-header">
                <div>
                  <h2>{t("订单打印")}</h2>
                  <p>{t("所选仓库的处理记录")}</p>
                </div>
              </header>
              <div className="print-list-tools">
                <span className="print-history-label">{t("处理记录")}</span>
                <input
                  aria-label={t("搜索打印订单")}
                  placeholder={t("搜索号码 / 用户名")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>{t("号码")}</th>
                      <th>{t("用户名")}</th>
                      <th>{t("状态")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong className="print-pick-code">{row.pickCode}</strong>
                        </td>
                        <td>{row.buyerDisplayName}</td>
                        <td>
                          <span className={`print-chip print-status-${row.status}`}>
                            {t(statusLabels[row.status])}
                          </span>
                          {row.error && <small className="print-row-error">{t(row.error)}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && (
                <div className="print-empty">
                  <span className="print-empty-icon">▤</span>
                  <strong>{search ? t("没有匹配的订单") : t("还没有处理记录")}</strong>
                  <p>
                    {selected
                      ? t("新订单到达后将在这里自动更新。")
                      : t("先在上方选择要打印的仓库。")}
                  </p>
                </div>
              )}
              <footer className="print-panel-footer">
                <span>{t("系统接受任务不代表已经出纸")}</span>
              </footer>
            </section>
            <section className="print-panel print-payment-panel">
              <header className="print-panel-header">
                <div>
                  <p className="print-payment-eyebrow">ORDER PAYMENT FAILED</p>
                  <h2>{t("暂未打印的订单")}</h2>
                </div>
                <span className="print-chip print-chip-amber">
                  {state?.contextAvailable ? holds.length : "—"}
                </span>
              </header>
              {!state?.contextAvailable ? (
                <div className="print-empty">
                  <span className="print-empty-icon">↻</span>
                  <strong>{t("付款状态尚未同步")}</strong>
                  <p>{t("需要订单服务支持付款状态推送；未收到数据时，不代表没有异常订单。")}</p>
                </div>
              ) : holds.length === 0 ? (
                <div className="print-empty">
                  <span className="print-empty-icon">✓</span>
                  <strong>{t("暂无已收到的付款异常订单")}</strong>
                  <p>{t("这里仅展示服务收到的订单事件。")}</p>
                </div>
              ) : (
                <ul className="print-hold-list">
                  {holds.map((hold) => (
                    <li key={hold.orderId}>
                      <div>
                        <strong>{holdPrintNumber(hold)}</strong>
                        <span className="print-chip print-status-failed">Failed</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <footer className="print-payment-note">
                {t(
                  "付款状态确认并进入待发货后，订单才会按仓库规则进入打印流程。仓库待确认的订单会保留显示。"
                )}
              </footer>
            </section>
          </div>
          <p className="print-session-note">
            {t(
              "本次运行记录 · 关闭程序会清空本机队列和历史；离线期间的打印订单暂不自动补取。打印中请保持程序运行。"
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
