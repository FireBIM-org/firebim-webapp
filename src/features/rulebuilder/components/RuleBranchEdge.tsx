import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export function RuleBranchEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  markerStart,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  return <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} markerStart={markerStart} />;
}

export default RuleBranchEdge;
