import { expect, type Locator, type Page } from '@playwright/test';
import type { ListOperation } from './daily-list-fixtures';

const operationText = (op: ListOperation) => (op.kind === 'insert' ? `insert(${op.value}, ${op.index})` : `delete(${op.index})`);
const OPERATION_TEXT = /insert\(\s*-?\d+\s*,\s*-?\d+\s*\)|delete\(\s*-?\d+\s*\)/;

/**
 * The Index drift operation-list builder on /daily: the `Start list` and `Target list`, the
 * `Operation builder` group that adds `insert` and `delete` steps, and the `Operation list` it builds.
 * See "The daily game" in e2e/README.md for the contract.
 */
export class DailyOperationBuilder {
  constructor(readonly page: Page) {}

  private get builder(): Locator {
    return this.page.getByRole('group', { name: 'Operation builder', exact: true });
  }

  private get listed(): Locator {
    return this.page.getByRole('list', { name: 'Operation list', exact: true }).getByRole('listitem');
  }

  /** Opens /daily for a served Index drift challenge and waits for the operation builder (there is no Challenge array). */
  async open(context: string): Promise<void> {
    await this.page.goto('/daily');
    await expect(this.builder, `${context}: /daily should show a group named "Operation builder" for an Index drift challenge`).toBeVisible();
  }

  /** The numbers in the named list (`Start list` or `Target list`), front to back. */
  async listValues(name: 'Start list' | 'Target list', context: string): Promise<number[]> {
    const list = this.page.getByRole('list', { name, exact: true });
    await expect(list, `${context}: /daily should show a list named "${name}"`).toBeVisible();
    const texts = await list.getByRole('listitem').allTextContents();
    return texts.map((text, i) => {
      const match = text.match(/-?\d+/);
      if (!match) throw new Error(`${context}: item ${i} of "${name}" should show a number, got "${text.trim()}"`);
      return Number(match[0]);
    });
  }

  /** Adds one operation with the builder: picks `insert` or `delete`, fills Value (inserts only) and Index, clicks Add operation. */
  async add(op: ListOperation, context: string): Promise<void> {
    const label = `${context}: adding ${operationText(op)}`;
    await expect(this.builder, `${label}: /daily should show a group named "Operation builder"`).toBeVisible();
    await this.chooseKind(op.kind, label);
    if (op.kind === 'insert') {
      await this.fill('Value', op.value, label);
    }
    await this.fill('Index', op.index, label);
    const add = this.builder.getByRole('button', { name: 'Add operation', exact: true });
    await expect(add, `${label}: the "Add operation" button should be enabled`).toBeEnabled();
    await add.click();
  }

  /** Adds each operation in order, then checks the Operation list reads exactly `expected`. */
  async build(ops: readonly ListOperation[], expected: readonly string[], context: string): Promise<void> {
    for (const op of ops) await this.add(op, context);
    await this.expectListed(expected, context);
  }

  /** Clicks `Clear operations` and checks the Operation list is empty. */
  async clear(context: string): Promise<void> {
    const clear = this.page.getByRole('button', { name: 'Clear operations', exact: true });
    await expect(clear, `${context}: the "Clear operations" button should be enabled`).toBeEnabled();
    await clear.click();
    await expect(this.listed, `${context}: Clear operations should empty the Operation list`).toHaveCount(0);
  }

  /** The Operation list's items, each reduced to its `insert(v, i)` or `delete(i)` text, in order. */
  async expectListed(expected: readonly string[], context: string): Promise<void> {
    await expect
      .poll(
        async () =>
          (await this.listed.allTextContents()).map((text) => {
            const match = text.match(OPERATION_TEXT);
            return match ? match[0].replace(/\s+/g, '').replace(',', ', ') : `(no operation in "${text.trim()}")`;
          }),
        { message: `${context}: the Operation list should read ${JSON.stringify(expected)}` },
      )
      .toEqual([...expected]);
  }

  private async chooseKind(kind: ListOperation['kind'], label: string): Promise<void> {
    const picker = this.builder.getByRole('combobox', { name: 'Operation', exact: true });
    await expect(picker, `${label}: the builder should have an "Operation" combobox`).toBeVisible();
    if ((await picker.evaluate((el) => el.tagName)) === 'SELECT') {
      await picker.selectOption({ label: kind });
      return;
    }
    await picker.click();
    const option = this.page.getByRole('option', { name: kind, exact: true });
    await expect(option, `${label}: the Operation combobox should offer "${kind}"`).toBeVisible();
    await option.click();
  }

  private async fill(name: 'Value' | 'Index', n: number, label: string): Promise<void> {
    const input = this.builder.getByRole('spinbutton', { name, exact: true });
    await expect(input, `${label}: the builder should have a "${name}" number input (spinbutton)`).toBeEditable();
    await input.fill(String(n));
  }
}
