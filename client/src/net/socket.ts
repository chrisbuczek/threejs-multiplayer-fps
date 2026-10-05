import type { ClientMessage, ServerMessage } from '@mp-fps/shared';

type MessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
type Handler = (message: ServerMessage) => void;

/** Typed WebSocket wrapper: send(ClientMessage) and on('type', handler). */
export class GameSocket {
  private socket: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();
  private closeHandler: (() => void) | null = null;

  constructor(private readonly url: string) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error(`Cannot reach the game server at ${this.url}`));
      socket.onclose = () => this.closeHandler?.();
      socket.onmessage = (event) => this.dispatch(JSON.parse(event.data as string) as ServerMessage);
      this.socket = socket;
    });
  }

  send(message: ClientMessage): void {
    if (this.isOpen) this.socket!.send(JSON.stringify(message));
  }

  /** Subscribes to one message type. Returns an unsubscribe function. */
  on<T extends ServerMessage['type']>(type: T, handler: (message: MessageOf<T>) => void): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    const set = this.handlers.get(type)!;
    set.add(handler as Handler);
    return () => set.delete(handler as Handler);
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  private dispatch(message: ServerMessage): void {
    // Answer latency pings right away so the scoreboard can show ping.
    if (message.type === 'ping') this.send({ type: 'pong', t: message.t });
    this.handlers.get(message.type)?.forEach((handler) => handler(message));
  }
}
