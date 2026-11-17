type Listener = (...args: unknown[]) => void;

/**
 * A stand-in for a Socket.IO client socket. `sent` records what the page
 * sent to the server, and `receive` plays an event from the server.
 */
export const createFakeSocket = () => {
  const listeners = new Map<string, Set<Listener>>();

  const socket = {
    sent: [] as { event: string; args: unknown[] }[],
    closed: false,
    on(event: string, listener: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return socket;
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
      return socket;
    },
    onAny() {
      return socket;
    },
    emit(event: string, ...args: unknown[]) {
      socket.sent.push({ event, args });
      return socket;
    },
    close() {
      socket.closed = true;
      return socket;
    },
    receive(event: string, ...args: unknown[]) {
      [...(listeners.get(event) ?? [])].forEach((listener) => listener(...args));
    },
  };

  return socket;
};

export type FakeSocket = ReturnType<typeof createFakeSocket>;
