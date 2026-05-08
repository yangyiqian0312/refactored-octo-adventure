import type { OrderAlert } from "@live-alerts/shared";

export type RawWebhookEvent = {
  eventId: string;
  dedupeKey: string;
  receivedAt: string;
  payload: unknown;
};

export class InMemoryOrderStore {
  private readonly alerts: OrderAlert[] = [];
  private readonly rawWebhookEvents: RawWebhookEvent[] = [];
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

  private trim<T>(items: T[]): void {
    if (items.length > this.maxItems) {
      items.length = this.maxItems;
    }
  }
}
