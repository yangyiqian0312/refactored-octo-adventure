import type { OrderAlert, OrderQueueItem } from "@live-alerts/shared";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { enqueueAlert, popNextAlert } from "./alertQueue.js";
import { useOrderSocket } from "./useOrderSocket.js";

const DISPLAY_MS = 4300;
const DEMO_NAMES = ["nichoooooooole", "dannyboy1097", "m***23", "PackPalaceFan", "charizardpulls"];

export function App() {
  if (window.location.pathname === "/control") {
    return <QueueControlPage />;
  }

  if (window.location.pathname === "/big-order-test") {
    return <BigOrderTestPage />;
  }

  if (window.location.pathname === "/starmie-test") {
    return <StarmieTestPage />;
  }

  return <OrderOverlayApp />;
}

function QueueControlPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const serverUrl = params.get("server") ?? "http://localhost:3001";
  const token = params.get("token") ?? "";
  const roomName = params.get("room")?.trim() || defaultRoomName(serverUrl, token);
  const normalizedServerUrl = useMemo(() => serverUrl.replace(/\/$/, ""), [serverUrl]);
  const { connectionState, pendingOrders, errorMessage } = useOrderSocket(serverUrl, token);
  const [displayQueue, setDisplayQueue] = useState<OrderQueueItem[]>([]);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setDisplayQueue(pendingOrders);
  }, [pendingOrders]);

  const requestQueueAction = async (
    label: string,
    path: string,
    body?: Record<string, unknown>
  ) => {
    if (!token) {
      setStatusMessage("Missing token");
      return;
    }

    setIsBusy(true);
    setStatusMessage(`${label}...`);

    try {
      const requestInit: RequestInit = {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { "content-type": "application/json" } : {})
        }
      };

      if (body) {
        requestInit.body = JSON.stringify(body);
      }

      const response = await fetch(`${normalizedServerUrl}${path}`, requestInit);
      const payload = await response.json();

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? `${label} failed`);
      }

      if (Array.isArray(payload.queue)) {
        setDisplayQueue(payload.queue as OrderQueueItem[]);
      }

      setStatusMessage(`${label} complete`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setIsBusy(false);
    }
  };

  const completeFirst = () => requestQueueAction("Complete First", "/api/queue/shift", {});
  const clearQueue = () => requestQueueAction("Clear Queue", "/api/queue/clear", {});
  const refreshQueue = () => requestQueueAction("Refresh", "/api/queue");
  const removeOrder = (orderId: string) =>
    requestQueueAction("Mark Done", "/api/queue/remove", { orderId });

  return (
    <main className="control-page">
      <section className="control-panel">
        <div className="control-panel__header">
          <div>
            <p className="control-panel__eyebrow">Q Control</p>
            <h1>{roomName}</h1>
          </div>
          <span className={`control-pill control-pill--${connectionState}`}>
            {connectionState}
          </span>
        </div>

        <div className="control-actions">
          <button type="button" onClick={completeFirst} disabled={isBusy || displayQueue.length === 0}>
            Complete First
          </button>
          <button type="button" onClick={clearQueue} disabled={isBusy || displayQueue.length === 0}>
            Clear Queue
          </button>
          <button type="button" onClick={refreshQueue} disabled={isBusy}>
            Refresh
          </button>
        </div>

        <div className="control-status">
          <span>{statusMessage}</span>
          {errorMessage ? <span>{errorMessage}</span> : null}
        </div>

        {displayQueue.length > 0 ? (
          <ol className="control-queue">
            {displayQueue.map((order, index) => (
              <li className="control-queue__item" key={order.orderId}>
                <span className="control-queue__rank">{index + 1}</span>
                <div className="control-queue__body">
                  <strong>{order.buyerDisplayName}</strong>
                  <span>{order.productTitle ?? "TikTok Shop Order"}</span>
                </div>
                <button type="button" onClick={() => removeOrder(order.orderId)} disabled={isBusy}>
                  Done
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="control-empty">
            <strong>Q is Open :3</strong>
            <span>No one is waiting right now.</span>
          </div>
        )}
      </section>
    </main>
  );
}

function OrderOverlayApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const serverUrl = params.get("server") ?? "http://localhost:3001";
  const token = params.get("token") ?? "";
  const debug = params.get("debug") === "1";
  const demo = params.get("demo") === "1";
  const isStoreTwo = isStoreTwoOverlay(serverUrl, token);
  const themeStyle = useMemo(() => overlayThemeStyle(serverUrl, token), [serverUrl, token]);
  const runnerGif = isStoreTwo ? "/luffy-run.gif" : "/pikachu-run.gif";
  const { connectionState, latestAlert, pendingOrders, errorMessage } = useOrderSocket(serverUrl, token);
  const [queue, setQueue] = useState<OrderAlert[]>([]);
  const [currentAlert, setCurrentAlert] = useState<OrderAlert | undefined>();

  useEffect(() => {
    if (latestAlert) {
      setQueue((existing) => enqueueAlert(existing, latestAlert));
    }
  }, [latestAlert]);

  useEffect(() => {
    if (!demo) {
      return;
    }

    let demoIndex = 0;
    const pushDemoAlert = () => {
      const buyerDisplayName = DEMO_NAMES[demoIndex % DEMO_NAMES.length] ?? "Someone";
      demoIndex += 1;

      setQueue((existing) =>
        enqueueAlert(existing, {
          id: `demo-${Date.now()}-${demoIndex}`,
          source: "test",
          orderId: `demo-order-${demoIndex}`,
          buyerDisplayName,
          productTitle: "Demo Order",
          quantity: 1,
          createdAt: new Date().toISOString(),
          tier: "normal"
        })
      );
    };

    pushDemoAlert();
    const intervalId = window.setInterval(pushDemoAlert, 5800);

    return () => window.clearInterval(intervalId);
  }, [demo]);

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
    <main className="overlay-shell" style={themeStyle} aria-live="polite">
      {debug ? (
        <DebugIndicator
          connectionState={connectionState}
          serverUrl={serverUrl}
          queuedCount={queue.length}
          errorMessage={errorMessage}
        />
      ) : null}

      <section className="alert-stage">
        {currentAlert && shouldUseBigOrderAlert(currentAlert) ? (
          <BigOrderAlertCard
            alert={currentAlert}
            variant={isStoreTwo ? "store2" : "default"}
            key={currentAlert.id}
          />
        ) : currentAlert ? (
          <OrderAlertCard
            alert={currentAlert}
            runnerGif={runnerGif}
            variant={isStoreTwo ? "store2" : "default"}
            key={currentAlert.id}
          />
        ) : null}
      </section>

      <PendingOrderQueue orders={pendingOrders} />
    </main>
  );
}

