import { describe, expect, it, vi } from 'vitest';
import { compileC, loadClang } from './compile';

// Its own file, so clang hasn't been loaded by another test yet.
describe('loadClang', () => {
  it('reports download progress up to the full size, once', async () => {
    const progress = vi.fn();

    await loadClang(progress);
    const [done, total] = progress.mock.lastCall!;
    expect(total).toBeGreaterThan(50_000_000);
    expect(done).toBe(total);

    progress.mockClear();
    await loadClang(progress);
    await compileC('main.c', 'int main(void) { return 0; }\n');
    expect(progress).not.toHaveBeenCalled();
  }, 60_000);
});
