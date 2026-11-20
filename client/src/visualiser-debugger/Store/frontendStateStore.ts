import { UseBoundStore, StoreApi, create } from 'zustand';
import { FrontendState, INITIAL_GRAPH } from '../Types/frontendType';
import { ProgramState, INITIAL_PROGRAM_STATE } from '../Types/programState';

type TimelineEntry = {
  programState: ProgramState;
  frontendState: FrontendState | undefined;
};

type State = {
  states: TimelineEntry[];
  currentIndex: number;
  isActive: boolean;
  getCurrentStep: () => TimelineEntry;
};

type Action = {
  pushOrReplaceLatestStep: (
    programState: ProgramState,
    newState: FrontendState | undefined
  ) => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToState: (index: number) => void;
  setActive: (active: boolean) => void;
  resetTimeline: () => void;
};

export const useFrontendStateStore: UseBoundStore<StoreApi<State & Action>> = create<
  State & Action
>((set) => ({
  states: [],
  currentIndex: -1,
  isActive: false,
  getCurrentStep: () => {
    if (useFrontendStateStore.getState().currentIndex === -1) {
      return {
        programState: INITIAL_PROGRAM_STATE,
        frontendState: INITIAL_GRAPH,
      };
    }
    return useFrontendStateStore.getState().states[useFrontendStateStore.getState().currentIndex];
  },
  pushOrReplaceLatestStep: (programState: ProgramState, newState: FrontendState | undefined) => {
    set((state) => {
      const lastState = state.states[state.states.length - 1];
      if (lastState && lastState.programState === programState) {
        // Trigger rerender but keep the program state paired with its frontend state
        const updatedStates = [...state.states];
        updatedStates[updatedStates.length - 1] = {
          programState,
          frontendState: newState,
        };

        return {
          states: updatedStates,
        };
      }

      return {
        states: [
          ...state.states,
          {
            programState,
            frontendState: newState,
          },
        ],
      };
    });
  },
  stepForward: () => {
    if (
      useFrontendStateStore.getState().currentIndex >=
      useFrontendStateStore.getState().states.length - 1
    ) {
      return;
    }
    set((state) => ({
      currentIndex: state.currentIndex + 1,
    }));
  },
  stepBackward: () => {
    if (useFrontendStateStore.getState().currentIndex <= 0) {
      return;
    }
    set((state) => ({
      currentIndex: state.currentIndex - 1,
    }));
  },
  jumpToState: (index: number) => {
    if (index < 0 || index >= useFrontendStateStore.getState().states.length) {
      return;
    }
    set({ currentIndex: index });
  },
  setActive: (active: boolean) => {
    set({ isActive: active });
  },
  resetTimeline: () => {
    set({ isActive: false, states: [], currentIndex: -1 });
  },
}));
