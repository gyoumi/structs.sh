/**
 * Loads every font face App.scss declares now: a browser otherwise fetches a
 * face only the first time text uses it. It goes through the @font-face rules,
 * so it uses a build's hashed URLs. Settles once every face has loaded or
 * failed to.
 */
export const loadFonts = (): Promise<unknown> => {
  if (typeof document === 'undefined') return Promise.resolve();
  return Promise.allSettled(
    ['AtlassianText', 'CodeText'].flatMap((family) =>
      ['normal', 'italic'].flatMap((style) =>
        ['normal', 'bold'].map((weight) => document.fonts.load(`${style} ${weight} 1em ${family}`))
      )
    )
  );
};
