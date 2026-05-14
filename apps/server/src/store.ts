import type { OrderAlert, OrderQueueItem } from "@live-alerts/shared";

export type RawWebhookEvent = {
  eventId: string;
  dedupeKey: string;
  receivedAt: string;
  payload: unknown;
};

export class InMemoryOrderStore {
  private readonly alerts: OrderAlert[] = [];
  private readonly rawWebhookEvents: RawWebhookEvent[] = [];
  private readonly pendingOrders = new Map<string, OrderQueueItem>();
  private readonly dedupeKeys = new Set<string>();

  constructor(private readonly maxItems = 50) {}

  hasDedupeKey(key: string): boolean {
    return this.dedupeKeys.has(key);
  }

  rememberDedupeKey(key: string): void {
    this.dedupeKeys.add(key);
  }

  addAlert(alert: OrderAlert): void {
    this.alerts.unshift(alert);
    this.trim(this.alerts);
  }

  addRawWebhookEvent(event: RawWebhookEvent): void {
    this.rawWebhookEvents.unshift(event);
    this.trim(this.rawWebhookEvents);
  }

  getRecentAlerts(): OrderAlert[] {
    return [...this.alerts];
  }

  getRawWebhookEvents(): RawWebhookEvent[] {
    return [...this.rawWebhookEvents];
  }

  upsertPendingOrder(order: OrderQueueItem): void {
    this.pendingOrders.set(order.orderId, order);
  }

  removePendingOrder(orderId: string): boolean {
    return this.pendingOrders.delete(orderId);
  }

  clearPendingOrders(): number {
    const removedCount = this.pendingOrders.size;
    this.pendingOrders.clear();
    return removedCount;
  }

  shiftPendingOrder(): OrderQueueItem | undefined {
    const nextOrder = this.getPendingOrders()[0];

    if (nextOrder) {
      this.pendingOrders.delete(nextOrder.orderId);
    }

    return nextOrder;
  }

  getPendingOrders(): OrderQueueItem[] {
    return [...this.pendingOrders.values()].sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt)
    );
  }

  private trim<T>(items: T[]): void {
    if (items.length > this.maxItems) {
      items.length = this.maxItems;
    }
  }
}
