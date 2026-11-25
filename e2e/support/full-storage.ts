import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A browser whose `localStorage` is full: from before the first page script runs, every
 * `localStorage.setItem` throws `QuotaExceededError` (reads still work). Also collects the page's
 * uncaught errors, and drives the debugger's file tree, which keeps its files in `localStorage`.
 */
export class FullStorage {
  private readonly errors: string[] = [];

  constructor(readonly page: Page) {
    page.on('pageerror', (error) => this.errors.push(`uncaught ${error.name}: ${error.message}`));
  }

  /**
   * Makes every later `localStorage.setItem` throw, on every page this tab loads. The debugger's guided
   * tour is marked done first (as the other debugger tests do), so the file tree isn't covered by it.
   */
  async fill(): Promise<void> {
    await this.page.addInitScript(() => {
      try {
        window.localStorage.setItem('Onboarding', 'done');
      } catch {
        // already full from an earlier load
      }
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value: () => {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        },
      });
    });
  }

  /** The uncaught errors thrown in the page since this was created, as `uncaught <name>: <message>`. */
  pageErrors(): string[] {
    return [...this.errors];
  }

  /**
   * Opens `path` and checks the page isn't blank: some text shows. The failure lists the page's uncaught
   * errors, which is what blanks it.
   */
  async visit(path: string, context: string): Promise<void> {
    await this.page.goto(path);
    await expect
      .poll(() => this.page.locator('body').innerText().then((text) => text.trim().length), {
        message: `${context}: ${path} should render (show some text), not a blank page. Uncaught errors so far: ${JSON.stringify(this.errors)}`,
      })
      .toBeGreaterThan(0);
  }

  /** Opens /debugger and waits for its file tree's `root` folder. */
  async openDebugger(context: string): Promise<void> {
    await this.page.goto('/debugger');
    await expect(this.page.getByText('root', { exact: true }), `${context}: /debugger should show its file tree, starting with the "root" folder`).toBeVisible();
  }

  /** Opens `root/<folder>/<file>` in the debugger's file tree, as a player clicks through it. */
  async openExample(folder: string, file: string, context: string): Promise<void> {
    await this.page.getByText('root', { exact: true }).click();
    const dir = this.page.getByText(folder, { exact: true });
    await expect(dir, `${context}: opening "root" in the file tree should show the "${folder}" folder`).toBeVisible();
    await dir.click();
    const leaf = this.page.getByText(file, { exact: true });
    await expect(leaf, `${context}: opening "${folder}" should show "${file}"`).toBeVisible();
    await leaf.click();
  }

  /** The debugger's code editor shows `text`. */
  async expectEditorShows(text: string, context: string): Promise<void> {
    await expect(this.editor, `${context}: the code editor should show the opened file (text "${text}")`).toContainText(text);
  }

  /** Creates a file named `name` with the file tree's "Create new file" button and dialog. */
  async createFile(name: string, context: string): Promise<void> {
    const create = this.page.getByRole('button', { name: 'Create new file', exact: true });
    await expect(create, `${context}: the file tree should have a "Create new file" button`).toBeVisible();
    await create.click();
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);
    await this.page.getByRole('button', { name: 'Create', exact: true }).click();
  }

  /** The file tree lists `name`. */
  async expectInFileTree(name: string, context: string): Promise<void> {
    await expect(this.page.getByText(name, { exact: true }), `${context}: the file tree should list "${name}"`).toBeVisible();
  }

  private get editor(): Locator {
    return this.page.locator('.ace_editor');
  }
}
