
import { useRef, useCallback, useState, useEffect } from 'react';
import { Pause, Play, Plus } from 'lucide-react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,

    Background,
    type Connection,
    type Edge,
    type Node,
    SelectionMode,

} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Dashboard } from './Dashboard';
import { Sidebar } from './Sidebar';
import { MobileNodeSelector } from './MobileNodeSelector';
import { ClientNode } from './nodes/ClientNode';
import { ServerNode } from './nodes/ServerNode';
import { LoadBalancerNode } from './nodes/LoadBalancerNode';
import { MessageQueueNode } from './nodes/MessageQueueNode';
import { DatabaseNode } from './nodes/DatabaseNode';
import { CacheNode } from './nodes/CacheNode';
import { ApiGatewayNode } from './nodes/ApiGatewayNode';
import { TopicNode } from './nodes/TopicNode';
import { NodeInspector, type MobileSheetState } from './NodeInspector';
import { ContextMenu } from './ContextMenu';
import { PacketLayerPixi } from './PacketLayerPixi';
import { SaveManager } from './SaveManager';
import { useSimulationWorker } from '../hooks/useSimulationWorker';
import { usePuzzle } from '../hooks/usePuzzle';
import { PuzzleHUD } from './puzzles/PuzzleHUD';
import { TutorialOverlay } from './tutorial/TutorialOverlay';
import { WelcomeModal } from './modals/WelcomeModal';
import { AboutPopover } from './modals/AboutPopover';
import { LatencyEdge } from './edges/LatencyEdge';
import { PUZZLES } from '../puzzles/scenarios';
import { useMetricsStore } from '../stores/metricsStore';
import { useSimDataStore } from '../stores/simDataStore';


const nodeTypes = {
    client: ClientNode,
    server: ServerNode,
    load_balancer: LoadBalancerNode,
    message_queue: MessageQueueNode,
    database: DatabaseNode,
    cache: CacheNode,
    api_gateway: ApiGatewayNode,
    topic: TopicNode,
};

const edgeTypes = {
    default: LatencyEdge,
};

const STORAGE_KEY = 'archalive_editor_state';

// Load persisted state from localStorage
const loadPersistedState = (): { nodes: Node[]; edges: Edge[]; nextId: number; viewport?: { x: number; y: number; zoom: number }; isFirstVisit?: boolean } => {
    if (typeof window === 'undefined') {
        return getDefaultDemoState();
    }
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved) {
            const parsed = JSON.parse(saved);

            return {
                nodes: parsed.nodes || [],
                edges: parsed.edges || [],
                nextId: parsed.nextId || 0,
                viewport: parsed.viewport,
            };
        }
    } catch (e) {
        console.error('[Persistence] Failed to load state:', e);
    }
    // Show e-commerce template for first-time users
    return getEcommerceTemplateState();
};

// Default demo state (fallback)
const getDefaultDemoState = () => ({
    nodes: [] as Node[],
    edges: [] as Edge[],
    nextId: 0,
    viewport: { x: 0, y: 0, zoom: 0.8 },
});

// E-commerce template for first-time users
const getEcommerceTemplateState = () => {
    const ecommerce = PUZZLES.find(p => p.id === 'template-ecommerce');
    if (!ecommerce) return getDefaultDemoState();

    let maxId = 0;
    ecommerce.initialState.nodes.forEach(n => {
        const match = n.id.match(/_([0-9]+)/);
        if (match) maxId = Math.max(maxId, parseInt(match[1], 10));
    });

    return {
        nodes: ecommerce.initialState.nodes as Node[],
        edges: ecommerce.initialState.edges as Edge[],
        nextId: maxId + 1,
        viewport: ecommerce.initialState.viewport,
        isFirstVisit: true,
    };
};

// Load state at module initialization time
const initialState = loadPersistedState();
let idCounter = initialState.nextId;

const getId = (type: string) => `${type}_${idCounter++}`;

function applyApiGatewayDefaults(node: Node): void {
    const depId = `out-${crypto.randomUUID().slice(0, 8)}`;
    node.data.dependencies = [{ id: depId, label: 'Backend', method: 'GET', path: '/' }];
    node.data.endpoints = [{ id: `ep-${depId}`, method: 'GET', path: '/', forward_to: [{ target_id: depId, delay: 0 }], strategy: 'round_robin', error_rate: 0, rate: 0 }];
    node.data.processing_delay = 5;
    node.data.label = 'API Gateway';
}

