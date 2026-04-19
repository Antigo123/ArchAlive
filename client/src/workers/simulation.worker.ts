/**
 * Simulation Web Worker
 * 
 * Owns the WASM simulation completely, running it off the main thread.
 * Communicates with main thread via postMessage.
 */

// Import WASM - Vite handles worker imports properly
import init, { Simulation as SimClass } from 'simulation';

// State
let sim: any = null;
let wasmMemory: WebAssembly.Memory | null = null;
let isPaused = false;
import type { Endpoint } from '../components/node-types';

// Tick loop state
let tickCounter = 0;
let lastTime = performance.now();
const TARGET_FPS = 60;
const TARGET_MS = 1000 / TARGET_FPS;
let accumulator = 0;

// Node ID to index mapping (for main thread lookups)
let nodeIdToIndex: Map<string, number> = new Map();

// Message types
type WorkerMessage =
    | { type: 'init' }
    | { type: 'syncTopology'; edges: any[]; nodes: any[] }
    | { type: 'updateNode'; nodeId: string; property: string; value: any }
    | { type: 'removeNode'; nodeId: string }
    | { type: 'setPaused'; paused: boolean };

// Initialize WASM
async function initialize() {
    try {
        const wasm = await init();
        wasmMemory = wasm.memory;
        sim = new SimClass();

        self.postMessage({ type: 'ready' });

        // Start tick loop
        startTickLoop();
    } catch (error) {
        console.error('[SimWorker] Initialization error:', error);
        self.postMessage({ type: 'error', error: String(error) });
    }
}

