import {
    BaseEdge,
    getBezierPath,
    type EdgeProps,
} from '@xyflow/react';

export function LatencyEdge({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX, sourceY, sourcePosition,
        targetX, targetY, targetPosition,
    });

    return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
}
