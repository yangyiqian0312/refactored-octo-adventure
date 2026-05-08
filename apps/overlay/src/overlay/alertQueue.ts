import type { OrderAlert } from "@live-alerts/shared";

export function enqueueAlert(queue: OrderAlert[], alert: OrderAlert): OrderAlert[] {
  if (queue.some((item) => item.id === alert.id)) {
    return queue;
  }

  return [...queue, alert];
}

export function popNextAlert(queue: OrderAlert[]): {
  current: OrderAlert | undefined;
  remaining: OrderAlert[];
} {
  const [current, ...remaining] = queue;

  return { current, remaining };
}