// Tick loop running in worker
function startTickLoop() {
    const tick = () => {
        if (!sim || !wasmMemory) {
            requestAnimationFrame(tick);
            return;
        }

        const now = performance.now();
        const delta = now - lastTime;
        lastTime = now;
        accumulator += delta;

        // Cap accumulator to prevent spiral of death
        if (accumulator > 500) accumulator = 500;

        let state: any = null;
        let ticked = false;

        while (accumulator >= TARGET_MS) {
            accumulator -= TARGET_MS;
            if (!isPaused) {
                state = sim.tick();
                ticked = true;
                tickCounter++;
            }
        }

        if (ticked && state) {
            // Send packet buffer as transferable
            sendPacketData();

            // Send node status every 12 ticks (~200ms)
            if (tickCounter % 12 === 0) {
                sendNodeStatus();
            }

            // Send stats every 30 ticks (~500ms)
            if (state.stats && tickCounter % 30 === 0) {
                self.postMessage({
                    type: 'stats',
                    stats: state.stats,
                    currTick: state.curr_tick || tickCounter
                });
            }
        }

        requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

// Send packet buffer to main thread
function sendPacketData() {
    if (!sim || !wasmMemory) return;

    const simAny = sim as any;
    const ptr = simAny.get_packet_buffer_ptr();
    const totalFloats = simAny.get_packet_buffer_len();

    if (totalFloats === 0) {
        self.postMessage({ type: 'packets', count: 0, buffer: null });
        return;
    }

    // Copy packet data to transferable buffer
    const sourceBuffer = new Float32Array(wasmMemory.buffer, ptr, totalFloats);
    const packetBuffer = new Float32Array(totalFloats);
    packetBuffer.set(sourceBuffer);

    const count = totalFloats / 9;

    self.postMessage(
        { type: 'packets', count, buffer: packetBuffer.buffer },
        { transfer: [packetBuffer.buffer] }
    );
}

// Send node status to main thread
function sendNodeStatus() {
    if (!sim || !wasmMemory) return;

    const simAny = sim as any;
    if (!simAny.get_node_status_buffer_ptr) return;

    const ptr = simAny.get_node_status_buffer_ptr();
    const len = simAny.get_node_status_buffer_len();

    if (len === 0) return;

    // Copy status data
    const sourceBuffer = new Float32Array(wasmMemory.buffer, ptr, len);
    const statusBuffer = new Float32Array(len);
    statusBuffer.set(sourceBuffer);

    // Send with node ID mapping
    self.postMessage(
        {
            type: 'nodeStatus',
            buffer: statusBuffer.buffer,
            nodeIdToIndex: Object.fromEntries(nodeIdToIndex)
        },
        { transfer: [statusBuffer.buffer] }
    );
}

// Sync topology from main thread
function syncTopology(edges: any[], nodes: any[]) {
    if (!sim) return;

    const simAny = sim as any;

    // Clear and rebuild edges
    sim.clear_edges();
    edges.forEach(edge => {
        sim!.add_edge(
            edge.source,
            edge.target,
            edge.sourceHandle || "right",
            edge.targetHandle || "left",
            (edge.data?.latency_ms as number) || 0
        );
    });

    // Sync node configuration
    nodes.forEach(node => {
        if (node.data.streams && simAny.set_node_streams) {
            simAny.set_node_streams(node.id, node.data.streams);
        }
        if (node.data.cache_hit_rate !== undefined && simAny.set_node_cache_hit_rate) {
            simAny.set_node_cache_hit_rate(node.id, node.data.cache_hit_rate);
        }
        if (node.data.buffer_capacity !== undefined && simAny.set_node_capacity) {
            simAny.set_node_capacity(node.id, node.data.buffer_capacity);
        }
        if (node.data.processing_delay !== undefined && simAny.set_node_delay) {
            simAny.set_node_delay(node.id, node.data.processing_delay as number);
        }
        if (node.data.request_rate !== undefined && simAny.set_node_request_rate) {
            simAny.set_node_request_rate(node.id, node.data.request_rate);
        }
        if (node.type === 'api_gateway' && simAny.set_node_endpoints) {
            // Always derive endpoints from dependencies so each output only receives
            // packets whose method+path matches exactly. This overrides any stale or
            // empty endpoints array that may be stored in node data.
            const deps: any[] = Array.isArray(node.data.dependencies) ? node.data.dependencies : [];
            const derivedEps = deps.map((dep: any) => ({
                id: `ep-${dep.id}`,
                method: dep.method || 'GET',
                path: dep.path || '/',
                forward_to: [{ target_id: dep.id, delay: 0 }],
                strategy: 'round_robin',
                error_rate: 0,
                rate: 0,
            }));
            simAny.set_node_endpoints(node.id, derivedEps);
        } else if (node.data.endpoints && simAny.set_node_endpoints) {
            const sanitizedEps = (node.data.endpoints as Endpoint[]).map(ep => ({
                ...ep,
                forward_to: Array.isArray(ep.forward_to) ? ep.forward_to : (ep.forward_to ? [ep.forward_to] : [])
            }));
            simAny.set_node_endpoints(node.id, sanitizedEps);
        }
        if (node.data.dependencies && simAny.set_node_dependencies) {
            simAny.set_node_dependencies(node.id, node.data.dependencies);
        }
    });

    // CRITICAL: Call tick() to flush pending operations - WASM creates nodes lazily
    sim.tick();

    // Immediately push node status so the main thread sees all nodes at 0 load
    // before packets start arriving. Without this, status isn't sent until the
    // next tickCounter % 12 interval (~200ms), by which point nodes already have load.
    sendNodeStatus();

    // Rebuild node ID to index map using get_node_index for each node
    nodeIdToIndex = new Map();
    nodes.forEach(node => {
        const idx = sim!.get_node_index(node.id);
        if (idx >= 0) {
            nodeIdToIndex.set(node.id, idx);
        }
    });

    // Send updated mapping to main thread
    self.postMessage({
        type: 'nodeIdToIndex',
        mapping: Object.fromEntries(nodeIdToIndex)
    });
}

// Update single node property
function updateNode(nodeId: string, property: string, value: any) {
    if (!sim) return;

    const simAny = sim as any;

    switch (property) {
        case 'streams':
            if (simAny.set_node_streams) simAny.set_node_streams(nodeId, value);
            break;
        case 'cache_hit_rate':
            if (simAny.set_node_cache_hit_rate) simAny.set_node_cache_hit_rate(nodeId, value);
            break;
        case 'buffer_capacity':
            if (simAny.set_node_capacity) simAny.set_node_capacity(nodeId, value);
            break;
        case 'processing_delay':
            if (sim.set_node_delay) sim.set_node_delay(nodeId, value);
            break;
        case 'request_rate':
            if (simAny.set_node_request_rate) simAny.set_node_request_rate(nodeId, value);
            break;
        case 'endpoints':
            if (simAny.set_node_endpoints) {
                const sanitizedEps = (value as Endpoint[]).map(ep => ({
                    ...ep,
                    forward_to: Array.isArray(ep.forward_to) ? ep.forward_to : (ep.forward_to ? [ep.forward_to] : [])
                }));
                simAny.set_node_endpoints(nodeId, sanitizedEps);
            }
            break;
        case 'dependencies':
            if (simAny.set_node_dependencies) simAny.set_node_dependencies(nodeId, value);
            break;
    }
}

// Remove node
function removeNode(nodeId: string) {
    if (!sim) return;
    const simAny = sim as any;
    if (simAny.remove_node) {
        simAny.remove_node(nodeId);
    }
}

// Message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { data } = event;

    switch (data.type) {
        case 'init':
            initialize();
            break;
        case 'syncTopology':
            syncTopology(data.edges, data.nodes);
            break;
        case 'updateNode':
            updateNode(data.nodeId, data.property, data.value);
            break;
        case 'removeNode':
            removeNode(data.nodeId);
            break;
        case 'setPaused':
            isPaused = data.paused;
            break;
    }
};

// Auto-initialize on worker start
initialize();
