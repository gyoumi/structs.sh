import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import { createDebugger, debuggerKindFromSearch } from './createDebugger';

vi.mock('socket.io-client', async () => {
  const { createFakeSocket } = await import('./testing/fakeSocket');
  return { io: vi.fn(() => createFakeSocket()) };
});

describe('debuggerKindFromSearch', () => {
  it('uses the wasm debugger by default', () => {
    expect(debuggerKindFromSearch('')).toBe('wasm');
  });

  it('uses GDB with ?debugger=gdb', () => {
    expect(debuggerKindFromSearch('?debugger=gdb')).toBe('gdb');
  });

  it('uses the wasm debugger for any other value', () => {
    expect(debuggerKindFromSearch('?debugger=wasm')).toBe('wasm');
    expect(debuggerKindFromSearch('?debugger=lldb')).toBe('wasm');
  });
});

describe('createDebugger', () => {
  beforeEach(() => {
    vi.mocked(io).mockClear();
  });

  it('connects to the GDB server for GDB', () => {
    const created = createDebugger('gdb');

    expect(created.kind).toBe('gdb');
    expect(io).toHaveBeenCalledWith(expect.any(String), { path: '/dapi' });
  });

  it('never connects to the server for wasm', () => {
    const created = createDebugger('wasm');

    expect(created.kind).toBe('wasm');
    expect(io).not.toHaveBeenCalled();
  });
});
