/** The names checkpoint 5 renamed away from, for ESLint's id-denylist in client/src and e2e. */
export const retiredNames = [
  'BackendState',
  'INITIAL_BACKEND_STATE',
  'isInitialBackendState',
  'BackendTypeDeclaration',
  'backendState',
  'backendStructure',
  'BackendTypeRole',
  'DataStructureAnnotationConcrete',
  'LocalAnnotation',
  'MappedState',
  'currState',
  'pushOrReplaceFrontendState',
  'clearFrontendState',
  'currFrame',
  'updateNextFrame',
  'updateTypeDeclaration',
  'VisualizerParam',
  'debuggerClient',
  'sendCode',
  'getNextState',
  'bulkSendNextStates',
  'stateAt',
  'createPossibleLinkedListTypeDecl',
  'PoolStage',
  'noStep',
  'lastStepMayBeStale',
];

/** An id-match pattern for identifiers without "student" in any case. id-match compiles it without the i flag. */
export const studentFreeIdentifier = '^(?![\\s\\S]*[sS][tT][uU][dD][eE][nN][tT])';
