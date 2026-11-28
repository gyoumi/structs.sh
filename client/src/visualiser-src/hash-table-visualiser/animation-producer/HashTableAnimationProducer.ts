import type { Element } from '@svgdotjs/svg.js';
import type { HashOp, HashSlot, HashStep } from '@/Services/challenges/challenges';
import AnimationProducer, { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';
import { HashTableView, addValueText } from '../data-structure/HashTableCanvas';
import { isWrapProbe, stepBanner } from '../util/bannerText';
import { FADE_MS, slotBounds, tableBounds } from '../util/layout';
import { lineForStep, snippetFor } from '../util/stepLines';

const stepSlotIndex = (step: HashStep): number | null => {
  if (step.kind === 'computeHash' || step.kind === 'notFound' || step.kind === 'tableFull') {
    return null;
  }
  return step.index;
};

/** Plays one operation's `HashStep` log over a drawn table, one timestamped step per entry. */
export default class HashTableAnimationProducer extends AnimationProducer {
  private probes = 0;

  private start = 0;

  private activeSlot: number | null = null;

  private wrapShown = false;

  private lastProbed: HashSlot | null = null;

  private focusBox: DrawingBounds = tableBounds();

  private currentStatus: string | null = null;

  public constructor(
    private readonly view: HashTableView,
    private readonly op: HashOp
  ) {
    super();
    this.renderCode(snippetFor(op.kind));
  }

  protected get counter(): number {
    return this.probes;
  }

  protected get stepBounds(): DrawingBounds {
    return tableBounds();
  }

  protected get stepFocus(): DrawingBounds | null {
    return this.focusBox;
  }

  protected get stepStatus(): string | null {
    return this.currentStatus;
  }

  /** Adds one timestamped sequence per step in `steps`. */
  public playSteps(steps: readonly HashStep[]): void {
    steps.forEach((step) => this.playStep(step));
  }

  private playStep(step: HashStep): void {
    if (step.kind === 'computeHash') this.start = step.index;
    if (step.kind === 'probe') this.probes = step.probeNumber;
    this.currentStatus = stepBanner(this.op.key, this.start, this.probes, step);
    this.highlightCode(lineForStep(this.op.kind, step, this.lastProbed));
    this.showWrap(isWrapProbe(step));
    const index = stepSlotIndex(step);
    this.moveHighlight(index);
    this.changeSlot(step);
    if (step.kind === 'probe') this.lastProbed = step.slot;
    this.focusBox = index === null ? tableBounds() : slotBounds(index);
    this.finishSequence(true);
  }

  private fade(element: Element, opacity: number): void {
    this.addSequenceAnimation(element.animate(FADE_MS).attr({ opacity }));
  }

  private hideImmediate(element: Element): void {
    this.addSequenceAnimation(element.animate(1).attr({ opacity: 0 }));
  }

  private showWrap(shown: boolean): void {
    if (shown === this.wrapShown) return;
    this.fade(this.view.wrap, shown ? 1 : 0);
    this.wrapShown = shown;
  }

  private moveHighlight(index: number | null): void {
    if (index === this.activeSlot) return;
    if (this.activeSlot !== null) this.hideImmediate(this.view.slots[this.activeSlot].highlight);
    if (index !== null) this.fade(this.view.slots[index].highlight, 1);
    this.activeSlot = index;
  }

  private replaceValue(index: number, slot: HashSlot): void {
    const view = this.view.slots[index];
    const next = addValueText(view.group, index, slot);
    this.hideImmediate(view.value);
    this.fade(next, 1);
    view.value = next;
  }

  private changeSlot(step: HashStep): void {
    if (step.kind === 'place') {
      this.replaceValue(step.index, { kind: 'occupied', key: step.key });
      if (step.replacedTombstone) this.setTombstoneBorder(step.index, false);
    } else if (step.kind === 'markTombstone') {
      this.replaceValue(step.index, { kind: 'tombstone' });
      this.setTombstoneBorder(step.index, true);
    }
  }

  private setTombstoneBorder(index: number, tombstone: boolean): void {
    const view = this.view.slots[index];
    this.fade(view.dashedBorder, tombstone ? 1 : 0);
    this.fade(view.solidBorder, tombstone ? 0 : 1);
  }
}
