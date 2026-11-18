import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { debuggerKind } from './debugger-kind';

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

    await this.page.goto(debuggerKind === 'gdb' ? '/debugger?debugger=gdb' : '/debugger');
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
    await this.page.goto(debuggerKind === 'gdb' ? '/debugger?debugger=gdb' : '/debugger');
    await this.page.getByText('root', { exact: true }).click();
    await this.page.getByText(folder, { exact: true }).click();
    await this.page.getByText(name, { exact: true }).click();
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
    await expect(this.stepForwardButton, 'debug session did not start').toBeEnabled();
  }

  /** Clicks step forward once. Returns false once the client reports the session ended. */
  async stepForward(): Promise<boolean> {
    await this.stepForwardButton.click();
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
    throw new Error(`never reached line ${line}; lines visited: [${this.visitedLines.join(', ')}]`);
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
            `lines visited: [${this.visitedLines.join(', ')}]`,
        );
      }
    }
    throw new Error(`session still running after ${maxClicks} steps`);
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
    await expect(
      sessionEnded.or(stepReady).first(),
      `step did not finish within ${timeoutMs}ms: the step button stayed disabled and no ` +
        `"Debug session ended." toast appeared; lines visited: [${this.visitedLines.join(', ')}]`,
    ).toBeVisible({ timeout: timeoutMs });
    return !(await sessionEnded.isVisible());
  }
}
