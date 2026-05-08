import type { OrderAlert } from "@live-alerts/shared";
import { useEffect, useMemo, useState } from "react";
import { enqueueAlert, popNextAlert } from "./alertQueue.js";
import { useOrderSocket } from "./useOrderSocket.js";

const DISPLAY_MS = 4300;

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const serverUrl = params.get("server") ?? "http://localhost:3001";
  const token = params.get("token") ?? "";
  const debug = params.get("debug") === "1";
  const { connectionState, latestAlert, errorMessage } = useOrderSocket(serverUrl, token);
  const [queue, setQueue] = useState<OrderAlert[]>([]);
  const [currentAlert, setCurrentAlert] = useState<OrderAlert | undefined>();

  useEffect(() => {
    if (latestAlert) {
      setQueue((existing) => enqueueAlert(existing, latestAlert));
    }
  }, [latestAlert]);

  useEffect(() => {
    if (currentAlert || queue.length === 0) {
      return;
    }

    const next = popNextAlert(queue);
    setCurrentAlert(next.current);
    setQueue(next.remaining);
  }, [currentAlert, queue]);

  useEffect(() => {
    if (!currentAlert) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCurrentAlert(undefined);
    }, DISPLAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [currentAlert]);

  return (
    <main className="overlay-shell" aria-live="polite">
      {debug ? (
        <DebugIndicator
          connectionState={connectionState}
          serverUrl={serverUrl}
          queuedCount={queue.length}
          errorMessage={errorMessage}
        />
      ) : null}

      <section className="alert-stage">
        {currentAlert ? <OrderAlertCard alert={currentAlert} key={currentAlert.id} /> : null}
      </section>
    </main>
  );
}

function OrderAlertCard({ alert }: { alert: OrderAlert }) {
  return (
    <article className={`order-alert order-alert--${alert.tier}`}>
      <div className="alert-ribbon">{labelForTier(alert.tier)}</div>
      <div className="alert-image-wrap">
        {alert.imageUrl ? (
          <img className="alert-image" src={alert.imageUrl} alt="" />
        ) : (
          <div className="alert-image-fallback">BUY</div>
        )}
      </div>
      <div className="alert-copy">
        <p className="alert-kicker">TikTok Shop Order</p>
        <h1>
          <span>{alert.buyerDisplayName}</span> just bought{" "}
          <strong>
            {alert.quantity}x {alert.productTitle}
          </strong>
        </h1>
      </div>
      <div className="spark spark-a" />
      <div className="spark spark-b" />
      <div className="spark spark-c" />
    </article>
  );
}

function DebugIndicator({
  connectionState,
  serverUrl,
  queuedCount,
  errorMessage
}: {
  connectionState: string;
  serverUrl: string;
  queuedCount: number;
  errorMessage: string | undefined;
}) {
  return (
    <aside className="debug-indicator">
      <span className={`status-dot status-dot--${connectionState}`} />
      <span>{connectionState}</span>
      <span>{serverUrl}</span>
      <span>queued {queuedCount}</span>
      {errorMessage ? <span>{errorMessage}</span> : null}
    </aside>
  );
}

function labelForTier(tier: OrderAlert["tier"]): string {
  if (tier === "mega") {
    return "MEGA DROP";
  }

  if (tier === "large") {
    return "BIG CART";
  }

  return "NEW ORDER";
}
