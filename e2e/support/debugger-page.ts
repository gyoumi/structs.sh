import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** What the page has shown of the compiler's download so far. */
type CompilerDownload = { seen: boolean; finished: boolean; lastStatus: string };

/**
 * Drives the visual debugger page the way a user would.
 *
 * This is the only file that knows about the page's markup. Tests describe
 * behaviour ("step until line 4", "the list shows 1, 2, 3"), so when the UI or
 * the debugger engine changes, this file is what gets updated, not the tests.
 */
export class DebuggerPage {
  /** Every line the editor highlighted, in order, since the session started. */
  readonly visitedLines: number[] = [];

  constructor(readonly page: Page) {}

  // ---------------------------------------------------------------- locators

  get compileButton(): Locator {
    return this.page.getByRole('button', { name: 'Compile', exact: true });
  }

  get stepForwardButton(): Locator {
    return this.page.getByRole('button').filter({ has: this.page.getByTestId('RedoIcon') });
  }

  get stepBackButton(): Locator {
    return this.page.getByRole('button').filter({ has: this.page.getByTestId('UndoIcon') });
  }

  get console(): Locator {
    return this.page.locator('.Onboarding-codeEditor [role="button"][tabindex="0"]');
  }

  get configurePanel(): Locator {
    return this.page.locator('.Onboarding-configureMenu');
  }

  get visualiser(): Locator {
    return this.page.locator('.Onboarding-visualiserBox');
  }

  // ----------------------------------------------------------------- actions

  /** Opens the debugger with e2e/programs/<name> as the only file, selected. */
  async openProgram(name: string): Promise<void> {
    const source = readFileSync(new URL(`../programs/${name}`, import.meta.url), 'utf8');
    const fileSystem = {
      name: 'root',
      path: 'root',
      type: 'dir',
      children: {
        e2e: {
          name: 'e2e',
          path: 'root/e2e',
          type: 'dir',
          parentPath: 'root',
          children: {
            [name]: { name, path: `root/e2e/${name}`, type: 'file', parentPath: 'root/e2e', data: source },
          },
        },
      },
    };

    await this.page.addInitScript((fs) => {
      localStorage.setItem('Onboarding', 'done'); // skip the guided tour
      localStorage.setItem('fileSystem', JSON.stringify(fs));
    }, fileSystem);
    await this.watchCompilerDownload();

    await this.page.goto('/debugger');
    await this.page.getByText('root', { exact: true }).click();
    await this.page.getByText('e2e', { exact: true }).click();
    await this.page.getByText(name, { exact: true }).click();
  }

  /**
   * Opens one of the examples the debugger comes with, as a new visitor
   * sees them: `folder/name` under root.
   */
  async openExample(folder: string, name: string): Promise<void> {
    await this.page.addInitScript(() => {
      localStorage.setItem('Onboarding', 'done'); // skip the guided tour
    });
    await this.watchCompilerDownload();
    await this.page.goto('/debugger');
    await this.page.getByText('root', { exact: true }).click();
    await this.page.getByText(folder, { exact: true }).click();
    await this.page.getByText(name, { exact: true }).click();
  }

  /**
   * Waits until the compiler has finished downloading: the "Loading compiler
   * N%" status appeared and has gone again. Call it after openProgram().
   *
   * The status can come and go before this is called, or not be shown yet, so
   * this reads what a watcher installed before the page loaded saw, rather
   * than the status as it is now.
   */
  async waitForCompilerDownload(timeoutMs = 60_000): Promise<void> {
    try {
      await this.page.waitForFunction(
        () => (window as unknown as { __e2eCompilerDownload?: CompilerDownload }).__e2eCompilerDownload?.finished,
        null,
        { timeout: timeoutMs },
      );
    } catch {
      const seen = await this.page.evaluate(
        () => (window as unknown as { __e2eCompilerDownload?: CompilerDownload }).__e2eCompilerDownload,
      );
      throw new Error(
        `the compiler did not finish downloading within ${timeoutMs}ms: ` +
          (seen?.lastStatus
            ? `the status still read "${seen.lastStatus}"`
            : 'the "Loading compiler" status never appeared'),
      );
    }
  }

