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
import { CanvasTarget, DEFAULT_CANVAS_TARGET } from '@/visualiser-src/common/canvasTarget';
import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import { InitialDataSource, VisualiserSession, VisualiserSnapshot } from './session';
import { Topic } from './topics';

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
  topic: Topic,
  canvasTheme: Partial<CanvasTheme>,
  data?: number[],
  getInitialData?: InitialDataSource,
  immediate = false,
  target: CanvasTarget = DEFAULT_CANVAS_TARGET
): VisualiserSession => {
  const [session] = useState(() => new VisualiserSession(target));
  const dataKey = data ? `data:${data.join(',')}` : 'random';
  const drawnTheme = useRef(canvasTheme);

  const attach = useEffectEvent(() => {
    drawnTheme.current = canvasTheme;
    session.attach(topic.title, canvasTheme, data, getInitialData, immediate);
  });

  useEffect(() => attach(), [session, topic.title, dataKey]);

  useEffect(() => {
    if (drawnTheme.current === canvasTheme) return;
    drawnTheme.current = canvasTheme;
    session.retheme(canvasTheme);
  }, [session, canvasTheme]);

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

export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );

export const usePrefersReducedMotion = (): boolean =>
  useMediaQuery('(prefers-reduced-motion: reduce)');
