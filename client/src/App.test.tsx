import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls } from '@/test/FakeSession';
import { renderLanding, renderVisualiser } from '@/test/render';

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
    expect(screen.getByRole('img', { name: /sorting themselves/ })).toBeTruthy();
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

  test('an unknown structure goes back to the landing page', async () => {
    await renderVisualiser('/visualiser/graphs');
    expect(screen.getByText('Landing')).toBeTruthy();
  });
});
