import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FEEDBACK_FORM } from '@/landing/content';
import { calls } from '@/test/FakeSession';
import { renderLanding, renderNotFound, renderVisualiser } from '@/test/render';

vi.mock('@/visualiser/session', async () => ({
  VisualiserSession: (await import('@/test/FakeSession')).FakeSession,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  calls.length = 0;
});

describe('landing page', () => {
  test('the hero animation is labelled and a tile opens its visualiser', () => {
    renderLanding();
    expect(screen.getByRole('img', { name: /links a new node/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Sorting Algorithms' }));
    expect(screen.getByRole('link', { name: 'Open Sorting Algorithms' }).getAttribute('href')).toBe(
      '/visualiser/sorting-algorithms'
    );
  });

  test('the toggle switches between light and dark', () => {
    const { container } = renderLanding();
    const page = container.querySelector('[data-theme]')!;
    const before = page.getAttribute('data-theme');
    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(page.getAttribute('data-theme')).toBe(before === 'dark' ? 'light' : 'dark');
  });

  test('the footer links to the team', () => {
    renderLanding();
    const footer = screen.getByRole('navigation', { name: 'Project' });
    expect([...footer.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining([
        'mailto:structs@devsoc.app',
        'https://devsoc.app/',
        'https://www.facebook.com/devsocUNSW',
        FEEDBACK_FORM,
      ])
    );
  });
});

describe('not found page', () => {
  test('names the missing address and links home', async () => {
    renderNotFound('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: '404' })).toBeTruthy();
    expect(screen.getByText('/no-such-page')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Go to the home page' }));
    expect(screen.getByText('Landing')).toBeTruthy();
  });
});

describe('visualiser', () => {
  test('links every structure and has a theme toggle', async () => {
    await renderVisualiser();
    const nav = screen.getByRole('navigation', { name: 'Data structures' });
    expect([...nav.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      '/visualiser/linked-lists',
      '/visualiser/binary-search-trees',
      '/visualiser/avl-trees',
      '/visualiser/sorting-algorithms',
    ]);
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeTruthy();
  });

  test('an operation runs with the typed arguments and is titled as a sentence', async () => {
    await renderVisualiser('/visualiser/linked-lists?op=insert');
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Value' }), '42');
    await user.type(screen.getByRole('textbox', { name: 'Index' }), '3');
    await user.click(screen.getByRole('button', { name: 'Run insert at index' }));
    expect(calls).toContainEqual({ method: 'run', args: ['insert', ['42', '3']] });
    expect(await screen.findByText('Insert 42 at index 3')).toBeTruthy();
  });

  test('an index past the end of the list is refused before it runs', async () => {
    await renderVisualiser('/visualiser/linked-lists?op=insert');
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Value' }), '42');
    await user.type(screen.getByRole('textbox', { name: 'Index' }), '20');
    await user.click(screen.getByRole('button', { name: 'Run insert at index' }));
    expect(await screen.findByText('Index needs to be between 0 and 3.')).toBeTruthy();
    expect(calls).not.toContainEqual({ method: 'run', args: ['insert', ['42', '20']] });
  });

  test('offers every speed from 0.25x to 2x', async () => {
    await renderVisualiser();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Speed' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '0.25×',
      '0.5×',
      '0.75×',
      '1×',
      '1.25×',
      '1.5×',
      '1.75×',
      '2×',
    ]);
    await user.click(screen.getByRole('option', { name: '0.25×' }));
    expect(calls).toContainEqual({ method: 'setSpeed', args: [0.25] });
  });

  test('copies a link that reopens the same data', async () => {
    await renderVisualiser();
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/visualiser/linked-lists/102030`
    );
    expect(await screen.findByText('Link copied')).toBeTruthy();
  });

  test('a copied link keeps an empty structure empty', async () => {
    await renderVisualiser('/visualiser/linked-lists/empty');
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/visualiser/linked-lists/empty`
    );
  });

  test('an unknown structure goes back to the landing page', async () => {
    await renderVisualiser('/visualiser/graphs');
    expect(screen.getByText('Landing')).toBeTruthy();
  });
});
