import type { Node, Edge } from '@xyflow/react';

export interface WinCondition {
    metric: 'avg_latency' | 'throughput' | 'dropped_packets' | 'total_dropped' | 'total_processed' | 'node_type_processed';
    operator: '<' | '>' | '<=' | '>=';
    value: number;
    description: string;
    // For node_type_processed: which node type prefix to sum (e.g. 'database')
    nodeType?: string;
    // How long the condition must be met (in seconds) to count as a win
    holdDurationSeconds?: number;
    // Only start checking this condition once the tutorial has reached this step index (0-based)
    activeAfterStep?: number;
}

// Tutorial step for guided tutorials
export interface TutorialStep {
    id: string;
    title: string;
    hint: string;
    // Optional override for the highlight in TutorialOverlay
    highlight?: {
        selector: string;
        arrow: 'left' | 'right' | 'top' | 'bottom' | null;
    };
    // Condition to advance to next step
    condition: 'node_added' | 'all_nodes_added' | 'edge_added' | 'url_configured' | 'traffic_flowing' | 'forwarding_configured' | 'return_removed' | 'url_mismatch_observed' | 'field_configured' | 'dependency_added' | 'endpoint_added' | 'drops_observed';
    conditionParams?: {
        nodeType?: string; // Optional: Only check specific node type (e.g. 'server')
        nodeTypes?: string[]; // For all_nodes_added: list of types that must all be present
        path?: string;
        method?: string; // HTTP method (GET, POST, etc.)
        sourceType?: string; // For edge_added: source node type
        targetType?: string; // For edge_added: target node type
        count?: number; // Minimum number of items required (default: 1)
        field?: string; // For field_configured: path to data (e.g. 'dependencies.0.label')
        value?: any; // For field_configured: expected value
    };
}

export interface Puzzle {
    id: string;
    title: string;
    description: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    initialState: {
        nodes: Node[];
        edges: Edge[];
        viewport?: { x: number; y: number; zoom: number };
    };
    winConditions?: WinCondition[];
    permissions?: {
        allowedNodes?: string[]; // If undefined, all allowed. If [], none.
        editableFields?: string[]; // e.g., 'client.rate', 'server.endpoints'
    };
    tutorialSteps?: TutorialStep[]; // Optional guided tutorial
}

export type PuzzleStatus = 'idle' | 'running' | 'won' | 'failed';

export interface PuzzleState {
    currentPuzzle: Puzzle | null;
    status: PuzzleStatus;
    holdProgress: number; // 0 to 1 (progress towards holdDuration)
    currentTutorialStep: number; // Index of current tutorial step (0-based)
    metrics: {
        currentLatency: number;
        currentThroughput: number;
        currentDropped: number;
    };
}
