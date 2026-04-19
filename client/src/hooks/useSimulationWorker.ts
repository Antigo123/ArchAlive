/**
 * Hook to manage the simulation Web Worker
 * 
 * Provides a clean React interface to the worker-based simulation.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMetricsStore } from '../stores/metricsStore';
import { useSimDataStore } from '../stores/simDataStore';

// Import worker using Vite's worker syntax
import SimulationWorker from '../workers/simulation.worker.ts?worker';

export interface UseSimulationWorkerResult {
    isReady: boolean;
    stats: {
        total_generated: number;
        total_processed: number;
        total_dropped: number;
        avg_latency: number;
    };
    // Refs for PacketLayerPixi to consume directly
    packetBufferRef: React.RefObject<Float32Array | null>;
    packetCountRef: React.RefObject<number>;
    nodeIdToIndexRef: React.RefObject<Map<string, number>>;
    // API
    syncTopology: (edges: any[], nodes: any[]) => void;
    updateNode: (nodeId: string, property: string, value: any) => void;
    removeNode: (nodeId: string) => void;
    setPaused: (paused: boolean) => void;
    resetStats: () => void;
}

export function useSimulationWorker(): UseSimulationWorkerResult {
    const [isReady, setIsReady] = useState(false);
    const [stats, setStats] = useState({
        total_generated: 0,
        total_processed: 0,
        total_dropped: 0,
        avg_latency: 0
    });

    const workerRef = useRef<Worker | null>(null);
    const packetBufferRef = useRef<Float32Array | null>(null);
    const packetCountRef = useRef<number>(0);
    const nodeIdToIndexRef = useRef<Map<string, number>>(new Map());

    // Track last topology signature to avoid redundant syncs
    const lastTopologyRef = useRef<string>('');

    // Initialize worker on mount
    useEffect(() => {
        const worker = new SimulationWorker();
        workerRef.current = worker;

        worker.onmessage = (event) => {
            const { data } = event;

            switch (data.type) {
                case 'ready':
                    setIsReady(true);
                    break;

                case 'packets':
                    if (data.buffer) {
                        packetBufferRef.current = new Float32Array(data.buffer);
                        packetCountRef.current = data.count;
                    } else {
                        packetBufferRef.current = null;
                        packetCountRef.current = 0;
                    }
                    break;

                case 'nodeStatus':
                    if (data.buffer) {
                        const statusBuffer = new Float32Array(data.buffer);
                        const idToIndex = new Map<string, number>(
                            Object.entries(data.nodeIdToIndex).map(([k, v]) => [k, v as number])
                        );
                        // Keep nodeIdToIndexRef in sync - the index assignment can shift after
                        // ClearEdges + AddEdge rebuilds the WASM node list, and the standalone
                        // 'nodeIdToIndex' message may arrive after packets that reference the
                        // new indices.  nodeStatus fires every ~200ms and carries the same
                        // mapping, so using it here closes the race window.
                        nodeIdToIndexRef.current = idToIndex;

                        // Update simulation data store (5 floats per node)
                        const updates: Record<string, {
                            current_load: number;
                            buffer_capacity: number;
                            processing_delay: number;
                            replicas: number;
                            total_processed: number;
                        }> = {};

                        for (const [id, idx] of idToIndex) {
                            const off = idx * 5;
                            updates[id] = {
                                current_load: statusBuffer[off],
                                buffer_capacity: statusBuffer[off + 1],
                                processing_delay: statusBuffer[off + 2],
                                replicas: statusBuffer[off + 3],
                                total_processed: statusBuffer[off + 4],
                            };
                        }

                        useSimDataStore.getState().updateNodes(updates);
                    }
                    break;

                case 'nodeIdToIndex':
                    nodeIdToIndexRef.current = new Map<string, number>(
                        Object.entries(data.mapping).map(([k, v]) => [k, v as number])
                    );
                    break;

                case 'stats':
                    setStats(data.stats);
                    useMetricsStore.getState().pushMetrics(data.currTick, data.stats);
                    break;

                case 'error':
                    console.error('[SimulationWorker] Error:', data.error);
                    break;
            }
        };

        worker.onerror = (error) => {
            console.error('[SimulationWorker] Worker error:', error);
        };

        // Worker auto-initializes, no need to send 'init' message

        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    // Sync topology with deduplication
    const syncTopology = useCallback((edges: any[], nodes: any[]) => {
        if (!workerRef.current || !isReady) return;

        // Build topology signature to avoid redundant syncs
        const topologySignature = edges.map(e =>
            `${e.source}|${e.target}|${e.sourceHandle || ''}|${e.targetHandle || ''}|${(e.data as any)?.latency_ms || 0}`
        ).sort().join(';');

        if (topologySignature === lastTopologyRef.current) {
            return;
        }
        lastTopologyRef.current = topologySignature;

        workerRef.current.postMessage({
            type: 'syncTopology',
            edges,
            nodes
        });
    }, [isReady]);

    // Update single node property
    const updateNode = useCallback((nodeId: string, property: string, value: any) => {
        if (!workerRef.current || !isReady) return;

        workerRef.current.postMessage({
            type: 'updateNode',
            nodeId,
            property,
            value
        });
    }, [isReady]);

    // Remove node
    const removeNode = useCallback((nodeId: string) => {
        if (!workerRef.current || !isReady) return;

        workerRef.current.postMessage({
            type: 'removeNode',
            nodeId
        });
    }, [isReady]);

    // Set paused state
    const setPaused = useCallback((paused: boolean) => {
        if (!workerRef.current) return;

        workerRef.current.postMessage({
            type: 'setPaused',
            paused
        });
    }, []);

    // Reset hook stats to zero (call alongside metricsStore.reset() on puzzle start)
    const resetStats = useCallback(() => {
        setStats({
            total_generated: 0,
            total_processed: 0,
            total_dropped: 0,
            avg_latency: 0
        });
    }, []);

    return {
        isReady,
        stats,
        packetBufferRef,
        packetCountRef,
        nodeIdToIndexRef,
        syncTopology,
        updateNode,
        removeNode,
        setPaused,
        resetStats
    };
}