function overlayThemeStyle(serverUrl: string, token: string): CSSProperties {
  if (isStoreTwoOverlay(serverUrl, token)) {
    return {
      "--overlay-accent": "#960018",
      "--overlay-accent-shadow": "rgba(150, 0, 24, 0.55)",
      "--overlay-accent-strong-shadow": "rgba(150, 0, 24, 0.6)",
      "--overlay-panel-background":
        "linear-gradient(135deg, rgba(242, 242, 242, 0.92), rgba(214, 214, 214, 0.84)), repeating-linear-gradient(90deg, rgba(17, 24, 32, 0.05) 0 1px, transparent 1px 18px)",
      "--overlay-primary-text": "#202327",
      "--overlay-secondary-text": "rgba(32, 35, 39, 0.88)",
      "--overlay-text-shadow": "none"
    } as CSSProperties;
  }

  return {};
}

function isStoreTwoOverlay(serverUrl: string, token: string): boolean {
  return serverUrl.includes("tiktok-shop-live-alert-server-5u57.onrender.com") || token === "otaku-overlay-token";
}

function defaultRoomName(serverUrl: string, token: string): string {
  return isStoreTwoOverlay(serverUrl, token) ? "Otaku Card Haven" : "Pack Palace";
}

function shouldUseBigOrderAlert(alert: OrderAlert): boolean {
  return (alert.orderTotalAmount ?? 0) >= 500;
}

