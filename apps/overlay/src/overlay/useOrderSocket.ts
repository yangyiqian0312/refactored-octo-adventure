import { orderAlertSchema, type OrderAlert } from "@live-alerts/shared";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type OrderSocketState = {
  connectionState: ConnectionState;
  latestAlert: OrderAlert | undefined;
  errorMessage: string | undefined;
};

export function useOrderSocket(serverUrl: string, token: string): OrderSocketState {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [latestAlert, setLatestAlert] = useState<OrderAlert | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const normalizedServerUrl = useMemo(() => serverUrl.replace(/\/$/, ""), [serverUrl]);

  useEffect(() => {
    if (!token) {
      setConnectionState("error");
      setErrorMessage("Missing overlay token");
      return;
    }

    const socket = io(normalizedServerUrl, {
      auth: { token },
      query: { token },
      transports: ["websocket", "polling"],
      reconnection: true
    });

    socket.on("connect", () => {
      setConnectionState("connected");
      setErrorMessage(undefined);
    });

    socket.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    socket.on("connect_error", (error) => {
      setConnectionState("error");
      setErrorMessage(error.message);
    });

    socket.on("order:created", (payload: unknown) => {
      const parsed = orderAlertSchema.safeParse(payload);

      if (parsed.success) {
        setLatestAlert(parsed.data);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [normalizedServerUrl, token]);

  return { connectionState, latestAlert, errorMessage };
}
