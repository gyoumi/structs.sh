import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

Object.assign(globalThis, { __UI_SDK_STRICT__: true });

HTMLElement.prototype.showPopover = function showPopover() {};
HTMLElement.prototype.hidePopover = function hidePopover() {};
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = function scrollIntoView() {};
Element.prototype.checkVisibility = () => true;
Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
document.elementFromPoint = () => null;
document.elementsFromPoint = () => [];
class NoopObserver {
  observe() {}

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
document.head.append(
  Object.assign(document.createElement('style'), {
    textContent: '[popover] { display: block !important }',
  })
);

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

(SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
  ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;

afterEach(cleanup);
