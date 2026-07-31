import type { LabelPrintJob } from "@live-alerts/shared";

export function renderRolloLabelHtml(job: LabelPrintJob, qrImagePath?: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order ${escapeHtml(shortOrderId(job.orderId))}</title>
  <style>
    @page {
      size: 1.5in 1in;
      margin: 0;
    }

    html,
    body {
      width: 1.5in;
      height: 1in;
      margin: 0;
      overflow: hidden;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
    }

    .label {
      box-sizing: border-box;
      width: 1.5in;
      height: 1in;
      padding: 0.07in 0.07in 0.07in 0.2in;
      display: grid;
      grid-template-rows: 0.16in 0.25in 0.28in 0.11in;
      gap: 0.025in;
      border: 0.015in solid #000;
    }

    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.08in;
      padding-bottom: 0.025in;
      border-bottom: 0.01in solid #000;
      font-size: 7pt;
      line-height: 1;
      font-weight: 800;
    }

    .meta span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .order-id {
      font-size: 5.5pt;
    }

    .buyer {
      overflow: hidden;
      font-size: 14pt;
      line-height: 1;
      font-weight: 900;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .pick-code {
      overflow: hidden;
      font-size: 21pt;
      line-height: 1;
      font-weight: 900;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .peel-note {
      overflow: hidden;
      font-size: 5.5pt;
      line-height: 1;
      font-weight: 700;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <main class="label">
    <header class="meta">
      <span class="order-id">ORDER ${escapeHtml(formatShortOrderId(job.orderId))}</span>
      ${job.productPaidAmount === undefined ? "" : `<span>${escapeHtml(formatProductPaidAmount(job.productPaidAmount, job.productPaidCurrency))}</span>`}
    </header>
    <div class="buyer">${escapeHtml(formatBuyerId(job.buyerNickname))}</div>
    <div class="pick-code">${escapeHtml(formatPickCode(job.productName, job.skuName))}</div>
    <div class="peel-note">*This label peels off easily.</div>
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

export function formatPickCode(productName: string, skuName: string): string {
  const titleCode = productName.trim().match(/^([A-Z])(?:\s|$)/)?.[1];
  const number = skuName.trim().replace(/^#+\s*/, "");
  return titleCode ? `${titleCode} ${number}` : number;
}

export function formatProductPaidAmount(amount: number, currency = "USD"): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return currency.toUpperCase() === "USD" ? value : `${value} ${currency.toUpperCase()}`;
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
