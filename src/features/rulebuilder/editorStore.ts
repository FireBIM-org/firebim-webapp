import { useCallback, useReducer } from 'react';

export type RuleData = {
  id: string;
  node_type: 'start' | 'decision' | 'end';
  label?: string | null;
  target_class?: string | null;
  property_path?: string | null;
  operator?: string | null;
  value?: unknown;
  true_path?: string | null;
  false_path?: string | null;
  unknown_path?: string | null;
  config?: Record<string, unknown>;
  graph_uri?: string | null;
};

export type DuplicateRequest = {
  requestId: number;
  sourceNodeId: string;
};

export type DeleteRequest = {
  requestId: number;
  sourceNodeId: string;
};

export type DeriveRequest = {
  requestId: number;
  derivedRule: RuleData;
};

export type BuiltTreeNode = {
  id: string;
  node_type: 'start' | 'decision' | 'end';
  true_path?: string | null;
  false_path?: string | null;
  unknown_path?: string | null;
};

export type BuiltTreeConnection = {
  source_id: string;
  branch: 'true' | 'false' | 'unknown';
  target_id: string;
};

export type BuiltTreeResult = {
  entry: string;
  reachableNodeIds: string[];
  nodes: BuiltTreeNode[];
  connections: BuiltTreeConnection[];
  missingBranches: Array<{
    source_id: string;
    branch: 'true' | 'false' | 'unknown';
    missing_target_id: string;
  }>;
  cycles: string[][];
};

export type BuildTreeRequest = {
  requestId: number;
  startNodeId: string;
};

export type EditorPresentState = {
  selectedNodeId: string | null;
  selectedRule: RuleData | null;
  duplicateRequest: DuplicateRequest | null;
  deleteRequest: DeleteRequest | null;
  deriveRequest: DeriveRequest | null;
  buildTreeRequest: BuildTreeRequest | null;
  builtTreeResult: BuiltTreeResult | null;
};

type EditorHistoryState = {
  past: EditorPresentState[];
  present: EditorPresentState;
  future: EditorPresentState[];
};

type SelectNodeEvent = {
  type: 'node.selected';
  nodeId: string | null;
  rule: RuleData | null;
};

type UpdateSelectedRuleEvent = {
  type: 'selectedRule.updated';
  patch: Partial<RuleData>;
};

type DuplicateRequestedEvent = {
  type: 'node.duplicateRequested';
  request: DuplicateRequest;
};

type DeleteRequestedEvent = {
  type: 'node.deleteRequested';
  request: DeleteRequest;
};

type DeriveRequestedEvent = {
  type: 'node.deriveRequested';
  request: DeriveRequest;
};

type ClearTransientRequestsEvent = {
  type: 'transientRequests.cleared';
};

type UndoEvent = {
  type: 'history.undo';
};

type RedoEvent = {
  type: 'history.redo';
};

type BuildTreeRequestedEvent = {
  type: 'tree.buildRequested';
  request: BuildTreeRequest;
};

type TreeBuiltEvent = {
  type: 'tree.built';
  result: BuiltTreeResult;
};

type ClearBuiltTreeResultEvent = {
  type: 'tree.resultCleared';
};

export type EditorEvent =
  | SelectNodeEvent
  | UpdateSelectedRuleEvent
  | DuplicateRequestedEvent
  | DeleteRequestedEvent
  | DeriveRequestedEvent
  | BuildTreeRequestedEvent
  | TreeBuiltEvent
  | ClearBuiltTreeResultEvent
  | ClearTransientRequestsEvent
  | UndoEvent
  | RedoEvent;

function assertNever(value: never): never {
  throw new Error(`Unhandled editor event: ${JSON.stringify(value)}`);
}

function createInitialPresentState(): EditorPresentState {
  return {
    selectedNodeId: null,
    selectedRule: null,
    duplicateRequest: null,
    deleteRequest: null,
    deriveRequest: null,
    buildTreeRequest: null,
    builtTreeResult: null,
  };
}

function withClearedTransientRequests(state: EditorPresentState): EditorPresentState {
  return {
    ...state,
    duplicateRequest: null,
    deleteRequest: null,
    deriveRequest: null,
    buildTreeRequest: null,
  };
}

