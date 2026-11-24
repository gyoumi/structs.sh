import LinkedListDeleteAnimationProducer from './LinkedListDeleteAnimationProducer';
import { CURRENT } from '../util/constants';

/** Animates a sequence of inserts and deletes on one timeline, counting operations and the nodes `curr` lands on. */
export default class LinkedListRunAnimationProducer extends LinkedListDeleteAnimationProducer {
  private operationCount = 0;

  private nodesWalkedCount = 0;

  /** Counts one more operation, before its first step. */
  public startOperation(): void {
    this.operationCount += 1;
  }

  public get operations(): number {
    return this.operationCount;
  }

  public get nodesWalked(): number {
    return this.nodesWalkedCount;
  }

  protected get stepCounters(): Record<string, number> {
    return {
      operations: this.operationCount,
      nodesWalked: this.nodesWalkedCount,
      cost: this.operationCount + this.nodesWalkedCount,
    };
  }

  public initialisePointer(pointerId: string): void {
    if (pointerId === CURRENT) this.nodesWalkedCount += 1;
    super.initialisePointer(pointerId);
  }

  public movePointerToNext(pointerId: string): void {
    if (pointerId === CURRENT) this.nodesWalkedCount += 1;
    super.movePointerToNext(pointerId);
  }
}