  /**
   * Takes the browser offline for the rest of the test: every request the
   * page or its workers make from now on fails, as with the network off.
   */
  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true);
  }

  /** Types a line into the console as the program's input, and presses Enter. */
  async typeLine(text: string): Promise<void> {
    await this.console.click();
    await this.page.keyboard.type(text);
    await this.page.keyboard.press('Enter');
  }

  /** Presses Ctrl+D in the console, ending the program's input. */
  async sendEndOfFile(): Promise<void> {
    await this.console.click();
    await this.page.keyboard.press('Control+d');
  }

  /** Compiles the open program and waits until stepping is possible. */
  async startSession(): Promise<void> {
    await this.compileButton.click();
    try {
      await expect(this.stepForwardButton).toBeEnabled();
    } catch {
      throw new Error(
        `debug session did not start: after clicking Compile the step button stayed disabled; ` +
          `the console shows: ${await this.consoleForError()}`,
      );
    }
  }

  /** Clicks step forward once. Returns false once the client reports the session ended. */
  async stepForward(): Promise<boolean> {
    try {
      await this.stepForwardButton.click({ timeout: 10_000 });
    } catch {
      throw new Error(
        `could not step forward: the step button stayed disabled for 10000ms; ` +
          `lines visited: [${this.visitedLines.join(', ')}]; the console shows: ${await this.consoleForError()}`,
      );
    }
    const active = await this.waitUntilIdle();
    this.recordLine(await this.currentLine());
    return active;
  }

  async stepBack(): Promise<void> {
    await this.stepBackButton.click();
    await this.waitUntilIdle();
  }

  /** Steps forward until the editor highlights `line`. */
  async stepUntilLine(line: number, maxClicks = 60): Promise<void> {
    for (let i = 0; i < maxClicks; i++) {
      if ((await this.currentLine()) === line) return;
      if (!(await this.stepForward())) break;
    }
    if ((await this.currentLine()) === line) return;
    throw new Error(
      `never reached line ${line}; lines visited: [${this.visitedLines.join(', ')}]; ` +
        `the console shows: ${await this.consoleForError()}`,
    );
  }

  /** Steps forward until the session ends. Returns the lines visited. */
  async runToEnd(maxClicks = 60): Promise<number[]> {
    // If the highlighted line stops changing but stepping stays enabled, the
    // program has most likely finished without the session noticing.
    const stallLimit = 4;
    let stalled = 0;
    for (let i = 0; i < maxClicks; i++) {
      const before = await this.currentLine();
      if (!(await this.stepForward())) return this.visitedLines;
      stalled = (await this.currentLine()) === before ? stalled + 1 : 0;
      if (stalled >= stallLimit) {
        throw new Error(
          `stepping stopped making progress but the session did not end; ` +
            `lines visited: [${this.visitedLines.join(', ')}]; the console shows: ${await this.consoleForError()}`,
        );
      }
    }
    throw new Error(
      `session still running after ${maxClicks} steps; the console shows: ${await this.consoleForError()}`,
    );
  }

  /**
   * Steps forward up to `maxSteps` times, for a program that may wait for
   * input or loop forever. Stops early when the session ends, or once
   * `stallLimit` steps in a row stay on the same line. Returns the lines
   * visited.
   */
  async stepAWhile(maxSteps = 25, stallLimit = 3): Promise<number[]> {
    let stalled = 0;
    for (let i = 0; i < maxSteps && stalled < stallLimit; i++) {
      const before = await this.currentLine();
      if (!(await this.stepForward())) break;
      stalled = (await this.currentLine()) === before ? stalled + 1 : 0;
    }
    return this.visitedLines;
  }

  // ----------------------------------------------------------------- reading

  /** The line the editor currently highlights, or null if none. */
  async currentLine(): Promise<number | null> {
    return this.page.evaluate(() => {
      type Marker = { clazz: string; range: { start: { row: number } } };
      const el = document.querySelector('.ace_editor') as
        | (Element & { env?: { editor: { session: { getMarkers(front: boolean): Record<string, Marker> } } } })
        | null;
      const markers = Object.values(el?.env?.editor.session.getMarkers(false) ?? {});
      const marker = markers.find((m) => m.clazz === 'current-line-marker');
      // Before the first step the marker sits on "line 0".
      return marker && marker.range.start.row >= 0 ? marker.range.start.row + 1 : null;
    });
  }

  /** Labels drawn in the visualiser: node values and pointer names. */
  async visualisedLabels(): Promise<string[]> {
    return this.visualiser.locator('svg text').allTextContents();
  }

  // ----------------------------------------------------------------- helpers

  /**
   * Before the page loads, starts watching for the "Loading compiler" status,
   * so waitForCompilerDownload() knows it came and went even if that happened
   * before it was called.
   */
  private async watchCompilerDownload(): Promise<void> {
    await this.page.addInitScript(() => {
      const download: CompilerDownload = { seen: false, finished: false, lastStatus: '' };
      (window as unknown as { __e2eCompilerDownload: CompilerDownload }).__e2eCompilerDownload = download;
      const check = () => {
        const status = Array.from(document.querySelectorAll('[role="status"]')).find((el) =>
          el.textContent?.startsWith('Loading compiler'),
        );
        if (status) {
          download.seen = true;
          download.lastStatus = status.textContent ?? '';
        } else if (download.seen) {
          download.finished = true;
        }
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
    });
  }

  /**
   * The console's text as one quoted line, for error messages, so a failure
   * says what the program printed or why it could not run.
   */
  private async consoleForError(): Promise<string> {
    const text = await this.console.innerText({ timeout: 2_000 }).catch(() => null);
    return text === null ? '(the console could not be read)' : JSON.stringify(text.trim());
  }

  private recordLine(line: number | null) {
    if (line !== null && this.visitedLines.at(-1) !== line) this.visitedLines.push(line);
  }

  /**
   * A step is finished when the step button is usable again. The session has
   * ended only if the client showed its "Debug session ended." toast; a button
   * that stays disabled without it is a stall and fails. Returns whether the
   * session is still active.
   *
   * The click handler disables the button before it asks the server for the
   * next step, and React applies that before click() returns, so there is no
   * gap where the old enabled state could be read as "finished".
   */
  private async waitUntilIdle(timeoutMs = 10_000): Promise<boolean> {
    const sessionEnded = this.page.getByText('Debug session ended.', { exact: true });
    const stepReady = this.stepForwardButton.and(this.page.locator(':enabled'));
    try {
      await expect(sessionEnded.or(stepReady).first()).toBeVisible({ timeout: timeoutMs });
    } catch {
      throw new Error(
        `step did not finish within ${timeoutMs}ms: the step button stayed disabled and no ` +
          `"Debug session ended." toast appeared; lines visited: [${this.visitedLines.join(', ')}]; ` +
          `the console shows: ${await this.consoleForError()}`,
      );
    }
    return !(await sessionEnded.isVisible());
  }
}
