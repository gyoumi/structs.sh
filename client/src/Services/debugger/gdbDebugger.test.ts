import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendState, INITIAL_BACKEND_STATE } from '@/visualiser-debugger/Types/backendType';
import { GdbDebugger, GdbSocket } from './gdbDebugger';
import { DebuggerEvents } from './types';
import { createFakeSocket, FakeSocket } from './testing/fakeSocket';

const someState: BackendState = {
  ...INITIAL_BACKEND_STATE,
  frame_info: { file: 'main.c', line: '', line_num: 3, function: 'main' },
};

const createEvents = (): DebuggerEvents => ({
  sessionStarted: vi.fn(),
  compileError: vi.fn(),
  output: vi.fn(),
  state: vi.fn(),
  typeDeclaration: vi.fn(),
  sessionEnded: vi.fn(),
  compilerStatus: vi.fn(),
});

describe('GdbDebugger', () => {
  let socket: FakeSocket;
  let gdb: GdbDebugger;
  let events: DebuggerEvents;

  beforeEach(() => {
    socket = createFakeSocket();
    gdb = new GdbDebugger(socket as unknown as GdbSocket);
    events = createEvents();
    gdb.setEvents(events);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the code to the server to start a session', () => {
    gdb.start({ name: 'main.c', code: 'int main(void) { return 0; }' });

    expect(socket.sent).toEqual([{ event: 'mainDebug', args: ['int main(void) { return 0; }'] }]);
  });

  it('reports what the server sends', () => {
    const type = { file: 'main.c', line_num: '1', original_line: '', typeName: 'int' as const };

    socket.receive('mainDebug', 'Finished mainDebug event on server');
    socket.receive('sendBackendStateToUser', someState);
    socket.receive('compileError', ['error: oops']);
    socket.receive('sendStdoutToUser', 'hello');
    socket.receive('sendTypeDeclaration', type);
    socket.receive('sendBackendStateToUser', { exited: true });

    expect(events.sessionStarted).toHaveBeenCalledOnce();
    expect(events.state).toHaveBeenCalledExactlyOnceWith(someState);
    expect(events.compileError).toHaveBeenCalledWith(['error: oops']);
    expect(events.output).toHaveBeenCalledWith('hello');
    expect(events.typeDeclaration).toHaveBeenCalledWith(type);
    expect(events.sessionEnded).toHaveBeenCalledOnce();
  });

  it('only reports to the latest events', () => {
    const latest = createEvents();
    gdb.setEvents(latest);

    socket.receive('mainDebug');

    expect(events.sessionStarted).not.toHaveBeenCalled();
    expect(latest.sessionStarted).toHaveBeenCalledOnce();
  });

  it('resolves a step once the next state arrives', async () => {
    const step = gdb.step();

    expect(socket.sent).toEqual([{ event: 'executeNext', args: [] }]);
    socket.receive('sendBackendStateToUser', someState);

    await expect(step).resolves.toBe(true);
  });

  it('resolves a step as failed when no state arrives within 5 seconds', async () => {
    vi.useFakeTimers();
    const step = gdb.step();

    vi.advanceTimersByTime(5_000);

    await expect(step).resolves.toBe(false);
  });

  it('sends input, end of file and interrupts to the server', () => {
    gdb.sendStdin('42');
    gdb.sendEOF();
    gdb.interrupt();

    expect(socket.sent).toEqual([
      { event: 'send_stdin', args: ['42'] },
      { event: 'EOF', args: [] },
      { event: 'SIGINT', args: [] },
    ]);
  });

  it('closes the connection', () => {
    gdb.close();

    expect(socket.closed).toBe(true);
  });
});
