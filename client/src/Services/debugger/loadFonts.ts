/**
 * Loads every font face App.scss declares now, not the first time text uses
 * it (a bold toast, say), so the debugger looks the same once the network is
 * off. Only the debugger needs this, so other pages fetch faces as they use
 * them. It goes through the @font-face rules, so it uses a build's hashed URLs.
 * Settles once every face has loaded or failed to.
 */
export const loadFonts = (): Promise<unknown> => {
  // Outside a page, as in unit tests, there are no fonts to load.
  if (typeof document === 'undefined') return Promise.resolve();
  return Promise.allSettled(
    ['AtlassianText', 'CodeText'].flatMap((family) =>
      ['normal', 'italic'].flatMap((style) =>
        ['normal', 'bold'].map((weight) => document.fonts.load(`${style} ${weight} 1em ${family}`))
      )
    )
  );
};
