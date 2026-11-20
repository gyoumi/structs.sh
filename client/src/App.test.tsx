// @vitest-environment jsdom
import './test/setup';
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
    expect(screen.getByRole('img', { name: /DevSoc's <dev\/> logo/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Sorting Algorithms' }));
    expect(screen.getByRole('link', { name: 'Open Sorting Algorithms' }).getAttribute('href')).toBe(
      '/visualiser/sorting-algorithms'
    );
  });

  test('each load picks a sort for the hero, and hovering replays the same one', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    renderLanding();
    random.mockRestore();
    const hero = screen.getByRole('img', { name: /sorting themselves.*with bubble sort/ });
    fireEvent.pointerEnter(hero.parentElement!);
    expect(screen.getByRole('img', { name: /with bubble sort/ })).toBeTruthy();
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

  test('on a small screen the theme toggle moves into the More menu', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(max-width: 560px)',
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList
    );
    await renderVisualiser();
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Dark mode' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    const item = screen.getByRole('menuitemcheckbox', { name: 'Dark mode' });
    const before = item.getAttribute('aria-checked');
    await user.click(item);
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Dark mode' }).getAttribute('aria-checked')
    ).not.toBe(before);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Dark mode' }));
    matchMedia.mockRestore();
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
  test('a copied link keeps an empty structure empty', async () => {
    await renderVisualiser('/visualiser/linked-lists/empty');
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/visualiser/linked-lists/empty`
    );
  });

  test('a topic with capitals in an old link still opens', async () => {
    await renderVisualiser('/visualiser/Linked-Lists/102030');
    expect(screen.queryByText('Landing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  test('an unknown structure goes back to the landing page', async () => {
    await renderVisualiser('/visualiser/graphs');
    expect(screen.getByText('Landing')).toBeTruthy();
  });
});
