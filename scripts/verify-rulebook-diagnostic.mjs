const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
const GRAPH_ID = process.env.FIREBIM_TEST_GRAPH_ID || 'building_medium_ifc_inspired';
const RULE_ID = process.env.FIREBIM_TEST_RULE_ID || 'building-height';

function localNameFromToken(token) {
  if (!token) return null;
  if (token.includes('#')) return token.split('#').pop() ?? token;
  const parts = token.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : token;
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { ok: response.ok, json };
}

function extractFocusNodeIds(event) {
  const values = [event.target_node, event.sample_target].filter(Boolean);
  return values.map((value) => localNameFromToken(value)).filter(Boolean);
}

function computeStateChanges(diagnostic) {
  const targetClassByNode = new Map(
    (diagnostic.targets ?? []).map((target) => [
      localNameFromToken(target.target_node),
      localNameFromToken(target.target_class) || target.target_class || 'Unknown',
    ])
  );

  const steps = [];
  const previousStates = new Map();
  const visited = new Set();

  for (const event of diagnostic.sequence_events ?? []) {
    const focusNodeIds = extractFocusNodeIds(event);
    if (focusNodeIds.length === 0) continue;

    const changedByClass = new Map();

    for (const focusNodeId of focusNodeIds) {
      const previousState = previousStates.get(focusNodeId) ?? 1;
      const nextState = 2;
      if (previousState !== nextState) {
        const className = targetClassByNode.get(focusNodeId) || localNameFromToken(event.target_class) || 'Unknown';
        changedByClass.set(className, (changedByClass.get(className) || 0) + 1);
      }
    }

    for (const visitedNodeId of visited) {
      if (focusNodeIds.includes(visitedNodeId)) continue;
      const previousState = previousStates.get(visitedNodeId) ?? 1;
      const nextState = 3;
      if (previousState !== nextState) {
        const className = targetClassByNode.get(visitedNodeId) || 'Unknown';
        changedByClass.set(className, (changedByClass.get(className) || 0) + 1);
      }
    }

    focusNodeIds.forEach((focusNodeId) => {
      previousStates.set(focusNodeId, 2);
      visited.add(focusNodeId);
    });

    for (const visitedNodeId of visited) {
      if (!focusNodeIds.includes(visitedNodeId)) {
        previousStates.set(visitedNodeId, 3);
      }
    }

    steps.push({
      event_index: event.event_index,
      event_type: event.event_type,
      focus_nodes: focusNodeIds,
      changed_by_class: Object.fromEntries([...changedByClass.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    });
  }

  return steps;
}

async function main() {
  const compatibility = await postJson('/checks/compatibility', { graph_id: GRAPH_ID, rule_id: RULE_ID });
  const diagnostic = await postJson('/checks/run-diagnostic', {
    graph_id: GRAPH_ID,
    rule_id: RULE_ID,
    options: {
      solver: 'standard',
      inference: 'rdfs',
      advanced: true,
      include_targets: true,
      include_trace: true,
      debug: true,
    },
  });

  if (!compatibility.ok || !diagnostic.ok || !compatibility.json.success || !diagnostic.json.success) {
    throw new Error(`Diagnostic verification failed. compatibility=${JSON.stringify(compatibility.json)} diagnostic=${JSON.stringify(diagnostic.json)}`);
  }

  const stateChanges = computeStateChanges(diagnostic.json);

  if (stateChanges.length === 0) {
    throw new Error('No graph state changes were produced from diagnostic sequence events.');
  }

  const changedTotals = stateChanges.map((step) =>
    Object.values(step.changed_by_class).reduce((sum, count) => sum + count, 0)
  );

  if (changedTotals.every((count) => count === 0)) {
    throw new Error('Diagnostic sequence events did not change any graph node states.');
  }

  console.log(JSON.stringify({
    graph_id: GRAPH_ID,
    rule_id: RULE_ID,
    compatibility_score: compatibility.json.compatibility_score,
    diagnostic_summary: diagnostic.json.summary,
    state_changes: stateChanges,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
