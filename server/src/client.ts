import type { ServerMessage } from '@mp-fps/shared';
import type { WebSocket } from 'ws';
import { randomId } from './ids';
import type { Room } from './room';

/** One connected browser. */
export class Client {
  readonly id = randomId(8);
  name = '';
  room: Room | null = null;
  ping = 0;

  constructor(private readonly socket: WebSocket) {}

  get isIdentified(): boolean {
    return this.name !== '';
  }

  send(message: ServerMessage): void {
    this.sendRaw(JSON.stringify(message));
  }

  /** For messages that were already serialized once for many clients. */
  sendRaw(json: string): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(json);
  }
}
