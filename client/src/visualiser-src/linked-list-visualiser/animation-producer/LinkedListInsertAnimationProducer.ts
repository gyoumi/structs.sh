import LinkedListAnimationProducer from './LinkedListAnimationProducer';
import { insertCodeSnippet } from '../util/codeSnippets';

// Class that produces SVG.Runners animating linked list operations specific to inserting
export default class LinkedListInsertAnimationProducer extends LinkedListAnimationProducer {
  public renderInsertCode(): void {
    this.renderCode(insertCodeSnippet);
  }
}
