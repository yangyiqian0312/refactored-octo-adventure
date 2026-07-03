import type { LabelPrintJob } from "@live-alerts/shared";

export function renderRolloLabelHtml(job: LabelPrintJob): string {
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
      gap: 0.05in;
      border: 0.015in solid #000;
    }

    .name {
      font-size: 18pt;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .order {
      font-size: 11pt;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0.01in;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <main class="label">
    <div class="name">${escapeHtml(job.buyerDisplayName)}</div>
    <div class="order">ORDER ${escapeHtml(job.orderId)}</div>
  </main>
</body>
</html>`;
}

export function shortOrderId(orderId: string): string {
  return orderId.length > 8 ? orderId.slice(-8) : orderId;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
