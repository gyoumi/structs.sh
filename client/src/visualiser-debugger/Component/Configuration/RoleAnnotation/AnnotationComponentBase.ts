import React from 'react';
import type { TypeDeclaration } from '@/Services/debugger/wasm/debugSection';

export interface AnnotationProp {
  typeDeclaration: TypeDeclaration;
}

export type AnnotationComponent = React.FC<AnnotationProp>;
