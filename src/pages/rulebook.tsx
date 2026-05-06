import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useState } from 'react';

import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { env } from '../config/env';
import { BuildingGraphView } from '../features/rulebook/components/BuildingGraphView';
import { ExecutionConsole } from '../features/rulebook/components/ExecutionConsole';
import { GraphToolbar } from '../features/rulebook/components/GraphToolbar';
import RuleBookLibraryPanel from '../features/rulebook/components/RuleBookLibraryPanel';
import { RuleRunner } from '../features/rulebook/components/RuleRunner';
import { RuleSummaryPanel } from '../features/rulebook/components/RuleSummaryPanel';
import { buildRuleRunnerExecutionTimeline } from '../features/rulebook/execution';
import { useRuleBookStore, type RuleBookStore } from '../features/rulebook/store';
import { useRequireAuth } from '../hooks/useRequireAuth';

export default function RuleBookPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const rules_api_online = useRuleBookStore((state: RuleBookStore) => state.rules_api_online);
  const runner_rule_items = useRuleBookStore((state: RuleBookStore) => state.runner_rule_items);
  const available_rules = useRuleBookStore((state: RuleBookStore) => state.available_rules);
  const active_graph_data = useRuleBookStore((state: RuleBookStore) => state.active_graph_data);
  const graph_loaded = useRuleBookStore((state: RuleBookStore) => state.graph_loaded);
  const execution_solver = useRuleBookStore((state: RuleBookStore) => state.execution_solver);
  const execution_status = useRuleBookStore((state: RuleBookStore) => state.execution_status);
  const execution_timeline = useRuleBookStore((state: RuleBookStore) => state.execution_timeline);
  const current_step_index = useRuleBookStore((state: RuleBookStore) => state.current_step_index);
  const execution_playback_ms = useRuleBookStore(
    (state: RuleBookStore) => state.execution_playback_ms,
  );

  const setRulesLoading = useRuleBookStore((state: RuleBookStore) => state.setRulesLoading);
  const setRulesError = useRuleBookStore((state: RuleBookStore) => state.setRulesError);
  const setExecutionStatus = useRuleBookStore((state: RuleBookStore) => state.setExecutionStatus);
  const setExecutionTimeline = useRuleBookStore(
    (state: RuleBookStore) => state.setExecutionTimeline,
  );
  const setCurrentStepIndex = useRuleBookStore((state: RuleBookStore) => state.setCurrentStepIndex);
  const setExecutionPlaybackMs = useRuleBookStore(
    (state: RuleBookStore) => state.setExecutionPlaybackMs,
  );

  const swaggerDocsUrl = env.apiDocsUrl;
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [graphCollapsed, setGraphCollapsed] = useState(false);

  useEffect(() => {
    const step_count = execution_timeline?.steps.length ?? 0;

    if (execution_status !== 'running' || !execution_timeline || step_count === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (current_step_index >= step_count - 1) {
        setExecutionStatus('complete');
        return;
      }

      const nextIndex = current_step_index + 1;
      setCurrentStepIndex(nextIndex);

      if (nextIndex >= step_count - 1) {
        setExecutionStatus('complete');
      }
    }, execution_playback_ms);

    return () => window.clearTimeout(timer);
  }, [
    current_step_index,
    execution_playback_ms,
    execution_status,
    execution_timeline,
    setCurrentStepIndex,
    setExecutionStatus,
  ]);

  const handleRun = useCallback(async () => {
    if (!graph_loaded || !active_graph_data || runner_rule_items.length === 0) {
      return;
    }

    if (active_graph_data.source !== 'api') {
      setRulesError(
        'Backend checks require a stored building graph from the Graphs API. Select a stored graph from the API section in the graph dropdown.',
      );
      setExecutionStatus('ready');
      return;
    }

    setRulesLoading(true);
    setRulesError(null);

    try {
      const timeline = await buildRuleRunnerExecutionTimeline({
        active_graph_data,
        runner_rule_items,
        available_rules,
        solver: execution_solver,
      });

      setExecutionTimeline(timeline);
      setCurrentStepIndex(0);
      setExecutionPlaybackMs(900);
      setExecutionStatus('paused');
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : 'Failed to run Rule Runner');
      setExecutionTimeline(null);
      setExecutionStatus('ready');
    } finally {
      setRulesLoading(false);
    }
  }, [
    active_graph_data,
    available_rules,
    execution_solver,
    graph_loaded,
    runner_rule_items,
    setCurrentStepIndex,
    setExecutionStatus,
    setExecutionTimeline,
    setRulesError,
    setRulesLoading,
    setExecutionPlaybackMs,
  ]);

  const handleCanvasRun = useCallback(async () => {
    if (!graph_loaded || !active_graph_data || runner_rule_items.length === 0) {
      return;
    }

    if (active_graph_data.source !== 'api') {
      setRulesError(
        'Backend checks require a stored building graph from the Graphs API. Select a stored graph from the API section in the graph dropdown.',
      );
      setExecutionStatus('ready');
      return;
    }

    setRulesLoading(true);
    setRulesError(null);

    try {
      const timeline = await buildRuleRunnerExecutionTimeline({
        active_graph_data,
        runner_rule_items,
        available_rules,
        solver: execution_solver,
      });

      setExecutionTimeline(timeline);
      setCurrentStepIndex(0);
      setExecutionPlaybackMs(90);
      setExecutionStatus('running');
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : 'Failed to run Rule Runner');
      setExecutionTimeline(null);
      setExecutionStatus('ready');
    } finally {
      setRulesLoading(false);
    }
  }, [
    active_graph_data,
    available_rules,
    execution_solver,
    graph_loaded,
    runner_rule_items,
    setCurrentStepIndex,
    setExecutionPlaybackMs,
    setExecutionStatus,
    setExecutionTimeline,
    setRulesError,
    setRulesLoading,
  ]);

  const handleToggleExpanded = useCallback(() => {
    setGraphExpanded((value) => {
      const next = !value;
      if (next) {
        setGraphCollapsed(false);
      }
      return next;
    });
  }, []);

  const handleToggleCollapsed = useCallback(() => {
    if (graphExpanded) {
      setGraphExpanded(false);
      setGraphCollapsed(true);
      return;
    }

    setGraphCollapsed((value) => !value);
  }, [graphExpanded]);

  const graphPaneClass = graphExpanded
    ? 'min-h-0 flex-1 p-4'
    : graphCollapsed
      ? 'shrink-0 px-4 pt-2 pb-2'
      : 'min-h-0 flex-1 p-4';

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="RuleBook | FireBIM">
      <div className="rule-workspace-frame">
        <div className="rule-workspace-frame-header">
          <div className="rule-workspace-frame-header-row">
            <div>
              <div className="rule-workspace-header">RuleBook</div>
              <div className="text-xs text-gray-500">
                Browse stored rules, load graphs, and run backend checks
              </div>
            </div>

            <div className="rule-workspace-api-slot">
              <a
                href={swaggerDocsUrl}
                target="_blank"
                rel="noreferrer"
                className="rule-workspace-api-link"
                title="Open Swagger docs"
              >
                <span className={rules_api_online ? 'text-green-600' : 'text-red-600'}>
                  {rules_api_online ? 'API online' : 'API offline'}
                </span>
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-gray-500" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex h-[78vh] min-h-[680px]">
          {!graphExpanded && <RuleBookLibraryPanel showApiStatus={false} />}

          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50">
            {!graphExpanded && <GraphToolbar />}
            {!graphExpanded && <RuleRunner onRun={() => void handleRun()} />}

            <div className={graphPaneClass}>
              <BuildingGraphView
                expanded={graphExpanded}
                collapsed={graphCollapsed}
                onToggleExpanded={handleToggleExpanded}
                onToggleCollapsed={handleToggleCollapsed}
                onRun={() => void handleCanvasRun()}
              />
            </div>

            {!graphExpanded && <ExecutionConsole />}
          </div>

          {!graphExpanded && <RuleSummaryPanel />}
        </div>
      </div>
    </Layout>
  );
}