function PendingOrderQueue({ orders }: { orders: OrderQueueItem[] }) {
  return (
    <aside className="pending-queue" aria-label="Awaiting shipment orders">
      <div className="pending-queue__header">
        <span className="pending-queue__label">
          {orders.length === 0 ? "Q is Open :3" : "Queue"}
        </span>
        {orders.length > 0 ? <span className="pending-queue__count">{orders.length}</span> : null}
      </div>
      {orders.length > 0 ? (
        <ol className="pending-queue__list">
          {orders.slice(0, 8).map((order, index) => (
            <li className="pending-queue__item" key={order.orderId}>
              <span className="pending-queue__rank">{index + 1}</span>
              <span className="pending-queue__name">{order.buyerDisplayName}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="pending-queue__empty">No one in Q rn</p>
      )}
    </aside>
  );
}

function OrderAlertCard({
  alert,
  runnerGif,
  variant
}: {
  alert: OrderAlert;
  runnerGif: string;
  variant: "default" | "store2";
}) {
  return (
    <article className={`order-alert order-alert--${alert.tier} order-alert--${variant}`}>
      <div className="alert-bubble">
        <span>{alert.buyerDisplayName}</span> just ordered!
      </div>
      <img className="alert-pikachu" src={runnerGif} alt="" />
    </article>
  );
}

function BigOrderAlertCard({
  alert,
  variant
}: {
  alert: OrderAlert;
  variant: "default" | "store2";
}) {
  const [isVisible, setIsVisible] = useState(true);

  return (
    <article className={`order-alert-big order-alert-big--${variant}`}>
      {isVisible ? (
        <>
          <div className="order-alert-big__toast">
            <span>{alert.buyerDisplayName}</span> just ordered!
          </div>
          {variant === "store2" ? (
            <img
              className="order-alert-big__runner order-alert-big__runner--gif"
              src="/one-piece-shock-big.gif"
              alt=""
              onAnimationEnd={() => setIsVisible(false)}
            />
          ) : (
            <video
              className="order-alert-big__runner"
              src="/person-run-transparent.webm"
              autoPlay
              muted
              playsInline
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (Number.isFinite(video.duration) && video.duration > 0.7) {
                  video.playbackRate = video.duration / (video.duration - 0.5);
                }
              }}
              onEnded={() => setIsVisible(false)}
            />
          )}
        </>
      ) : null}
    </article>
  );
}

function BigOrderTestPage() {
  return (
    <main className="big-order-test" aria-live="polite">
      <section className="big-order-alert">
        <div className="big-order-panel">
          <p className="big-order-kicker">WARNING</p>
          <h1>BIG ORDER INCOMING</h1>
          <p className="big-order-subtitle">Brace for the pull</p>
        </div>
        <img className="big-order-charizard" src="/charizard-fly.gif" alt="" />
        <div className="big-order-streak big-order-streak--a" />
        <div className="big-order-streak big-order-streak--b" />
      </section>
    </main>
  );
}

function StarmieTestPage() {
  const [isVisible, setIsVisible] = useState(true);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const buyerName = params.get("name") ?? "m***23";

  return (
    <main className="starmie-test" aria-live="polite">
      <section className="starmie-burst">
        {isVisible ? (
          <>
            <div className="starmie-order-toast">
              <span>{buyerName}</span> just ordered!
            </div>
            <video
              className="starmie-burst__sprite"
              src="/person-run-transparent.webm"
              autoPlay
              muted
              playsInline
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (Number.isFinite(video.duration) && video.duration > 0.7) {
                  video.playbackRate = video.duration / (video.duration - 0.5);
                }
              }}
              onEnded={() => setIsVisible(false)}
            />
          </>
        ) : null}
      </section>
    </main>
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
