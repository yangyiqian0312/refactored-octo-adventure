import { io } from "socket.io-client";
import type { ShopProfile } from "./shopProfiles.js";

export type ShopConnectionEvents = {
  connected(): void;
  disconnected(): void;
  error(): void;
  context(payload: unknown): void;
  holds(payload: unknown): void;
  job(payload: unknown): void;
};
export type ShopConnectionFactory = (
  profile: ShopProfile,
  events: ShopConnectionEvents
) => { close(): void };

export const connectShop: ShopConnectionFactory = (profile, events) => {
  const socket = io(profile.serverUrl, {
    auth: { token: profile.token, shopId: profile.shopId },
    transports: ["polling", "websocket"],
    tryAllTransports: true,
    autoConnect: false,
    forceNew: true
  });
  socket.on("connect", events.connected);
  socket.on("disconnect", events.disconnected);
  socket.on("connect_error", events.error);
  socket.on("print:context", events.context);
  socket.on("print:payment-holds", events.holds);
  socket.on("label:print", events.job);
  socket.connect();
  return {
    close() {
      socket.removeAllListeners();
      socket.disconnect();
    }
  };
};
