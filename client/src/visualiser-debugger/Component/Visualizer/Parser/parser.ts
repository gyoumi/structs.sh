import { UserAnnotation } from '../../../Types/annotationType';
import { ProgramState } from '../../../Types/programState';
import { FrontendState } from '../../../Types/frontendType';

export interface Parser {
  parseState: (programState: ProgramState, annotation: UserAnnotation) => FrontendState | undefined;
}

/**
 * TODO: Implement
 */
export function parseUserDefinedDataStructure() {
  return undefined;
}
