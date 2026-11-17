import { io, Socket } from 'socket.io-client';
import { isProgramEnd } from '@/visualiser-debugger/Types/backendType';
import { ServerToClientEvent } from '../socketClientType';
import { ClientToServerEvents } from '../socketServerType';
import { Debugger, DebuggerEvents, SourceFile } from './types';

export type GdbSocket = Socket<ServerToClientEvent, ClientToServerEvents>;

const URL = import.meta.env.VITE_DEBUGGER_URL || 'http://localhost:8000';
const STEP_TIMEOUT_MS = 5000;

export const connectToGdb = (): GdbSocket => io(URL, { path: '/dapi' });

/** The debugger that runs GDB on the server, over Socket.IO. */
export class GdbDebugger implements Debugger {
  readonly kind = 'gdb';

  private events: DebuggerEvents | null = null;

  constructor(private readonly socket: GdbSocket) {
    socket.on('connect', () => console.log('Socket Connected!'));
    socket.onAny((eventName, ...args) => console.log(`Event received: ${eventName}`, args));

    socket.on('mainDebug', () => this.events?.sessionStarted());
    socket.on('sendBackendStateToUser', (state) => {
      if (isProgramEnd(state)) this.events?.sessionEnded();
      else this.events?.state(state);
    });
    socket.on('compileError', (errors) => this.events?.compileError(errors));
    socket.on('sendStdoutToUser', (output) => this.events?.output(output));
    socket.on('sendTypeDeclaration', (type) => this.events?.typeDeclaration(type));
  }

  setEvents(events: DebuggerEvents) {
    this.events = events;
  }

  start({ code }: SourceFile) {
    this.socket.emit('mainDebug', code);
  }

  step() {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;

      const finish = (gotState: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        this.socket.off('sendBackendStateToUser', onState);
        resolve(gotState);
      };
      const onState = () => finish(true);

      timer = setTimeout(() => finish(false), STEP_TIMEOUT_MS);
      this.socket.on('sendBackendStateToUser', onState);
      this.socket.emit('executeNext');
    });
  }

  sendStdin(input: string) {
    this.socket.emit('send_stdin', input);
  }

  sendEOF() {
    this.socket.emit('EOF');
  }

  interrupt() {
    this.socket.emit('SIGINT');
  }

  close() {
    this.socket.close();
  }
}
