import { UseBoundStore, StoreApi, create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { TypeDeclaration } from '@/Services/debugger/wasm/debugSection';
import { Parser } from '../Component/Visualizer/Parser/parser';
import { parserFactory } from '../Component/Visualizer/Parser/parserFactory';
import { VisualizerComponent } from '../Component/Visualizer/Visulizer/visualizer';
import { visualizerFactory } from '../Component/Visualizer/Visulizer/visualizerFactory';
import { DataStructureAnnotation, StackAnnotation, UserAnnotation } from '../Types/annotationType';
import { ProgramState, INITIAL_PROGRAM_STATE } from '../Types/programState';
import { VisualizerType } from '../Types/visualizerType';

export type UiState = {
  visualizerDimension: {
    width: number;
    height: number;
  };
  currFocusedTab: string;
};

export type VisualizerConfig = {
  visualizerType: VisualizerType;
  userAnnotation: UserAnnotation;
  visComponent: VisualizerComponent;
  parser: Parser;
  typeDeclarations: TypeDeclaration[];
};

export type GlobalStateStore = {
  uiState: UiState;
  visualizer: VisualizerConfig;
  latestProgramState: ProgramState;
  consoleChunks: string[];
};

export const DEFAULT_GLOBAL_STORE: GlobalStateStore = {
  uiState: {
    visualizerDimension: {
      width: 800,
      height: 400,
    },
    currFocusedTab: '0',
  },
  visualizer: {
    visualizerType: VisualizerType.LINKED_LIST,
    userAnnotation: {
      stackAnnotation: {},
      typeAnnotation: {},
    },
    visComponent: visualizerFactory(VisualizerType.LINKED_LIST),
    parser: parserFactory(VisualizerType.LINKED_LIST),
    typeDeclarations: [],
  },
  latestProgramState: INITIAL_PROGRAM_STATE,
  consoleChunks: [],
};

export const NODE_SIZE = 30;
export const EDGE_WIDTH = 6;
export const NODE_MIN_DISTANCE = 75;

type GlobalStoreActions = {
  setVisualizerType: (type: VisualizerType) => void;
  updateDimensions: (width: number, height: number) => void;
  updateCurrFocusedTab: (tab: string) => void;
  updateUserAnnotation: (annotation: UserAnnotation) => void;
  updateStackAnnotation: (annotation: StackAnnotation) => void;
  updateTypeAnnotation: (annotation: DataStructureAnnotation) => void;
  addTypeDeclaration: (type: TypeDeclaration) => void;
  setLatestProgramState: (programState: ProgramState) => void;
  clearTypeDeclarations: () => void;
  clearUserAnnotation: () => void;
  appendConsoleChunks: (chunk: string | string[]) => void;
  resetConsoleChunks: () => void;
};

export const useGlobalStore: UseBoundStore<StoreApi<GlobalStateStore & GlobalStoreActions>> =
  create<GlobalStateStore & GlobalStoreActions>()(
    devtools((set) => ({
      ...DEFAULT_GLOBAL_STORE,
      setVisualizerType: (type: VisualizerType) => {
        set(
          (state) => ({
            visualizer: {
              ...state.visualizer,
              visualizerType: type,
              visComponent: visualizerFactory(type),
              parser: parserFactory(type),
            },
          }),
          false,
          'setVisualizerType'
        );
      },
      updateDimensions: (width: number, height: number) => {
        set((state) => ({
          ...state,
          uiState: {
            visualizerDimension: { width, height },
            currFocusedTab: state.uiState.currFocusedTab,
          },
        }));
      },
      updateCurrFocusedTab: (tab: string) => {
        set((state) => ({
          ...state,
          uiState: {
            visualizerDimension: state.uiState.visualizerDimension,
            currFocusedTab: tab,
          },
        }));
      },
      updateUserAnnotation: (annotation: UserAnnotation) => {
        set(
          (state) => ({
            visualizer: {
              ...state.visualizer,
              userAnnotation: annotation,
            },
          }),
          false,
          'updateUserAnnotation'
        );
      },
      updateStackAnnotation: (stackAnnotation) => {
        set(
          (state) => ({
            visualizer: {
              ...state.visualizer,
              userAnnotation: {
                ...state.visualizer.userAnnotation,
                stackAnnotation: {
                  ...state.visualizer.userAnnotation.stackAnnotation,
                  ...stackAnnotation,
                },
              },
            },
          }),
          false,
          'updateStackAnnotation'
        );
      },
      updateTypeAnnotation: (typeAnnotation) => {
        set(
          (state) => ({
            visualizer: {
              ...state.visualizer,
              userAnnotation: {
                ...state.visualizer.userAnnotation,
                typeAnnotation: {
                  ...state.visualizer.userAnnotation.typeAnnotation,
                  [typeAnnotation.typeName]: typeAnnotation,
                },
              },
            },
          }),
          false,
          'updateTypeAnnotation'
        );
      },
      addTypeDeclaration: (type: TypeDeclaration) => {
        set(
          (state) => ({
            visualizer: {
              ...state.visualizer,
              typeDeclarations: [...state.visualizer.typeDeclarations, type],
            },
          }),
          false,
          'addTypeDeclaration'
        );
      },
      setLatestProgramState: (programState: ProgramState) => {
        set({ latestProgramState: programState }, false, 'setLatestProgramState');
      },
      clearTypeDeclarations: () => {
        set(
          (state) => ({
            visualizer: {
              ...state.visualizer,
              typeDeclarations: [],
            },
          }),
          false,
          'clearTypeDeclarations'
        );
      },
      clearUserAnnotation: () => {
        set(
          (state) => ({
            visualizer: {
              ...state.visualizer,
              userAnnotation: {
                stackAnnotation: {},
                typeAnnotation: {},
              },
            },
          }),
          false,
          'clearUserAnnotation'
        );
      },
      appendConsoleChunks: (chunk: string | string[]) => {
        if (Array.isArray(chunk)) {
          set((state) => ({ consoleChunks: [...state.consoleChunks, ...chunk] }));
        } else {
          set((state) => ({ consoleChunks: [...state.consoleChunks, chunk] }));
        }
      },
      setConsoleChunks: (chunk: string[]) => {
        set(() => ({ consoleChunks: chunk }));
      },
      resetConsoleChunks: () => {
        set(() => ({ consoleChunks: [] }));
      },
    }))
  );
