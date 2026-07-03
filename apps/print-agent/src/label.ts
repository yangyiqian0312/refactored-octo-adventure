import type { LabelPrintJob } from "@live-alerts/shared";

export function renderRolloLabelHtml(job: LabelPrintJob, qrImagePath?: string): string {
  const order = formatShortOrderId(job.orderId);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order ${escapeHtml(shortOrderId(job.orderId))}</title>
  <style>
    @page {
      size: 2in 1in;
      margin: 0;
    }

    html,
    body {
      width: 2in;
      height: 1in;
      margin: 0;
      overflow: hidden;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
    }

    .label {
      box-sizing: border-box;
      width: 2in;
      height: 1in;
      padding: 0.09in 0.1in;
      display: grid;
      align-content: center;
      gap: 0.025in;
      border: 0.015in solid #000;
    }

    .line {
      font-size: 9pt;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .order {
      font-size: 13pt;
    }
  </style>
</head>
<body>
  <main class="label">
    <div class="line">SKU ${escapeHtml(job.skuId)}</div>
    <div class="line">USER ${escapeHtml(job.userId)}</div>
    <div class="line">${escapeHtml(job.productName)}</div>
    <div class="line order">${escapeHtml(order)}</div>
  </main>
</body>
</html>`;
}

export function formatBuyerId(buyerDisplayName: string): string {
  const trimmed = buyerDisplayName.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function formatShortOrderId(orderId: string): string {
  return `#${shortOrderId(orderId)}`;
}

export function shortOrderId(orderId: string): string {
  return orderId.length > 5 ? orderId.slice(-5) : orderId;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