function reducePresentState(
  state: EditorPresentState,
  event: Exclude<EditorEvent, UndoEvent | RedoEvent>
): EditorPresentState {
  switch (event.type) {
    case 'node.selected':
      return {
        ...state,
        selectedNodeId: event.nodeId,
        selectedRule: event.rule,
        duplicateRequest: null,
        deleteRequest: null,
        deriveRequest: null,
        buildTreeRequest: null,
      };

    case 'selectedRule.updated':
      if (!state.selectedRule) {
        return state;
      }

      return {
        ...state,
        selectedRule: {
          ...state.selectedRule,
          ...event.patch,
        },
      };

    case 'node.duplicateRequested':
      return {
        ...state,
        duplicateRequest: event.request,
      };

    case 'node.deleteRequested':
      return {
        ...state,
        deleteRequest: event.request,
      };

    case 'node.deriveRequested':
      return {
        ...state,
        deriveRequest: event.request,
      };

    case 'tree.buildRequested':
      return {
        ...state,
        buildTreeRequest: event.request,
      };

    case 'tree.built':
      return {
        ...state,
        builtTreeResult: event.result,
        buildTreeRequest: null,
      };

    case 'tree.resultCleared':
      return {
        ...state,
        builtTreeResult: null,
      };

    case 'transientRequests.cleared':
      return withClearedTransientRequests(state);

    default:
      return assertNever(event);
  }
}

function shouldTrackInHistory(event: Exclude<EditorEvent, UndoEvent | RedoEvent>): boolean {
  switch (event.type) {
    case 'node.selected':
      return true;

    case 'selectedRule.updated':
      return true;

    case 'node.duplicateRequested':
      return true;

    case 'node.deleteRequested':
      return true;

    case 'node.deriveRequested':
      return true;

    case 'transientRequests.cleared':
      return false;

    case 'tree.buildRequested':
      return false;

    case 'tree.built':
      return true;

    case 'tree.resultCleared':
      return false;

    default:
      return assertNever(event);
  }
}

function reducer(state: EditorHistoryState, event: EditorEvent): EditorHistoryState {
  switch (event.type) {
    case 'history.undo': {
      if (state.past.length === 0) return state;

      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);

      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case 'history.redo': {
      if (state.future.length === 0) return state;

      const next = state.future[0];
      const newFuture = state.future.slice(1);

      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }

    default: {
      const nextPresent = reducePresentState(state.present, event);

      if (nextPresent === state.present) {
        return state;
      }

      if (!shouldTrackInHistory(event)) {
        return {
          ...state,
          present: nextPresent,
        };
      }

      return {
        past: [...state.past, state.present],
        present: nextPresent,
        future: [],
      };
    }
  }
}

export function useRuleBuilderEditor() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: createInitialPresentState(),
    future: [],
  }));

  const selectNode = useCallback((nodeId: string | null, rule: RuleData | null) => {
    dispatch({
      type: 'node.selected',
      nodeId,
      rule,
    });
  }, []);

  const updateSelectedRule = useCallback((patch: Partial<RuleData>) => {
    dispatch({
      type: 'selectedRule.updated',
      patch,
    });
  }, []);

  const requestDuplicate = useCallback((sourceNodeId: string) => {
    dispatch({
      type: 'node.duplicateRequested',
      request: {
        requestId: Date.now(),
        sourceNodeId,
      },
    });
  }, []);

  const requestDelete = useCallback((sourceNodeId: string) => {
    dispatch({
      type: 'node.deleteRequested',
      request: {
        requestId: Date.now(),
        sourceNodeId,
      },
    });
  }, []);

  const requestDerive = useCallback((derivedRule: RuleData) => {
    dispatch({
      type: 'node.deriveRequested',
      request: {
        requestId: Date.now(),
        derivedRule,
      },
    });
  }, []);

  const clearTransientRequests = useCallback(() => {
    dispatch({
      type: 'transientRequests.cleared',
    });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'history.undo' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'history.redo' });
  }, []);

  const requestBuildTree = useCallback((startNodeId: string) => {
    dispatch({
      type: 'tree.buildRequested',
      request: {
        requestId: Date.now(),
        startNodeId,
      },
    });
  }, []);

  const setBuiltTreeResult = useCallback((result: BuiltTreeResult) => {
    dispatch({
      type: 'tree.built',
      result,
    });
  }, []);

  const clearBuiltTreeResult = useCallback(() => {
    dispatch({
      type: 'tree.resultCleared',
    });
  }, []);

  return {
    selectedNodeId: state.present.selectedNodeId,
    selectedRule: state.present.selectedRule,
    duplicateRequest: state.present.duplicateRequest,
    deleteRequest: state.present.deleteRequest,
    deriveRequest: state.present.deriveRequest,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    selectNode,
    updateSelectedRule,
    requestDuplicate,
    requestDelete,
    requestDerive,
    clearTransientRequests,
    undo,
    redo,
    buildTreeRequest: state.present.buildTreeRequest,
    builtTreeResult: state.present.builtTreeResult,
    requestBuildTree,
    setBuiltTreeResult,
    clearBuiltTreeResult,
  };
}