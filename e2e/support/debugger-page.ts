import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** What the page has shown of the compiler's download so far. */
type CompilerDownload = { seen: boolean; finished: boolean; lastStatus: string };

/** A pointer-name label and the value of the node it is drawn beside, or null if it is beside none. */
export type PointerLabel = { name: string; node: string | null };

/** One step's drawing: the highlighted line, every label, and the labels that are node values. */
export type DrawnStep = { line: number | null; labels: string[]; nodes: string[] };

/**
 * Console errors that are not the app's fault and are ignored by
 * consoleErrors(). Each is a development-only React warning: React prints it
 * from its development build only. The suite runs against the production
 * build by default, where neither is ever printed (checked by stepping
 * linked_list.c and bst.c on it with no filter: no console errors at all), so
 * these only matter when E2E_BASE_URL points at the dev server. They are kept
 * so that a dev-server run still checks for real errors. Neither breaks what
 * the student sees.
 */
const DEV_ONLY_WARNINGS: RegExp[] = [
  // React 19 warns when a library (MUI here) reads element.ref.
  /^Accessing element\.ref was removed in React 19\./,
  // A component passes a non-DOM prop through to a DOM element.
  /^React does not recognize the `[^`]+` prop on a DOM element\./,
];

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

  /** Step buttons clicked so far (forward and back), and the line highlighted after each. */
  private stepsTaken = 0;
  private readonly lineAfterStep: (number | null)[] = [];
  private readonly errors: { step: number; text: string }[] = [];

  constructor(readonly page: Page) {
    // Listening from the start catches errors on load and between steps too.
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (DEV_ONLY_WARNINGS.some((warning) => warning.test(text))) return;
      this.errors.push({ step: this.stepsTaken, text: `console.error: ${text}` });
    });
    page.on('pageerror', (error) => {
      this.errors.push({ step: this.stepsTaken, text: `uncaught ${error.name}: ${error.message}` });
    });
  }

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
    await this.openPrograms(name);
  }

  /**
   * Opens the debugger with each e2e/programs/<name> as a file in one folder,
   * and selects the first. selectProgram() switches between them without
   * reloading the page.
   */
  async openPrograms(...names: string[]): Promise<void> {
    const files = Object.fromEntries(
      names.map((name) => [
        name,
        {
          name,
          path: `root/e2e/${name}`,
          type: 'file',
          parentPath: 'root/e2e',
          data: readFileSync(new URL(`../programs/${name}`, import.meta.url), 'utf8'),
        },
      ]),
    );
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
          children: files,
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
    await this.selectProgram(names[0]);
  }

  /** Selects another file opened by openPrograms(), as the one Compile builds. */
  async selectProgram(name: string): Promise<void> {
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

  /**
   * Starts listing every request the browser makes from now on, from the page
   * and its Web Workers alike, as "METHOD url". The returned list keeps
   * growing as requests are made, so read it at the end of the test.
   */
  recordRequests(): string[] {
    const requests: string[] = [];
    this.page.context().on('request', (request) => {
      requests.push(`${request.method()} ${request.url()}`);
    });
    return requests;
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
    this.stepsTaken++;
    try {
      await this.stepForwardButton.click({ timeout: 10_000 });
    } catch {
      throw new Error(
        `could not step forward: the step button stayed disabled for 10000ms; ` +
          `lines visited: [${this.visitedLines.join(', ')}]; the console shows: ${await this.consoleForError()}`,
      );
    }
    const active = await this.waitUntilIdle();
    const line = await this.currentLine();
    this.lineAfterStep[this.stepsTaken] = line;
    this.recordLine(line);
    return active;
  }

  async stepBack(): Promise<void> {
    this.stepsTaken++;
    await this.stepBackButton.click();
    await this.waitUntilIdle();
    this.lineAfterStep[this.stepsTaken] = await this.currentLine();
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

  /**
   * The labels a student can see once the drawing has stopped changing. The
   * visualiser redraws a moment after a step and fades nodes in and out, and
   * a node it hides stays in the page at opacity 0, so this counts a label
   * only when it is at least half opaque. Settled means the same labels, at
   * the same opacity, in reads `stableMs` apart.
   */
  async settledVisibleLabels(stableMs = 500, timeoutMs = 10_000): Promise<string[]> {
    // Both start unread, so settling takes two real reads `stableMs` apart.
    let previous: string | undefined;
    let current: string | undefined;
    try {
      await expect
        .poll(
          async () => {
            previous = current;
            current = JSON.stringify(await this.labelsWithOpacity());
            return previous !== undefined && current === previous;
          },
          { intervals: [stableMs], timeout: timeoutMs },
        )
        .toBe(true);
    } catch {
      throw new Error(
        `the visualiser's drawing kept changing for ${timeoutMs}ms; last labels and opacities: ${current}`,
      );
    }
    return (JSON.parse(current ?? '[]') as { text: string; opacity: number }[])
      .filter(({ opacity }) => opacity >= 0.5)
      .map(({ text }) => text);
  }

  /**
   * Steps forward until the session ends, reading the visible, settled drawing
   * after every step. Returns each step's highlighted line and labels, in order.
   */
  async drawingAtEachStep(maxSteps = 60): Promise<DrawnStep[]> {
    const steps: DrawnStep[] = [];
    for (let i = 0; i < maxSteps; i++) {
      const active = await this.stepForward();
      const labels = await this.settledVisibleLabels();
      steps.push({ line: await this.currentLine(), labels, nodes: DebuggerPage.nodeValues(labels) });
      if (!active) return steps;
    }
    throw new Error(
      `session still running after ${maxSteps} steps; lines visited: [${this.visitedLines.join(', ')}]`,
    );
  }

  /**
   * The pointer names drawn once the drawing has stopped moving, each with
   * the node it points at, sorted by name. The visualiser draws a pointer as
   * an arrow below its node with the name under it, so a name belongs to the
   * node above it that is nearest horizontally. Names stacked for one node
   * ("head," over "n") each count, without the comma.
   */
  async settledPointerLabels(stableMs = 500, timeoutMs = 10_000): Promise<PointerLabel[]> {
    let previous: string | undefined;
    let current: string | undefined;
    try {
      await expect
        .poll(
          async () => {
            previous = current;
            current = JSON.stringify(await this.labelsWithPlace());
            return previous !== undefined && current === previous;
          },
          { intervals: [stableMs], timeout: timeoutMs },
        )
        .toBe(true);
    } catch {
      throw new Error(`the visualiser's drawing kept moving for ${timeoutMs}ms; last labels: ${current}`);
    }
    const visible = (JSON.parse(current ?? '[]') as { text: string; opacity: number; x: number; y: number }[]).filter(
      ({ opacity }) => opacity >= 0.5,
    );
    const isNode = (text: string) => DebuggerPage.nodeValues([text]).length === 1;
    const nodes = visible.filter(({ text }) => isNode(text));
    return visible
      .filter(({ text }) => !isNode(text) && text.trim() !== '')
      .map((label) => {
        const above = nodes
          .filter((node) => node.y < label.y)
          .sort((a, b) => Math.abs(a.x - label.x) - Math.abs(b.x - label.x) || b.y - a.y);
        return { name: label.text.replace(/,$/, ''), node: above[0]?.text ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * The labels that are node values: a number, or "??" for a node whose value
   * isn't set yet. The others are pointer names ("list", "head, n").
   */
  static nodeValues(labels: string[]): string[] {
    return labels.filter((label) => /^(-?\d+|\?\?)$/.test(label));
  }

  /**
   * Errors the page logged with console.error, and exceptions it didn't
   * catch, since it was opened, each with the step it came after, as
   * "after step 3 (line 9): console.error: ... (x2)". The same error repeated
   * after one step is listed once with its count. Development-only React
   * warnings are left out (see DEV_ONLY_WARNINGS).
   */
  consoleErrors(): string[] {
    const counted = new Map<string, number>();
    for (const { step, text } of this.errors) {
      const when =
        step === 0
          ? 'before the first step'
          : `after step ${step} (line ${this.lineAfterStep[step] ?? 'not read yet'})`;
      const key = `${when}: ${text}`;
      counted.set(key, (counted.get(key) ?? 0) + 1);
    }
    return [...counted].map(([key, count]) => (count > 1 ? `${key} (x${count})` : key));
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

  /**
   * Each label in the visualiser with how opaque it is, counting its
   * ancestors' opacity, rounded to 0.01. Hidden or undisplayed counts as 0.
   */
  private async labelsWithOpacity(): Promise<{ text: string; opacity: number }[]> {
    return this.visualiser.locator('svg text').evaluateAll((labels) =>
      labels.map((label) => {
        let opacity = 1;
        for (let el: Element | null = label; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          opacity *= style.display === 'none' || style.visibility === 'hidden' ? 0 : Number(style.opacity);
        }
        return { text: label.textContent ?? '', opacity: Math.round(opacity * 100) / 100 };
      }),
    );
  }

  /** Each label with its opacity (as in labelsWithOpacity) and the centre of its box on screen, rounded to 1px. */
  private async labelsWithPlace(): Promise<{ text: string; opacity: number; x: number; y: number }[]> {
    return this.visualiser.locator('svg text').evaluateAll((labels) =>
      labels.map((label) => {
        let opacity = 1;
        for (let el: Element | null = label; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          opacity *= style.display === 'none' || style.visibility === 'hidden' ? 0 : Number(style.opacity);
        }
        const box = label.getBoundingClientRect();
        return {
          text: label.textContent ?? '',
          opacity: Math.round(opacity * 100) / 100,
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        };
      }),
    );
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
