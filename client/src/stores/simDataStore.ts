import { create } from 'zustand';

/**
 * Store for high-frequency simulation data (current_load, replicas, etc.).
 * This data updates every ~200ms and is separated from React node state to prevent
 * expensive React reconciliation on every update.
 *
 * Node components subscribe to individual slices via shallow selectors.
 */

export interface SimNodeData {
    current_load: number;
    buffer_capacity: number;
    processing_delay: number;
    replicas: number;
    total_processed: number;
}

interface SimDataState {
    nodes: Record<string, SimNodeData>;

    // Batch update all nodes at once (called from simulation loop)
    updateNodes: (updates: Record<string, Partial<SimNodeData>>) => void;

    // Update single node
    updateNode: (id: string, data: Partial<SimNodeData>) => void;

    // Clear all data (e.g., when resetting simulation)
    clear: () => void;
}

export const useSimDataStore = create<SimDataState>((set) => ({
    nodes: {},

    updateNodes: (updates) => set((state) => {
        const newNodes = { ...state.nodes };
        let hasChanges = false;

        for (const [id, update] of Object.entries(updates)) {
            const existing = newNodes[id];
            if (!existing) {
                // New node
                newNodes[id] = {
                    current_load: update.current_load ?? 0,
                    buffer_capacity: update.buffer_capacity ?? 100,
                    processing_delay: update.processing_delay ?? 0,
                    replicas: update.replicas ?? 1,
                    total_processed: update.total_processed ?? 0,
                };
                hasChanges = true;
            } else {
                // Check for changes with tolerance
                const loadChanged = update.current_load !== undefined &&
                    Math.abs(update.current_load - existing.current_load) > 0.01;
                const capacityChanged = update.buffer_capacity !== undefined &&
                    Math.abs(update.buffer_capacity - existing.buffer_capacity) > 0.01;
                const delayChanged = update.processing_delay !== undefined &&
                    Math.abs(update.processing_delay - existing.processing_delay) > 0.01;
                const replicasChanged = update.replicas !== undefined &&
                    Math.abs(update.replicas - existing.replicas) > 0.01;
                const processedChanged = update.total_processed !== undefined &&
                    update.total_processed !== existing.total_processed;

                if (loadChanged || capacityChanged || delayChanged || replicasChanged || processedChanged) {
                    newNodes[id] = {
                        ...existing,
                        ...(loadChanged && { current_load: update.current_load! }),
                        ...(capacityChanged && { buffer_capacity: update.buffer_capacity! }),
                        ...(delayChanged && { processing_delay: update.processing_delay! }),
                        ...(replicasChanged && { replicas: update.replicas! }),
                        ...(processedChanged && { total_processed: update.total_processed! }),
                    };
                    hasChanges = true;
                }
            }
        }

        return hasChanges ? { nodes: newNodes } : state;
    }),

    updateNode: (id, data) => set((state) => ({
        nodes: {
            ...state.nodes,
            [id]: { ...state.nodes[id], ...data },
        },
    })),

    clear: () => set({ nodes: {} }),
}));

// Selector hook for individual node - use with shallow comparison
export const useNodeSimData = (nodeId: string): SimNodeData | undefined => {
    return useSimDataStore((state) => state.nodes[nodeId]);
};
