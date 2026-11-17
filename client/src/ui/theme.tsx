import { createColorScheme, createLocalStorage } from '@ui-sdk/core';
import { usePreference } from '@ui-sdk/react/preferences';
import { Toggle } from '@ui-sdk/react/toggle';
import { MoonIcon, SunIcon } from '@/ui/icons';

export type Theme = 'light' | 'dark';

const colorScheme = createColorScheme({ storage: createLocalStorage('structs-color-scheme') });

/** The theme showing now: the saved choice, or the system's when nothing is saved. */
export const useTheme = (): Theme => {
  const { resolved } = usePreference(colorScheme);
  return resolved === 'dark' ? 'dark' : 'light';
};

export const ThemeToggle = ({ className }: { className?: string }) => {
  const theme = useTheme();
  return (
    <Toggle
      className={className}
      pressed={theme === 'dark'}
      onPressedChange={(dark: boolean) => colorScheme.set(dark ? 'dark' : 'light')}
      aria-label="Dark mode"
    >
      {theme === 'dark' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
    </Toggle>
  );
};
