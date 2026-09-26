import { paymentHoldSchema, type PaymentHold } from "@live-alerts/shared";

// UNPAID is not proof of a declined payment. Explicit failure strings below are
// accepted for local fixtures/adapters, not claimed as official TikTok enums.
export function paymentHoldStatus(status: string | undefined): PaymentHold["status"] | undefined {
  if (status?.toUpperCase() === "UNPAID") return "unpaid";
  if (["PAYMENT_FAILED", "ORDER_PAYMENT_FAILED"].includes(status?.toUpperCase() ?? ""))
    return "payment_failed";
  return undefined;
}

export class PaymentHoldStore {
  private readonly holds = new Map<string, PaymentHold>();
  private readonly versions = new Map<string, number>();

  update(orderId: string, rawStatus: string, timestamp: number): boolean {
    if (timestamp < (this.versions.get(orderId) ?? -Infinity)) return false;
    this.versions.set(orderId, timestamp);
    const status = paymentHoldStatus(rawStatus);
    if (status) {
      this.holds.set(
        orderId,
        paymentHoldSchema.parse({
          orderId,
          status,
          rawStatus,
          buyerDisplayName: "Someone",
          updatedAt: new Date(timestamp).toISOString()
        })
      );
    } else {
      this.holds.delete(orderId);
    }
    return true;
  }

  enrich(
    orderId: string,
    timestamp: number,
    fields: Partial<
      Pick<PaymentHold, "warehouseId" | "productTitle" | "skuName" | "buyerDisplayName">
    >
  ): void {
    const hold = this.holds.get(orderId);
    if (hold && this.versions.get(orderId) === timestamp) {
      this.holds.set(orderId, paymentHoldSchema.parse({ ...hold, ...fields }));
    }
  }

  list(): PaymentHold[] {
    return [...this.holds.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export function webhookUpdateTime(payload: Record<string, unknown>): number {
  const data =
    typeof payload.data === "object" && payload.data !== null
      ? (payload.data as Record<string, unknown>)
      : {};
  const raw = Number(data.update_time ?? payload.timestamp);
  return Number.isFinite(raw) && raw > 0 && raw < 1e12 ? raw * 1000 : Date.now();
}
