import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useShortcut } from '@ui-sdk/react/shortcuts';
import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import { StarterData, VisualiserSession, VisualiserSnapshot } from './session';
import { TopicInfo } from './topics';

export const SessionContext = createContext<VisualiserSession | null>(null);

export const useSession = (): VisualiserSession => {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside a SessionContext provider');
  return session;
};

export function useSnapshot<T>(selector: (snapshot: VisualiserSnapshot) => T): T {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, () => selector(session.getSnapshot()));
}

export const useCreateSession = (
  topic: TopicInfo,
  theme: Partial<CanvasTheme>,
  data?: number[],
  makeData?: StarterData
): VisualiserSession => {
  const [session] = useState(() => new VisualiserSession());
  const dataKey = data ? `data:${data.join(',')}` : 'random';
  const drawnTheme = useRef(theme);

  const attach = useEffectEvent(() => {
    drawnTheme.current = theme;
    session.attach(topic.title, theme, data, makeData);
  });

  useEffect(() => attach(), [session, topic.title, dataKey]);

  useEffect(() => {
    if (drawnTheme.current === theme) return;
    drawnTheme.current = theme;
    session.retheme(theme);
  }, [session, theme]);

  useEffect(() => () => session.dispose(), [session]);

  return session;
};

const isTypingTarget = (element: Element | null): boolean =>
  !!element && (element.matches('input, textarea, select, [contenteditable="true"]') || false);

const ARROW_WIDGETS =
  '[role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"], [role="slider"], [role="spinbutton"], [role="tree"]';

const usesArrowKeys = (element: Element | null): boolean =>
  isTypingTarget(element) || !!element?.closest(ARROW_WIDGETS);

const isPressable = (element: Element | null): boolean =>
  !!element &&
  element.matches('button, [role="button"], a, input, textarea, select, [role="slider"]');

export const usePlaybackShortcuts = (session: VisualiserSession): void => {
  useShortcut('space', session.togglePlay, {
    description: 'Play or pause',
    when: () => !isPressable(document.activeElement),
  });
  useShortcut('arrowright', session.stepForward, {
    description: 'Next step',
    when: () => !usesArrowKeys(document.activeElement),
  });
  useShortcut('arrowleft', session.stepBackward, {
    description: 'Previous step',
    when: () => !usesArrowKeys(document.activeElement),
  });
  useShortcut('home', session.rewind, { description: 'Back to the start' });
  useShortcut('end', session.finish, { description: 'Skip to the end' });
};

export const usePrefersReducedMotion = (): boolean => {
  const query = '(prefers-reduced-motion: reduce)';
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
};
