import { useState, useEffect, useCallback, useRef } from 'react';
import type { Puzzle, PuzzleState } from '../puzzles/types';
import type { Node, Edge } from '@xyflow/react';
import type { Endpoint, Stream } from '../components/node-types';
import { useSimDataStore } from '../stores/simDataStore';

interface UsePuzzleProps {
    simStats: any; // GlobalStats from Rust
    onPuzzleComplete: (puzzleId: string) => void;
    nodes: Node[]; // Current nodes on canvas
    edges: Edge[]; // Current edges on canvas
}

export function usePuzzle({ simStats, onPuzzleComplete, nodes, edges }: UsePuzzleProps) {
    const [state, setState] = useState<PuzzleState>({
        currentPuzzle: null,
        status: 'idle',
        holdProgress: 0,
        currentTutorialStep: 0,
        metrics: {
            currentLatency: 0,
            currentThroughput: 0,
            currentDropped: 0
        }
    });

    const holdStartTimeRef = useRef<number | null>(null);
    const currentPuzzleRef = useRef<Puzzle | null>(null);
    const onPuzzleCompleteRef = useRef(onPuzzleComplete);
    const simStatsRef = useRef(simStats);

    // Keep refs in sync
    onPuzzleCompleteRef.current = onPuzzleComplete;
    simStatsRef.current = simStats;

    // Only re-trigger effects when a tutorial is actively running
    const activeSimStats = state.status === 'running' ? simStats : null;

    const startPuzzle = useCallback((puzzle: Puzzle) => {
        currentPuzzleRef.current = puzzle;
        setState({
            currentPuzzle: puzzle,
            status: 'running',
            holdProgress: 0,
            currentTutorialStep: 0,
            metrics: { currentLatency: 0, currentThroughput: 0, currentDropped: 0 }
        });
        holdStartTimeRef.current = null;
    }, []);

    const stopPuzzle = useCallback(() => {
        currentPuzzleRef.current = null;
        setState(prev => ({ ...prev, status: 'idle', currentPuzzle: null, currentTutorialStep: 0 }));
        holdStartTimeRef.current = null;
    }, []);

    // Tutorial Step Detection
    useEffect(() => {
        if (state.status !== 'running') return;
        const puzzle = currentPuzzleRef.current;
        if (!puzzle || !puzzle.tutorialSteps) return;

        const currentStep = puzzle.tutorialSteps[state.currentTutorialStep];
        if (!currentStep) return;

        let stepMet = false;

        switch (currentStep.condition) {
            case 'node_added': {
                const requiredType = currentStep.conditionParams?.nodeType;
                const requiredCount = currentStep.conditionParams?.count || 1;

                if (requiredType) {
                    const matchingNodes = nodes.filter(n => n.type === requiredType);
                    stepMet = matchingNodes.length >= requiredCount;
                } else {
                    stepMet = nodes.length >= requiredCount;
                }
                break;
            }
            case 'all_nodes_added': {
                // Passes when at least one node of each specified type exists
                const requiredTypes = currentStep.conditionParams?.nodeTypes as string[] || [];
                stepMet = requiredTypes.every(type => nodes.some(n => n.type === type));
                break;
            }
            case 'edge_added': {
                const sourceType = currentStep.conditionParams?.sourceType;
                const targetType = currentStep.conditionParams?.targetType;
                const requiredCount = currentStep.conditionParams?.count || 1;

                if (sourceType || targetType) {
                    const matchingEdges = edges.filter(e => {
                        const sourceNode = nodes.find(n => n.id === e.source);
                        const targetNode = nodes.find(n => n.id === e.target);
                        if (!sourceNode || !targetNode) return false;

                        const sourceMatch = !sourceType || sourceNode.type === sourceType;
                        const targetMatch = !targetType || targetNode.type === targetType;
                        return sourceMatch && targetMatch;
                    });
                    stepMet = matchingEdges.length >= requiredCount;
                } else {
                    stepMet = edges.length >= requiredCount;
                }
                break;
            }
            case 'forwarding_configured': {
                // Check if any endpoint forwards to a service AND does NOT forward to __return__
                stepMet = nodes.some(n => {
                    if (n.type !== 'server') return false;
                    const endpoints = (n.data?.endpoints as Endpoint[]) || [];
                    return endpoints.some((ep) => {
                        const forwardTo = ep.forward_to || [];
                        const hasValidTarget = forwardTo.some((target: any) => target.target_id && target.target_id !== '__return__');
                        const hasReturnTarget = forwardTo.some((target: any) => target.target_id === '__return__');
                        return hasValidTarget && !hasReturnTarget;
                    });
                });
                break;
            }
            case 'return_removed': {
                // Check that no server endpoint still forwards to __return__
                stepMet = nodes.some(n => {
                    if (n.type !== 'server') return false;
                    const endpoints = (n.data?.endpoints as Endpoint[]) || [];
                    if (endpoints.length === 0) return false;
                    return endpoints.every((ep) => {
                        const forwardTo = ep.forward_to || [];
                        return !forwardTo.some((target: any) => target.target_id === '__return__');
                    });
                });
                break;
            }
            case 'url_configured': {
                const requiredPath = currentStep.conditionParams?.path;
                const requiredMethod = currentStep.conditionParams?.method;
                const requiredType = currentStep.conditionParams?.nodeType;
                const requiredCount = currentStep.conditionParams?.count || 1;

                if (requiredPath) {
                    const matchCount = nodes.filter(n => {
                        if (requiredType && n.type !== requiredType) return false;

                        if (n.type === 'client') {
                            const streams = (n.data?.streams as Stream[]) || [];
                            return streams.some((s) => {
                                const pathMatch = s.path === requiredPath;
                                const methodMatch = !requiredMethod || s.method === requiredMethod;
                                return pathMatch && methodMatch;
                            });
                        }
                        if (n.type === 'server') {
                            const endpoints = (n.data?.endpoints as Endpoint[]) || [];
                            const dependencies = (n.data?.dependencies as any[]) || [];

                            const endpointMatch = endpoints.some((ep) => {
                                const pathMatch = ep.path === requiredPath;
                                const methodMatch = !requiredMethod || ep.method === requiredMethod;
                                return pathMatch && methodMatch;
                            });

                            const dependencyMatch = dependencies.some((dep) => {
                                const pathMatch = dep.path === requiredPath;
                                const methodMatch = !requiredMethod || dep.method === requiredMethod;
                                return pathMatch && methodMatch;
                            });

                            return endpointMatch || dependencyMatch;
                        }
                        return false;
                    }).length;

                    stepMet = matchCount >= requiredCount;
                }
                break;
            }
            case 'field_configured': {
                const field = currentStep.conditionParams?.field;
                const value = currentStep.conditionParams?.value;
                const nodeType = currentStep.conditionParams?.nodeType;

                if (field && value) {
                    stepMet = nodes.some(n => {
                        if (nodeType && n.type !== nodeType) return false;

                        // Support nested paths like "dependencies.0.label"
                        const path = field.split('.');
                        let current: any = n.data;
                        for (const key of path) {
                            if (current && typeof current === 'object') {
                                current = current[key];
                            } else {
                                current = undefined;
                                break;
                            }
                        }
                        return current === value;
                    });
                }
                break;
            }
            case 'dependency_added': {
                // Check if a server (or specified node type) has at least N dependencies configured
                const requiredNodeType = currentStep.conditionParams?.nodeType || 'server';
                const requiredCount = currentStep.conditionParams?.count || 1;
                stepMet = nodes.some(n => {
                    if (n.type !== requiredNodeType) return false;
                    const deps = (n.data?.dependencies as any[]) || [];
                    return deps.length >= requiredCount;
                });
                break;
            }
            case 'endpoint_added': {
                // Check if a server (or specified node type) has at least N input endpoints configured
                const requiredNodeType = currentStep.conditionParams?.nodeType || 'server';
                const requiredCount = currentStep.conditionParams?.count || 1;
                stepMet = nodes.some(n => {
                    if (n.type !== requiredNodeType) return false;
                    const eps = (n.data?.endpoints as any[]) || [];
                    return eps.length >= requiredCount;
                });
                break;
            }
            case 'traffic_flowing': {
                stepMet = (simStatsRef.current?.total_processed || 0) > 0;
                break;
            }
            case 'drops_observed': {
                stepMet = (simStatsRef.current?.total_dropped || 0) > 0;
                break;
            }
            case 'url_mismatch_observed': {
                // Check if there's a client connected to a server with mismatched URLs
                // This triggers after the user connects them but before they fix the URL
                const hasClientServerEdge = edges.some(e => {
                    const sourceNode = nodes.find(n => n.id === e.source);
                    const targetNode = nodes.find(n => n.id === e.target);
                    return sourceNode?.type === 'client' && targetNode?.type === 'server';
                });

                if (hasClientServerEdge) {
                    // Check if URLs actually mismatch
                    const clientNode = nodes.find(n => n.type === 'client');
                    const serverNode = nodes.find(n => n.type === 'server');
                    if (clientNode && serverNode) {
                        const clientStreams = (clientNode.data?.streams as Stream[]) || [];
                        const serverEndpoints = (serverNode.data?.endpoints as Endpoint[]) || [];
                        const clientPaths = clientStreams.map((s) => s.path);
                        const serverPaths = serverEndpoints.map((ep) => ep.path);
                        // Mismatch = client has paths that server doesn't listen to
                        const hasMismatch = clientPaths.some((p: string) => !serverPaths.includes(p));
                        stepMet = hasMismatch;
                    }
                }
                break;
            }
        }

        // Advance to next step if condition met
        if (stepMet && state.currentTutorialStep < puzzle.tutorialSteps.length - 1) {
            // Check if we need to move forward (conditions are cumulative)
            const nextStep = puzzle.tutorialSteps[state.currentTutorialStep + 1];
            if (nextStep) {
                setState(prev => ({ ...prev, currentTutorialStep: prev.currentTutorialStep + 1 }));
            }
        } else if (stepMet && state.currentTutorialStep === puzzle.tutorialSteps.length - 1) {
            // Final step met - mark as complete
            setState(prev => ({ ...prev, currentTutorialStep: puzzle.tutorialSteps!.length }));
        }
    }, [nodes, edges, activeSimStats, state.status, state.currentTutorialStep]);

    // Game Loop Check (runs whenever stats update)
    useEffect(() => {
        if (state.status !== 'running') return;

        const puzzle = currentPuzzleRef.current;
        if (!puzzle) return;

        const stats = simStatsRef.current;
        const metrics = {
            currentLatency: (stats?.avg_latency || 0) / 60,
            currentThroughput: stats?.total_processed || 0,
            currentDropped: stats?.total_dropped || 0,
        };

        // Check if tutorial is complete (required before win can be achieved)
        const tutorialSteps = puzzle.tutorialSteps || [];
        const tutorialComplete = tutorialSteps.length === 0 || state.currentTutorialStep >= tutorialSteps.length;

        // Per-condition activeAfterStep: a condition is only checked once the tutorial
        // has advanced past its specified step index. If no activeAfterStep is set, the
        // condition requires full tutorial completion (legacy behaviour).
        const winConditions = puzzle.winConditions || [];
        const anyConditionActive = winConditions.some(cond => {
            const threshold = cond.activeAfterStep ?? tutorialSteps.length;
            return state.currentTutorialStep >= threshold;
        });

        if (!tutorialComplete && !anyConditionActive) {
            setState(prev => ({ ...prev, holdProgress: 0, metrics }));
            return;
        }

        // No win conditions: if tutorial is complete, mark as won; otherwise just update metrics
        if (winConditions.length === 0) {
            if (tutorialComplete) {
                setState(prev => ({ ...prev, status: 'won', holdProgress: 1, metrics }));
            } else {
                setState(prev => ({ ...prev, metrics }));
            }
            return;
        }

        // Check Win Conditions
        const simDataNodes = useSimDataStore.getState().nodes;
        const allConditionsMet = winConditions.every(cond => {
            // Skip conditions that aren't active yet
            const threshold = cond.activeAfterStep ?? tutorialSteps.length;
            if (state.currentTutorialStep < threshold) return false;

            let metricValue = 0;
            if (cond.metric === 'avg_latency') {
                // Latency conditions require at least some traffic to be valid
                if (metrics.currentThroughput === 0) return false;
                metricValue = metrics.currentLatency;
            }
            else if (cond.metric === 'total_processed') metricValue = metrics.currentThroughput;
            else if (cond.metric === 'dropped_packets' || cond.metric === 'total_dropped') metricValue = metrics.currentDropped;
            else if (cond.metric === 'node_type_processed') {
                // Sum total_processed across all nodes of the specified type
                const nodeType = cond.nodeType;
                metricValue = Object.entries(simDataNodes)
                    .filter(([id]) => nodeType ? id.includes(nodeType) : true)
                    .reduce((sum, [, data]) => sum + (data.total_processed ?? 0), 0);
            }

            switch (cond.operator) {
                case '<': return metricValue < cond.value;
                case '>': return metricValue > cond.value;
                case '<=': return metricValue <= cond.value;
                case '>=': return metricValue >= cond.value;
                default: return false;
            }
        });

        if (allConditionsMet) {
            if (!holdStartTimeRef.current) {
                holdStartTimeRef.current = performance.now();
            }

            const holdDurationMs = ((puzzle.winConditions || [])[0]?.holdDurationSeconds || 0) * 1000;
            const elapsed = performance.now() - holdStartTimeRef.current;
            const progress = holdDurationMs > 0 ? Math.min(elapsed / holdDurationMs, 1) : 1;

            setState(prev => ({ ...prev, holdProgress: progress, metrics }));

            if (progress >= 1) {
                setState(prev => ({ ...prev, status: 'won' }));
                onPuzzleCompleteRef.current(puzzle.id);
            }
        } else {
            holdStartTimeRef.current = null;
            setState(prev => ({ ...prev, holdProgress: 0, metrics }));
        }

    }, [activeSimStats, state.status]); // Only depend on simStats and status, not the puzzle object

    return {
        puzzleState: state,
        startPuzzle,
        stopPuzzle
    };
}
