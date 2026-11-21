import { createColorScheme, createLocalStorage } from '@ui-sdk/core';
import { MenuCheckboxItem, MenuItemIndicator } from '@ui-sdk/react/menu';
import { usePreference } from '@ui-sdk/react/preferences';
import { Toggle } from '@ui-sdk/react/toggle';
import { CheckIcon, MoonIcon, SunIcon } from '@/ui/icons';

export type Theme = 'light' | 'dark';

const colorScheme = createColorScheme({ storage: createLocalStorage('structs-color-scheme') });

/** The theme showing now: the saved choice, or the system's when nothing is saved. */
export const useTheme = (): Theme => {
  const { resolved } = usePreference(colorScheme);
  return resolved === 'dark' ? 'dark' : 'light';
};

const setDark = (dark: boolean) => {
  const root = document.documentElement;
  root.setAttribute('data-theme-switching', '');
  colorScheme.set(dark ? 'dark' : 'light');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.removeAttribute('data-theme-switching'))
  );
};

export const ThemeToggle = ({ className }: { className?: string }) => {
  const theme = useTheme();
  return (
    <Toggle
      className={className}
      pressed={theme === 'dark'}
      onPressedChange={setDark}
      aria-label="Dark mode"
    >
      {theme === 'dark' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
    </Toggle>
  );
};

export const ThemeMenuItem = ({
  className,
  indicatorClassName,
}: {
  className?: string;
  indicatorClassName?: string;
}) => {
  const theme = useTheme();
  return (
    <MenuCheckboxItem
      className={className}
      value="dark"
      checked={theme === 'dark'}
      onCheckedChange={setDark}
      closeOnSelect={false}
    >
      <MoonIcon size={18} />
      Dark mode
      <MenuItemIndicator className={indicatorClassName}>
        <CheckIcon size={16} />
      </MenuItemIndicator>
    </MenuCheckboxItem>
  );
};