export function Editor() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    // Initialize state from persisted data
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialState.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialState.edges);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const [needsFitView, setNeedsFitView] = useState(initialState.isFirstVisit === true);

    // Web Worker for simulation (replaces direct WASM)
    const {
        isReady: workerReady,
        stats,
        packetBufferRef,
        packetCountRef,
        nodeIdToIndexRef,
        syncTopology,
        updateNode: updateWorkerNode,
        removeNode: removeWorkerNode,
        setPaused: setWorkerPaused,
        resetStats,
    } = useSimulationWorker();

    // Dimensions for Packet Layer
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

    useEffect(() => {
        if (!reactFlowWrapper.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });

        observer.observe(reactFlowWrapper.current);
        return () => observer.disconnect();
    }, []);

    // Touch-device detection: uses pointer capability (coarse = finger, fine = mouse)
    // This correctly handles tablets, convertibles, and phones regardless of viewport width
    const [isTouchDevice, setIsTouchDevice] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    });
    useEffect(() => {
        const mq = window.matchMedia('(pointer: coarse)');
        const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches || navigator.maxTouchPoints > 0);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [mobileSheetState, setMobileSheetState] = useState<MobileSheetState>('closed');
    const [isMobileEditor, setIsMobileEditor] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 768
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const handler = (e: MediaQueryListEvent) => setIsMobileEditor(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    // Keep sheet state in sync with selection — auto-open to peek whenever a node
    // becomes selected while the sheet is closed (covers saves, context-menu select, etc.)
    useEffect(() => {
        if (isMobileEditor && selectedNodeId && mobileSheetState === 'closed') {
            setMobileSheetState('open');
        }
    }, [isMobileEditor, selectedNodeId, mobileSheetState]);
    const [menu, setMenu] = useState<{ id: string, top: number, left: number, isPaneMenu?: boolean } | null>(null);
    const [clipboard, setClipboard] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
    const [viewportVersion, setViewportVersion] = useState(0); // Triggers save on viewport change
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(false);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    const [isMobileSelectorOpen, setIsMobileSelectorOpen] = useState(false);
    const [completedPuzzles, setCompletedPuzzles] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            return JSON.parse(localStorage.getItem('archalive_completed_puzzles') || '[]');
        } catch { return []; }
    });

    // First-time user detection for welcome modal
    const [showWelcome, setShowWelcome] = useState(() => {
        if (typeof window === 'undefined') return false;
        return !localStorage.getItem('archalive_tutorial_seen');
    });

    // Puzzle Complete Handler (memoized to prevent infinite loops)
    const handlePuzzleComplete = useCallback((id: string) => {
        setCompletedPuzzles(prev => {
            if (prev.includes(id)) return prev;
            const next = [...prev, id];
            localStorage.setItem('archalive_completed_puzzles', JSON.stringify(next));
            return next;
        });
        // Could trigger a confetti effect here
    }, []);

    // Puzzle Engine
    const { puzzleState, startPuzzle, stopPuzzle } = usePuzzle({
        simStats: stats,
        onPuzzleComplete: handlePuzzleComplete,
        nodes,
        edges
    });


    const handleStartLevel = useCallback((id: string) => {
        const puzzle = PUZZLES.find(p => p.id === id);
        if (puzzle) {
            // 1. Load Scenario
            // Need to reset ID counter to avoid collisions with old state? 
            // Better to find max ID in new state.
            let maxId = 0;
            puzzle.initialState.nodes.forEach(n => {
                const match = n.id.match(/_([0-9]+)/);
                if (match) maxId = Math.max(maxId, parseInt(match[1], 10));
            });
            idCounter = maxId + 1;

            setNodes(puzzle.initialState.nodes);
            setEdges(puzzle.initialState.edges);
            // Fit view when nodes are pre-placed; empty tutorials use their predefined viewport
            if (reactFlowInstance && puzzle.initialState.nodes.length > 0) {
                setTimeout(() => {
                    reactFlowInstance.fitView({ padding: 0.15, duration: 400 });
                }, 50);
            }

            // 2. Start Game Logic
            startPuzzle(puzzle);

            // 3. Reset Metrics History
            useMetricsStore.getState().reset();
            useSimDataStore.getState().clear();
            resetStats();
        }
    }, [reactFlowInstance, setNodes, setEdges, startPuzzle]);

    const handleQuitLevel = useCallback(() => {
        stopPuzzle();
        // optionally reset to empty or default?
    }, [stopPuzzle]);

    // Performance Optimization: Cache Lookups
    // Initialize with current nodes so PacketLayerPixi has data on first render
    const nodesMap = useRef<Map<string, Node>>(new Map(initialState.nodes.map(n => [n.id, n])));
    const edgesMap = useRef<Map<string, Edge>>(new Map());

    // Sync Maps when data changes
    useEffect(() => {
        nodesMap.current = new Map(nodes.map(n => [n.id, n]));
    }, [nodes]);

    useEffect(() => {
        edgesMap.current = new Map(edges.map(e => [`${e.source} -${e.target} -${e.sourceHandle} -${e.targetHandle} `, e]));
    }, [edges]);

    // Persist state to localStorage - debounced to avoid serializing on every drag frame
    const lastSavedRef = useRef<string>('');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(() => {
            const persistNodes = nodes.map(node => ({
                id: node.id,
                type: node.type,
                position: node.position,
                data: {
                    label: node.data.label,
                    request_rate: node.data.request_rate,
                    buffer_capacity: node.data.buffer_capacity,
                    processing_delay: node.data.processing_delay,
                    endpoints: node.data.endpoints,
                    streams: node.data.streams,
                    dependencies: node.data.dependencies,
                    cache_hit_rate: node.data.cache_hit_rate,
                },
            }));

            const currentViewport = reactFlowInstance?.getViewport();
            const stateToSave = JSON.stringify({
                nodes: persistNodes,
                edges,
                nextId: idCounter,
                viewport: currentViewport,
            });

            if (stateToSave !== lastSavedRef.current) {
                try {
                    localStorage.setItem(STORAGE_KEY, stateToSave);
                    lastSavedRef.current = stateToSave;
                } catch (e) {
                    console.error('[Persistence] Failed to save state:', e);
                }
            }
        }, 500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [nodes, edges, viewportVersion, reactFlowInstance]);

    // Sync topology to Web Worker when ready or when edges/nodes change
    useEffect(() => {
        if (!workerReady) return;
        syncTopology(edges, nodes);
    }, [workerReady, edges, nodes, syncTopology]);

    // Sync pause state to worker
    useEffect(() => {
        setWorkerPaused(isPaused);
    }, [isPaused, setWorkerPaused]);

    const [connectionPoint, setConnectionPoint] = useState<{ x: number; y: number } | null>(null);

    const onConnect = useCallback(
        (params: Connection) => {
            setEdges((eds) => addEdge({ ...params, data: { latency_ms: 0 } }, eds));

            // --- Copy method/path between source and target handles ---
            if (params.source && params.target) {
                const sourceNode = nodes.find(n => n.id === params.source);
                const targetNode = nodes.find(n => n.id === params.target);

                if (sourceNode && targetNode) {
                    // Extract method/path from source handle (streams or dependencies)
                    let sourceMethod: string | undefined;
                    let sourcePath: string | undefined;

                    if (params.sourceHandle) {
                        const streams = (sourceNode.data.streams as any[]) || [];
                        const stream = streams.find((s: any) => s.id === params.sourceHandle);
                        if (stream) {
                            sourceMethod = stream.method;
                            sourcePath = stream.path;
                        }
                        if (!sourceMethod) {
                            const deps = (sourceNode.data.dependencies as any[]) || [];
                            const dep = deps.find((d: any) => d.id === params.sourceHandle);
                            if (dep && dep.method) {
                                sourceMethod = dep.method;
                                sourcePath = dep.path;
                            }
                        }
                        if (!sourceMethod) {
                            const eps = (sourceNode.data.endpoints as any[]) || [];
                            const ep = eps.find((e: any) => e.id === params.sourceHandle);
                            if (ep) {
                                sourceMethod = ep.method;
                                sourcePath = ep.path;
                            }
                        }
                    }

                    // Extract method/path from target handle (endpoints, streams, or dependencies)
                    let targetMethod: string | undefined;
                    let targetPath: string | undefined;

                    if (params.targetHandle) {
                        const eps = (targetNode.data.endpoints as any[]) || [];
                        const ep = eps.find((e: any) => e.id === params.targetHandle);
                        if (ep) {
                            targetMethod = ep.method;
                            targetPath = ep.path;
                        }
                        if (!targetMethod) {
                            const streams = (targetNode.data.streams as any[]) || [];
                            const stream = streams.find((s: any) => s.id === params.targetHandle);
                            if (stream) {
                                targetMethod = stream.method;
                                targetPath = stream.path;
                            }
                        }
                        if (!targetMethod) {
                            const deps = (targetNode.data.dependencies as any[]) || [];
                            const dep = deps.find((d: any) => d.id === params.targetHandle);
                            if (dep && dep.method) {
                                targetMethod = dep.method;
                                targetPath = dep.path;
                            }
                        }
                    }

                    // Determine copy direction: use source data if available, otherwise target data
                    const copyMethod = sourceMethod || targetMethod;
                    const copyPath = sourcePath || targetPath;

                    if (copyMethod && copyPath) {
                        // Apply to target handle if source had data
                        if (sourceMethod && sourcePath && params.targetHandle) {
                            // Update target endpoints
                            const endpoints = (targetNode.data.endpoints as any[]) || [];
                            const epIdx = endpoints.findIndex((ep: any) => ep.id === params.targetHandle);
                            if (epIdx >= 0) {
                                const updated = [...endpoints];
                                updated[epIdx] = { ...updated[epIdx], method: copyMethod, path: copyPath };
                                setNodes((nds) => nds.map((n) =>
                                    n.id === params.target ? { ...n, data: { ...n.data, endpoints: updated } } : n
                                ));
                                updateWorkerNode(params.target, 'endpoints', updated);
                            }
                        }

                        // Apply to source handle (streams or dependencies)
                        if (params.sourceHandle) {
                            // Update source streams
                            const streams = (sourceNode.data.streams as any[]) || [];
                            const sIdx = streams.findIndex((s: any) => s.id === params.sourceHandle);
                            if (sIdx >= 0) {
                                const updated = [...streams];
                                updated[sIdx] = { ...updated[sIdx], method: copyMethod, path: copyPath };
                                setNodes((nds) => nds.map((n) =>
                                    n.id === params.source ? { ...n, data: { ...n.data, streams: updated } } : n
                                ));
                                updateWorkerNode(params.source, 'streams', updated);
                            }

                            // Update source dependencies
                            const deps = (sourceNode.data.dependencies as any[]) || [];
                            const dIdx = deps.findIndex((d: any) => d.id === params.sourceHandle);
                            if (dIdx >= 0) {
                                const updated = [...deps];
                                updated[dIdx] = { ...updated[dIdx], method: copyMethod, path: copyPath };
                                setNodes((nds) => nds.map((n) =>
                                    n.id === params.source ? { ...n, data: { ...n.data, dependencies: updated } } : n
                                ));
                                updateWorkerNode(params.source, 'dependencies', updated);
                            }
                        }
                    }
                }
            }

            // Find the actual handle element in the DOM to get its exact position
            if (params.target) {
                // Build selector for the target handle
                const handleSelector = params.targetHandle
                    ? `[data-nodeid="${params.target}"][data-handleid="${params.targetHandle}"]`
                    : `[data-nodeid="${params.target}"].target`;

                const handleElement = document.querySelector(handleSelector);
                if (handleElement) {
                    const rect = handleElement.getBoundingClientRect();
                    setConnectionPoint({
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2
                    });
                    setTimeout(() => setConnectionPoint(null), 800);
                }
            }
        },
        [setEdges, setNodes, nodes, updateWorkerNode],
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');

            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node = {
                id: getId(type),
                type,
                position,
                data: {
                    label:
                        type === 'message_queue' ? 'Message Queue' :
                            type === 'load_balancer' ? 'Load Balancer' :
                                type === 'cache' ? 'Cache' :
                                    type === 'topic' ? 'Pub/Sub Topic' :
                                        type.charAt(0).toUpperCase() + type.slice(1),
                    request_rate: type === 'client' ? 0.5 : undefined,
                    buffer_capacity: type === 'server' ? 30 : 100,
                    processing_delay: type === 'database' ? 20 : (type === 'server' ? 12 : (type === 'cache' ? 3 : 0)),
                    // Default Endpoints for Server
                    endpoints: type === 'server' ? [
                        { id: `ep-${Date.now()}`, method: 'GET', path: '/', delay: 12, forward_to: [{ target_id: '__return__', delay: 12 }] }
                    ] : undefined,
                    // Default default params for others
                    streams: type === 'client' ? [
                        { id: `stream - ${Date.now()} `, label: 'Read Traffic', is_write: false, weight: 1, method: 'GET', path: '/', rate: 5.0 }
                    ] : undefined,
                    dependencies: type === 'server' ? [
                        { id: `dep - ${Date.now()} `, label: "Service" }
                    ] : undefined
                },
            };

            if (type === 'api_gateway') {
                applyApiGatewayDefaults(newNode);
            } else if (type === 'topic') {
                newNode.data.label = "Topic";
                newNode.data.buffer_capacity = 100;
            }

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance, setNodes],
    );

    const onNodesDelete = useCallback(
        (deleted: Node[]) => {
            // Remove from worker simulation
            deleted.forEach(node => {
                removeWorkerNode(node.id);
            });

            setEdges((eds) =>
                eds.filter(
                    (e) => !deleted.some((node) => node.id === e.source || node.id === e.target)
                )
            );
        },
        [setEdges, removeWorkerNode]
    );

    const isValidConnection = useCallback((connection: Edge | Connection) => {
        const sourceNode = nodes.find((n) => n.id === connection.source);

        // Allow multiple connections from handles that are designed to fan-out (Load Balancer, Topic, etc.)
        const isFanOutNode =
            sourceNode?.type === 'load_balancer' ||
            sourceNode?.type === 'topic' ||
            sourceNode?.type === 'api_gateway' ||
            sourceNode?.type === 'message_queue';

        if (!isFanOutNode) {
            const isDefaultHandle = (h: string | null | undefined) => !h || h === '' || h === 'left' || h === 'right';

            const isHandleOccupied = edges.some((edge) => {
                if (edge.source !== connection.source) return false;

                const h1 = edge.sourceHandle;
                const h2 = connection.sourceHandle;

                if (isDefaultHandle(h1) && isDefaultHandle(h2)) {
                    const endpoints = (sourceNode?.data?.endpoints as any[]) || [];
                    const dependencies = (sourceNode?.data?.dependencies as any[]) || [];
                    const hasNamedHandles = (endpoints.length > 0) || (dependencies.length > 0);
                    return !hasNamedHandles;
                }

                return h1 === h2;
            });

            if (isHandleOccupied) return false;
        }

        return true;
    }, [edges, nodes]);

    const addNodeAt = useCallback((type: string, x: number, y: number) => {
        const newNode: Node = {
            id: getId(type),
            type,
            position: { x, y },
            data: {
                label:
                    type === 'message_queue' ? 'Message Queue' :
                        type === 'load_balancer' ? 'Load Balancer' :
                            type === 'cache' ? 'Cache' :
                                type === 'topic' ? 'Pub/Sub Topic' :
                                    type.charAt(0).toUpperCase() + type.slice(1),
                request_rate: type === 'client' ? 0.5 : undefined,
                buffer_capacity: type === 'server' ? 30 : 100,
                processing_delay: type === 'database' ? 20 : (type === 'server' ? 12 : (type === 'cache' ? 3 : 0)),
                endpoints: type === 'server' ? [
                    { id: `in-${crypto.randomUUID().slice(0, 8)}`, method: 'GET', path: '/', delay: 12, forward_to: [{ target_id: '__return__', delay: 12 }] }
                ] : undefined,
                streams: type === 'client' ? [
                    { id: `stream-${crypto.randomUUID().slice(0, 8)}`, label: 'Read Traffic', is_write: false, weight: 1, method: 'GET', path: '/', rate: 5.0 }
                ] : undefined,
                dependencies: type === 'server' ? [
                    { id: `out-${crypto.randomUUID().slice(0, 8)}`, label: "Service" }
                ] : undefined
            },
        };

        if (type === 'api_gateway') {
            applyApiGatewayDefaults(newNode);
        }

        setNodes((nds) => nds.concat(newNode));
    }, [setNodes]);

    const handleMobileDragDrop = useCallback((type: string, screenX: number, screenY: number) => {
        if (!reactFlowInstance) return;
        const position = reactFlowInstance.screenToFlowPosition({ x: screenX, y: screenY });
        addNodeAt(type, position.x - 60, position.y - 40);
        setIsMobileSelectorOpen(false);
    }, [reactFlowInstance, addNodeAt]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
        if (isMobileEditor) setMobileSheetState('open');
    }, [isMobileEditor]);

    const onPaneClick = useCallback((_event: React.MouseEvent | MouseEvent | any) => {
        setSelectedNodeId(null);
        setMobileSheetState('closed');
        setMenu(null);
    }, []);


    const onNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            const pane = reactFlowWrapper.current?.getBoundingClientRect();
            setMenu({
                id: node.id,
                top: event.clientY - (pane?.top || 0),
                left: event.clientX - (pane?.left || 0),
            });
        },
        [],
    );

    const onEdgeContextMenu = useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            event.preventDefault();
            const pane = reactFlowWrapper.current?.getBoundingClientRect();
            setMenu({
                id: edge.id,
                top: event.clientY - (pane?.top || 0),
                left: event.clientX - (pane?.left || 0),
            });
        },
        [],
    );

    const onPaneContextMenu = useCallback(
        (event: React.MouseEvent | MouseEvent) => {
            event.preventDefault();
            const pane = reactFlowWrapper.current?.getBoundingClientRect();
            setMenu({
                id: '__pane__',
                top: 'clientY' in event ? event.clientY - (pane?.top || 0) : 0,
                left: 'clientX' in event ? event.clientX - (pane?.left || 0) : 0,
                isPaneMenu: true
            });
        },
        [],
    );

    const onCopy = useCallback((id: string) => {
        const targetIsSelected = nodes.find(n => n.id === id)?.selected;
        const selectedNodes = nodes.filter(n => n.selected);

        // If right-clicked node is selected, copy all selected. Otherwise copy only the clicked one.
        const nodesToCopy = (targetIsSelected && selectedNodes.length > 0) ? selectedNodes : nodes.filter(n => n.id === id);

        if (nodesToCopy.length > 0) {
            const nodeIds = new Set(nodesToCopy.map(n => n.id));
            // Copy edges that connect nodes within the selection
            const edgesToCopy = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
            setClipboard({ nodes: nodesToCopy, edges: edgesToCopy });
        }
    }, [nodes, edges]);

    const onCut = useCallback((id: string) => {
        const targetIsSelected = nodes.find(n => n.id === id)?.selected;
        const selectedNodes = nodes.filter(n => n.selected);
        const nodesToCut = (targetIsSelected && selectedNodes.length > 0) ? selectedNodes : nodes.filter(n => n.id === id);

        if (nodesToCut.length > 0) {
            const nodeIds = new Set(nodesToCut.map(n => n.id));
            const edgesToCut = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
            setClipboard({ nodes: nodesToCut, edges: edgesToCut });
            // Remove from simulation worker
            nodesToCut.forEach(node => removeWorkerNode(node.id));
            setNodes((nds) => nds.filter((n) => !nodesToCut.some(cut => cut.id === n.id)));
            setEdges((eds) => eds.filter((e) => !edgesToCut.some(cut => cut.id === e.id)));
        }
    }, [nodes, edges, setNodes, setEdges, removeWorkerNode]);

    const onDelete = useCallback((id: string) => {
        // Check if it's an edge first
        const isEdge = edges.some(e => e.id === id);
        if (isEdge) {
            setEdges((eds) => eds.filter((e) => e.id !== id));
            return;
        }

        // Handle node deletion
        const targetIsSelected = nodes.find(n => n.id === id)?.selected;
        const selectedNodes = nodes.filter(n => n.selected);
        const nodesToDelete = (targetIsSelected && selectedNodes.length > 0) ? selectedNodes : nodes.filter(n => n.id === id);

        // Remove from simulation worker
        nodesToDelete.forEach(node => removeWorkerNode(node.id));
        setNodes((nds) => nds.filter((n) => !nodesToDelete.some(del => del.id === n.id)));
    }, [nodes, edges, setNodes, setEdges, removeWorkerNode]);

    // Paste callback for context menu
    const onPaste = useCallback(() => {
        if (clipboard.nodes.length === 0) return;

        // Create mapping from old IDs to new IDs
        const idMap = new Map<string, string>();
        const newNodes = clipboard.nodes.map(node => {
            const newId = getId(node.type || 'server');
            idMap.set(node.id, newId);
            return {
                ...node,
                id: newId,
                position: { x: node.position.x + 50, y: node.position.y + 50 },
                selected: true,
                dragging: false
            };
        });

        // Create new edges with remapped IDs
        const newEdges = clipboard.edges.map((edge, index) => ({
            ...edge,
            id: `e${idMap.get(edge.source)}-${idMap.get(edge.target)}-${Date.now()}-${index}`,
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
            selected: false
        }));

        // Deselect existing and add new nodes/edges
        setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
        setEdges((eds) => eds.concat(newEdges));
    }, [clipboard, setNodes, setEdges]);

    // Copy/Paste Logic (Ctrl+C / Ctrl+V) + Arrow key panning (Shift+Arrow)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Arrow key panning (Shift+Arrow)
            if (event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
                if (!reactFlowInstance) return;
                event.preventDefault();
                const viewport = reactFlowInstance.getViewport();
                const PAN_STEP = 100;
                const dx = event.key === 'ArrowLeft' ? PAN_STEP : event.key === 'ArrowRight' ? -PAN_STEP : 0;
                const dy = event.key === 'ArrowUp' ? PAN_STEP : event.key === 'ArrowDown' ? -PAN_STEP : 0;
                reactFlowInstance.setViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy }, { duration: 100 });
                setViewportVersion(v => v + 1);
                return;
            }

            // Copy (Ctrl+C)
            if (event.ctrlKey && event.key === 'c') {
                if (!reactFlowInstance) return;

                // Use getNodes/getEdges from instance to avoid dependency on 'nodes' state which changes frequently
                const currentNodes = reactFlowInstance.getNodes();
                const currentEdges = reactFlowInstance.getEdges();

                const selectedNodes = currentNodes.filter((n: any) => n.selected);

                if (selectedNodes.length > 0) {
                    const nodeIds = new Set(selectedNodes.map((n: any) => n.id));
                    // Copy edges that are fully contained within the selection
                    const edgesToCopy = currentEdges.filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

                    setClipboard({ nodes: selectedNodes, edges: edgesToCopy });
                }
            }

            // Paste (Ctrl+V)
            if (event.ctrlKey && event.key === 'v' && clipboard.nodes.length > 0) {
                // Create mapping from old IDs to new IDs
                const idMap = new Map<string, string>();
                const newNodes = clipboard.nodes.map(node => {
                    const newId = getId(node.type || 'server');
                    idMap.set(node.id, newId);
                    return {
                        ...node,
                        id: newId,
                        position: { x: node.position.x + 50, y: node.position.y + 50 },
                        selected: true,
                        dragging: false
                    };
                });

                // Create new edges with remapped IDs
                const newEdges = clipboard.edges.map((edge, index) => ({
                    ...edge,
                    id: `e${idMap.get(edge.source)}-${idMap.get(edge.target)}-${Date.now()}-${index}`,
                    source: idMap.get(edge.source) || edge.source,
                    target: idMap.get(edge.target) || edge.target,
                    selected: false
                }));

                // Deselect existing and add new nodes/edges
                setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
                setEdges((eds) => eds.concat(newEdges));
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [clipboard, setNodes, setEdges, reactFlowInstance, setViewportVersion]);

    // Helper to update local node state (e.g. Label change)
    const handleUpdateNode = useCallback((id: string, updates: any) => {
        // 1. Update React State
        setNodes((nds) => nds.map((n) => {
            if (n.id === id) {
                return { ...n, data: { ...n.data, ...updates } };
            }
            return n;
        }));

        // 2. Update Simulation State via Worker
        // Endpoints (Server Logic)
        if (updates.endpoints) {
            updateWorkerNode(id, 'endpoints', updates.endpoints);
        }

        // Dependencies (Server Logic)
        if (updates.dependencies) {
            updateWorkerNode(id, 'dependencies', updates.dependencies);
        }

        // Streams (Client Logic)
        if (updates.streams) {
            updateWorkerNode(id, 'streams', updates.streams);
        }

        // Capacity, Delay, etc.
        if (updates.buffer_capacity !== undefined) {
            updateWorkerNode(id, 'buffer_capacity', updates.buffer_capacity);
        }
        if (updates.processing_delay !== undefined) {
            updateWorkerNode(id, 'processing_delay', updates.processing_delay);
        }
        if (updates.cache_hit_rate !== undefined) {
            updateWorkerNode(id, 'cache_hit_rate', updates.cache_hit_rate);
        }
        if (updates.request_rate !== undefined) {
            updateWorkerNode(id, 'request_rate', updates.request_rate);
        }
    }, [setNodes, updateWorkerNode]);

    // Load a saved design
    const handleLoadSave = useCallback((loadedNodes: Node[], loadedEdges: Edge[], loadedViewport?: { x: number; y: number; zoom: number }) => {
        // Update the idCounter to prevent ID collisions
        const maxId = loadedNodes.reduce((max, node) => {
            const match = node.id.match(/_([0-9]+)/);
            return match ? Math.max(max, parseInt(match[1], 10)) : max;
        }, 0);
        idCounter = maxId + 1;

        setNodes(loadedNodes);
        setEdges(loadedEdges);

        // Set viewport if provided
        if (loadedViewport && reactFlowInstance) {
            reactFlowInstance.setViewport(loadedViewport);
        }
    }, [setNodes, setEdges, reactFlowInstance]);

    const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;






    return (
        <main className="flex h-screen w-screen bg-transparent">
            <h1 className="sr-only">ArchAlive Architecture Simulator</h1>
            <ReactFlowProvider>
                <Sidebar
                    onClear={() => {
                        setNodes([]);
                        setEdges([]);
                    }}
                    allowedNodes={puzzleState.currentPuzzle?.permissions?.allowedNodes}
                />
                <div className="flex-1 h-full relative" ref={reactFlowWrapper} {...(isTouchDevice ? { 'data-touch': '' } : {})}>

                    {/* Puzzle HUD */}
                    <PuzzleHUD
                        gameState={puzzleState}
                        onStartLevel={handleStartLevel}
                        onQuitLevel={handleQuitLevel}
                        completedPuzzles={completedPuzzles}
                        onToggleSelector={setIsMobileSelectorOpen}
                    />

                    {/* Tutorial Overlay */}
                    <TutorialOverlay
                        currentStep={
                            puzzleState.currentPuzzle?.tutorialSteps?.[puzzleState.currentTutorialStep] || null
                        }
                        isActive={puzzleState.status === 'running' && puzzleState.currentTutorialStep < (puzzleState.currentPuzzle?.tutorialSteps?.length || 0)}
                    />

                    {/* Welcome Modal for First-Time Users */}
                    <WelcomeModal
                        isOpen={showWelcome}
                        onStartTutorial={() => {
                            localStorage.setItem('archalive_tutorial_seen', 'true');
                            setShowWelcome(false);
                            handleStartLevel('tutorial-01');
                        }}
                        onSkip={() => {
                            localStorage.setItem('archalive_tutorial_seen', 'true');
                            setShowWelcome(false);
                        }}
                    />

                    {/* Node Inspector */}
                    <NodeInspector
                        node={selectedNode}
                        onUpdateNode={handleUpdateNode}
                        onClose={() => { setSelectedNodeId(null); setMobileSheetState('closed'); }}
                        editableFields={puzzleState.currentPuzzle?.permissions?.editableFields}
                        mobileSheetState={mobileSheetState}
                        onMobileSheetStateChange={setMobileSheetState}
                    />


                    <ReactFlow
                        data-main-canvas
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodesDelete={onNodesDelete}
                        onInit={(instance) => {
                            setReactFlowInstance(instance);
                            // Fit the e-commerce template to screen on first visit
                            if (needsFitView) {
                                setTimeout(() => {
                                    if (isMobileEditor) {
                                        // fitView zooms out too far on small screens — instead
                                        // show the clients + gateway portion at a readable zoom.
                                        instance.setViewport({ x: 20, y: 60, zoom: 0.55 });
                                    } else {
                                        instance.fitView({ padding: 0.1 });
                                    }
                                    setNeedsFitView(false);
                                }, 100);
                            }
                        }}
                        defaultViewport={initialState.viewport || { x: 0, y: 0, zoom: 0.8 }}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}

                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        defaultEdgeOptions={{ interactionWidth: isTouchDevice ? 35 : 20 }}

                        selectionMode={SelectionMode.Partial}
                        onNodeContextMenu={onNodeContextMenu}
                        onEdgeContextMenu={onEdgeContextMenu}
                        onPaneContextMenu={onPaneContextMenu}
                        onMoveEnd={() => setViewportVersion(v => v + 1)}
                        isValidConnection={isValidConnection}
                        deleteKeyCode={['Backspace', 'Delete']}
                        /* Touch controls: single-finger pan + drag threshold to avoid accidental drags.
                           Desktop controls: middle/right-click pan, left-click drag-selects. */
                        panOnDrag={(isTouchDevice || isMobileEditor) ? true : [1, 2]}
                        selectionOnDrag={!isTouchDevice && !isMobileEditor}
                        nodeDragThreshold={isTouchDevice ? 5 : 1}
                        zoomOnPinch
                        zoomOnDoubleClick={!isTouchDevice}
                        onlyRenderVisibleElements
                        minZoom={0.05}
                        maxZoom={4}
                        connectionRadius={isTouchDevice ? 50 : 20}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background />
                        {/* Controls removed */}
                    </ReactFlow>

                    {menu && (
                        <ContextMenu
                            {...menu}
                            onClose={() => setMenu(null)}
                            onCopy={onCopy}
                            onCut={onCut}
                            onDelete={onDelete}
                            onPaste={onPaste}
                            hasClipboard={clipboard.nodes.length > 0}
                            onClear={() => {
                                setNodes([]);
                                setEdges([]);
                            }}
                        />
                    )}

                    {/* Dashboard Overlay */}
                    <Dashboard stats={stats} />

                    {/* Mobile bottom bar — 3-slot grid: [Pause+Save | Components | About] */}
                    <div
                        className="md:hidden fixed left-2 right-2 z-[150] grid grid-cols-[auto_1fr_auto] items-center gap-2 transition-[bottom] duration-200"
                        style={{ bottom: mobileSheetState === 'closed' ? 16 : 80 }}
                    >
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setIsPaused(p => !p)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg border transition-all duration-300 ${
                                    isPaused
                                        ? 'bg-white text-green-600 border-green-200 ring-4 ring-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.15)] animate-pulse'
                                        : 'bg-white/95 backdrop-blur-sm text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md hover:text-blue-600'
                                }`}
                                title={isPaused ? 'Resume simulation' : 'Pause simulation'}
                            >
                                {isPaused ? <Play size={16} className="fill-current" /> : <Pause size={16} />}
                                <span className="text-xs font-bold">{isPaused ? 'Resume' : 'Pause'}</span>
                            </button>
                            <SaveManager nodes={nodes} edges={edges} viewport={reactFlowInstance?.getViewport() || null} onLoad={handleLoadSave} />
                        </div>

                        <button
                            className={`mx-auto flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm text-white transition-all duration-200 active:scale-95 ${
                                isMobileSelectorOpen
                                    ? 'bg-gradient-to-br from-indigo-600 to-violet-600 shadow-[0_4px_20px_rgba(99,102,241,0.55)] ring-4 ring-indigo-400/25'
                                    : 'bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:shadow-[0_4px_28px_rgba(99,102,241,0.55)] hover:scale-105'
                            }`}
                            onClick={() => setIsMobileSelectorOpen(o => !o)}
                        >
                            <Plus size={15} className={`flex-shrink-0 transition-transform duration-300 ${isMobileSelectorOpen ? 'rotate-45' : ''}`} />
                            <span>Components</span>
                        </button>

                        <AboutPopover />
                    </div>

                    {/* Desktop controls — left */}
                    <div className="hidden md:flex absolute bottom-4 left-4 z-[150] items-center gap-2">
                        <button
                            onClick={() => setIsPaused(p => !p)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full shadow-lg border transition-all duration-300 ${
                                isPaused
                                    ? 'bg-white text-green-600 border-green-200 ring-4 ring-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.15)] animate-pulse'
                                    : 'bg-white/95 backdrop-blur-sm text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md hover:text-blue-600'
                            }`}
                            title={isPaused ? 'Resume simulation' : 'Pause simulation'}
                        >
                            {isPaused ? <Play size={16} className="fill-current" /> : <Pause size={16} />}
                            <span className="text-sm font-bold">{isPaused ? 'Resume' : 'Pause'}</span>
                        </button>
                        <SaveManager nodes={nodes} edges={edges} viewport={reactFlowInstance?.getViewport() || null} onLoad={handleLoadSave} />
                    </div>

                    {/* Desktop About — right */}
                    <div className="hidden md:block absolute bottom-4 right-4 z-[150]">
                        <AboutPopover />
                    </div>

                    {/* PixiJS Packet Layer (GPU Accelerated) */}
                    <PacketLayerPixi
                        nodesMapRef={nodesMap}
                        packetBufferRef={packetBufferRef}
                        packetCountRef={packetCountRef}
                        nodeIdToIndexRef={nodeIdToIndexRef}
                        width={dimensions.width}
                        height={dimensions.height}
                    />

                    {/* Connection Success Ripple */}
                    {connectionPoint && (
                        <div
                            className="connection-success-ripple"
                            style={{
                                left: connectionPoint.x,
                                top: connectionPoint.y
                            }}
                        />
                    )}

                    <MobileNodeSelector
                        onClear={() => {
                            setNodes([]);
                            setEdges([]);
                        }}
                        hide={!!selectedNodeId}
                        isOpen={isMobileSelectorOpen}
                        onToggle={setIsMobileSelectorOpen}
                        onDragDrop={handleMobileDragDrop}
                    />



                </div>
            </ReactFlowProvider>
        </main>
    );
}
