import { describe, expect, it, vi } from 'vitest';
import { compileC, loadClang } from './clang';

// Its own file, so clang hasn't been loaded by another test yet.
describe('loadClang', () => {
  it('reports download progress up to the full size, once', async () => {
    const progress = vi.fn();

    await loadClang(progress);
    const [done, total] = progress.mock.lastCall!;
    expect(
      total,
      'loadClang(), first load: total bytes in the last progress report'
    ).toBeGreaterThan(50_000_000);
    expect(
      done,
      `loadClang(), first load: bytes done in the last progress report, of ${total}`
    ).toBe(total);

    progress.mockClear();
    await loadClang(progress);
    await compileC('main.c', 'int main(void) { return 0; }\n');
    expect(
      progress,
      'loadClang() again, then a compile, once clang has loaded: progress reports'
    ).not.toHaveBeenCalled();
  }, 60_000);
});
