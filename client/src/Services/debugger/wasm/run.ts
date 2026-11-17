// WASI preview 1 error numbers, from wasi_snapshot_preview1's errno type.
const SUCCESS = 0;
const BADF = 8;
const NOSYS = 52;
const SPIPE = 70;

const STDIN = 0;
const STDOUT = 1;
const STDERR = 2;

const FILETYPE_CHARACTER_DEVICE = 2;
// The fd_read (bit 1) and fd_write (bit 6) rights, and not fd_seek or fd_tell.
const STDIO_RIGHTS = 0x42n;

// wasi_snapshot_preview1's clock ids. The process and thread CPU-time clocks
// fall back to the monotonic clock.
const CLOCK_REALTIME = 0;

// crypto.getRandomValues fills at most this many bytes per call.
const MAX_RANDOM_BYTES = 65_536;

export type RunOptions = {
  /** Called with stdout and stderr text as the program writes it. */
  onOutput: (text: string) => void;
};

/** Thrown by proc_exit to unwind out of the program. */
class ProcExit {
  constructor(readonly code: number) {}
}

const isStdio = (fd: number) => fd === STDIN || fd === STDOUT || fd === STDERR;

/**
 * Runs a WASI program compiled by compileC to completion. stdout and stderr
 * stream through onOutput, stdin is empty, and there are no arguments,
 * environment variables or files. Rejects with a WebAssembly.RuntimeError if
 * the program traps.
 */
export const runWasi = async (
  wasm: Uint8Array<ArrayBuffer>,
  { onOutput }: RunOptions
): Promise<{ exitCode: number }> => {
  const module = await WebAssembly.compile(wasm);
  let memory: WebAssembly.Memory | undefined;
  // Memory can grow while the program runs, which replaces its buffer, so
  // look it up on every call.
  const view = () => new DataView(memory!.buffer);
  const bytes = (pointer: number, length: number) =>
    new Uint8Array(memory!.buffer, pointer, length);

  // One decoder per stream, so a character split across two writes still
  // decodes.
  const decoders = new Map([
    [STDOUT, new TextDecoder()],
    [STDERR, new TextDecoder()],
  ]);
  const flushDecoders = () =>
    decoders.forEach((decoder) => {
      const rest = decoder.decode();
      if (rest) onOutput(rest);
    });

  const writeEmptyList = (countPointer: number, sizePointer: number) => {
    view().setUint32(countPointer, 0, true);
    view().setUint32(sizePointer, 0, true);
    return SUCCESS;
  };

  const wasi: Record<string, (...args: never[]) => number> = {
    fd_write(fd: number, iovs: number, iovsLength: number, writtenPointer: number) {
      const decoder = decoders.get(fd);
      if (!decoder) return BADF;
      let written = 0;
      let text = '';
      for (let i = 0; i < iovsLength; i++) {
        const pointer = view().getUint32(iovs + i * 8, true);
        const length = view().getUint32(iovs + i * 8 + 4, true);
        text += decoder.decode(bytes(pointer, length), { stream: true });
        written += length;
      }
      if (text) onOutput(text);
      view().setUint32(writtenPointer, written, true);
      return SUCCESS;
    },
    // stdin is always at its end.
    fd_read(fd: number, _iovs: number, _iovsLength: number, readPointer: number) {
      if (fd !== STDIN) return BADF;
      view().setUint32(readPointer, 0, true);
      return SUCCESS;
    },
    // Describe stdin, stdout and stderr as an unseekable character device:
    // libc then treats them as a terminal and line-buffers stdout, so output
    // arrives as each line is printed, in order with stderr.
    fd_fdstat_get(fd: number, statPointer: number) {
      if (!isStdio(fd)) return BADF;
      const stat = view();
      stat.setUint8(statPointer, FILETYPE_CHARACTER_DEVICE);
      stat.setUint16(statPointer + 2, 0, true);
      stat.setBigUint64(statPointer + 8, STDIO_RIGHTS, true);
      stat.setBigUint64(statPointer + 16, 0n, true);
      return SUCCESS;
    },
    fd_seek: (fd: number) => (isStdio(fd) ? SPIPE : BADF),
    fd_close: (fd: number) => (isStdio(fd) ? SUCCESS : BADF),
    // No preopened directories, so there are no files to open.
    fd_prestat_get: () => BADF,
    proc_exit(code: number) {
      throw new ProcExit(code);
    },
    args_sizes_get: writeEmptyList,
    args_get: () => SUCCESS,
    environ_sizes_get: writeEmptyList,
    environ_get: () => SUCCESS,
    clock_time_get(id: number, _precision: bigint, timePointer: number) {
      const milliseconds = id === CLOCK_REALTIME ? Date.now() : performance.now();
      view().setBigUint64(timePointer, BigInt(Math.round(milliseconds * 1e6)), true);
      return SUCCESS;
    },
    random_get(pointer: number, length: number) {
      for (let offset = 0; offset < length; offset += MAX_RANDOM_BYTES) {
        crypto.getRandomValues(
          bytes(pointer + offset, Math.min(MAX_RANDOM_BYTES, length - offset))
        );
      }
      return SUCCESS;
    },
  };

  // Anything else the program imports, such as path_open, reports that it
  // isn't supported rather than failing to instantiate.
  WebAssembly.Module.imports(module)
    .filter(
      ({ module: name, name: field }) => name === 'wasi_snapshot_preview1' && !(field in wasi)
    )
    .forEach(({ name: field }) => {
      wasi[field] = () => NOSYS;
    });

  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi });
  memory = instance.exports.memory as WebAssembly.Memory;

  try {
    (instance.exports._start as () => void)();
    return { exitCode: 0 };
  } catch (error) {
    if (error instanceof ProcExit) return { exitCode: error.code };
    throw error;
  } finally {
    flushDecoders();
  }
};
