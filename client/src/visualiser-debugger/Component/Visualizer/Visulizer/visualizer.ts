import React from 'react';
import { FrontendState } from '../../../Types/frontendType';

export interface VisualizerState {
  graphState: FrontendState | undefined;
  dimension: {
    width: number;
    height: number;
  };
}

export type VisualizerComponent = React.FC<VisualizerState>;
