import { useCallback, useEffect, useState } from "react";

type Language = "zh" | "en";
const storageKey = "print-console-language";

const english: Record<string, string> = {
  "店铺 / 打印仓库": "Shop / Print warehouse",
  正在切换店铺: "Switching shop",
  正在核对店铺身份: "Verifying shop identity",
  "等待店铺订单确认：旧版云端暂无历史，收到匹配订单后自动开始打印。":
    "Waiting for a shop order to verify identity. Matching orders will print automatically.",
  "等待店铺连接，暂不打印": "Waiting for shop connection · Printing stopped",
  "切换店铺会同步切换凭据，当前一张完成后生效":
    "Switching shops also switches credentials, after the current label finishes",
  "店铺身份核对失败或连接不可用，已停止打印，请检查该店铺的凭据及仓库配置。":
    "Shop verification or connection failed. Printing is stopped. Check this shop's credentials and warehouses.",
  "店铺切换失败，请重新选择店铺重试。": "Could not switch shops. Select the shop again to retry.",
  所选仓库的处理记录: "History for the selected warehouse",
  号码: "Number",
  用户名: "Username",
  "搜索号码 / 用户名": "Search number / username",
  等待打印: "Waiting to print",
  正在提交: "Submitting",
  已提交打印机: "Sent to printer",
  预览已生成: "Preview ready",
  打印未确认: "Print unconfirmed",
  "打印工作台 · Live Orders": "Print desk · Live Orders",
  本机打印代理未响应: "Local print agent is not responding",
  "操作未完成，请检查代理连接和仓库设置。":
    "Could not complete the action. Check the agent connection and warehouse settings.",
  操作失败: "Action failed",
  本机代理离线: "Local agent offline",
  订单服务已连接: "Order service connected",
  订单服务未连接: "Order service disconnected",
  工作空间: "Workspace",
  打印工作台: "Print desk",
  本机打印代理: "Local print agent",
  "保持程序运行，订单会自动进入对应仓库的队列。":
    "Keep the agent running. Orders will join their warehouse queues automatically.",
  "选好仓库，随时掌握每一张订单的打印进度。":
    "Choose a warehouse and follow every order through printing.",
  "预览模式 · 不出纸": "Preview mode · No printing",
  本机打印: "Local printing",
  "正在等待本机代理。请运行 pnpm print-console，并从 http://127.0.0.1:3002/print-control 打开此页。":
    "Waiting for the local agent. Run pnpm print-console and open http://127.0.0.1:3002/print-control.",
  "下方保留最后一次状态，暂不可操作。":
    "The last known status is shown below. Controls are temporarily unavailable.",
  打印设置: "Print settings",
  打印仓库: "Print warehouse",
  仓库: "Warehouse",
  请选择仓库: "Choose a warehouse",
  选择仓库后开始: "Choose a warehouse to start",
  打印已暂停: "Printing paused",
  自动打印已开启: "Automatic printing enabled",
  切换仓库会在当前一张完成后生效: "Warehouse changes apply after the current label finishes",
  继续打印: "Resume printing",
  暂停打印: "Pause printing",
  生成测试预览: "Create test preview",
  打印概况: "Print overview",
  正在打印的号码: "Current print number",
  最近处理的号码: "Last processed number",
  "正在向打印机提交 · 仓库尾号": "Sending to printer · Warehouse ending in",
  等待第一张订单: "Waiting for the first order",
  "当前仓库 · 按接收顺序处理": "Selected warehouse · First in, first out",
  "本次已提交 / 预览": "Submitted / Previewed",
  "最近 100 条记录内统计": "Counted within the latest 100 records",
  "付款异常 / 待付款": "Payment issues / Unpaid",
  暂不进入打印队列: "Held outside the print queue",
  订单打印: "Order printing",
  所选仓库的队列和处理记录: "Queue and history for the selected warehouse",
  待处理: "pending",
  处理记录: "History",
  搜索打印订单: "Search print orders",
  "搜索号码 / 订单尾号": "Search number / order suffix",
  "号码 / 商品": "Number / Product",
  订单尾号: "Order suffix",
  状态: "Status",
  时间: "Time",
  没有匹配的订单: "No matching orders",
  "队列已清空，等待新订单": "Queue clear. Waiting for new orders",
  还没有处理记录: "No history yet",
  "新订单到达后将在这里自动更新。": "New orders will appear here automatically.",
  "先在上方选择要打印的仓库。": "Choose a print warehouse above to get started.",
  "其他仓库等待：": "Other warehouses waiting: ",
  张: "labels",
  系统接受任务不代表已经出纸: "Accepted by the system does not mean physically printed",
  暂未打印的订单: "Orders on hold",
  付款状态: "Payment status",
  "付款失败 + 待付款": "Failed + Unpaid",
  仅付款失败: "Failed payments only",
  仅待付款: "Unpaid only",
  付款状态尚未同步: "Payment status not synced",
  "需要订单服务支持付款状态推送；未收到数据时，不代表没有异常订单。":
    "Payment updates require support from the order service. Missing data does not mean there are no payment issues.",
  暂无已收到的付款异常订单: "No payment holds received",
  "这里仅展示服务收到的订单事件。": "Only order events received by the service appear here.",
  号码待同步: "Number pending",
  待付款: "Unpaid",
  付款失败: "Payment failed",
  商品信息待同步: "Product details pending",
  "订单 …": "Order …",
  仓库尾号: "Warehouse ending in",
  仓库待确认: "Warehouse unconfirmed",
  "付款状态确认并进入待发货后，订单才会按仓库规则进入打印流程。仓库待确认的订单会保留显示。":
    "Orders enter printing under warehouse rules once payment is confirmed and they await shipment. Orders with an unconfirmed warehouse remain visible.",
  "本次运行记录 · 关闭程序会清空本机队列和历史；离线期间的打印订单暂不自动补取。打印中请保持程序运行。":
    "Session records · Closing the agent clears the local queue and history. Orders missed while offline are not retrieved automatically. Keep the agent running while printing.",
  "无法连接订单服务器，请检查网络及 PRINT_AGENT_TOKEN 配置。":
    "Cannot connect to the order server. Check your network and PRINT_AGENT_TOKEN settings.",
  "打印未确认，请检查打印机及系统队列后处理，避免重复出纸。":
    "Printing was not confirmed. Check the printer and system queue before proceeding to avoid duplicate labels."
};

export function usePrintLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem(storageKey) === "en" ? "en" : "zh";
    } catch {
      // Storage may be blocked; the switch still works for this page session.
      return "zh";
    }
  });
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem(storageKey, language);
    } catch {
      // Keep the selected language in React state when storage is unavailable.
    }
    return () => {
      document.documentElement.lang = previous;
    };
  }, [language]);
  const t = useCallback(
    (text: string) =>
      language === "en" ? (english[text.trim().replace(/\s+/g, " ")] ?? text) : text,
    [language]
  );
  return { language, setLanguage, t, locale: language === "zh" ? "zh-CN" : "en-US" };
}
