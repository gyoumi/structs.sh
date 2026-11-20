import { UserAnnotation } from '../../../Types/annotationType';
import { BackendState } from '../../../Types/backendType';
import { FrontendState } from '../../../Types/frontendType';

export interface Parser {
  parseState: (
    backendStructure: BackendState,
    annotation: UserAnnotation
  ) => FrontendState | undefined;
}

/**
 * TODO: Implement
 */
export function parseUserDefinedDataStructure() {
  return undefined;
}
