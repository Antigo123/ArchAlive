import { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    Background,
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,

    type Node as FlowNode,
    type Edge,
    type Connection,
    type EdgeProps,
    ReactFlowProvider,
    Panel,
    SelectionMode,
    useReactFlow,
    useStore
} from '@xyflow/react';

// Custom edge: renders RPS label near the source end (t=0.2) to avoid stacking
function RpsEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style, markerEnd, selected }: EdgeProps) {
    const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

    // Point at t=0.2 along the straight line - close to source, clear of the node handle
    const labelX = sourceX + (targetX - sourceX) * 0.22;
    const labelY = sourceY + (targetY - sourceY) * 0.22;
    const rps = data?.rps as number | undefined;

    return (
        <>
            <BaseEdge id={id} path={edgePath} style={{ ...style, strokeDasharray: style?.strokeDasharray }} markerEnd={markerEnd} />
            {rps !== undefined && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                            fontSize: window.innerWidth < 400 ? 8 : 10,
                            fontWeight: 700,
                            color: '#f97316',
                            background: selected ? '#fff7ed' : 'white',
                            border: '1px solid #f97316',
                            borderRadius: 4,
                            padding: window.innerWidth < 400 ? '0.5px 3px' : '1px 5px',
                            lineHeight: 1.2,
                        }}
                        className="nodrag nopan"
                    >
                        {rps}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

import type { Node as SimNode } from '@xyflow/react';
import { Clock, Trash2 } from 'lucide-react';
import type { Endpoint, NodeDependency } from './node-types';
import { ServerInputNode, ServerOutputNode, ServerReturnNode } from './modals/InternalNodes';
import { ContextMenu } from './ContextMenu';
import '@xyflow/react/dist/style.css';

interface ServerLogicEditorProps {
    node: SimNode;
    onUpdateNode: (id: string, updates: any) => void;
    editableFields?: string[];
}

const nodeTypes = {
    input: ServerInputNode,
    output: ServerOutputNode,
    return: ServerReturnNode
};

const edgeTypes = {
    rps: RpsEdge
};

// Convert between delay (ticks) and RPS
// Simulation runs at 60 ticks per second
const TICKS_PER_SECOND = 60;

const delayToRps = (delayTicks: number): number => {
    if (delayTicks <= 0) return 9999;
    return Math.round(TICKS_PER_SECOND / delayTicks);
};

const rpsToDelay = (rps: number): number => {
    if (rps <= 0) return TICKS_PER_SECOND;
    return Math.round(TICKS_PER_SECOND / rps);
};

// Helper component to handle automatic centering and scaling
function FitViewHandler({ nodesCount, edgesCount }: { nodesCount: number; edgesCount: number }) {
    const { fitView } = useReactFlow();
    const width = useStore((s) => s.width);
    const height = useStore((s) => s.height);

    // Re-center synchronously before browser repaint whenever the container size or
    // node/edge count changes. duration:0 = instant, no animation that could flash.
    // The secondary 550ms delayed fitView was removed - it existed only to handle
    // the old transition-all width/height animation on the inspector, which is gone.
    useLayoutEffect(() => {
        if (!width || !height) return;
        fitView({ padding: width < 400 ? 0.15 : 0.3, duration: 0, maxZoom: 0.85 });
    }, [width, height, nodesCount, edgesCount, fitView]);

    return null;
}

export function ServerLogicEditor({ node, onUpdateNode, editableFields }: ServerLogicEditorProps) {
    const canEdit = (field: string) => !editableFields || editableFields.includes(field);
    // --- State Initialization ---
    // Initialize Nodes Synchronously to prevent empty-state flash
    const initialNodes = useMemo(() => {
        const nds: FlowNode[] = [];
        const endpoints = (node.data.endpoints as Endpoint[]) || [];
        const dependencies = (node.data.dependencies as NodeDependency[]) || [];

        // 1. Inputs (Left Column)
        endpoints.forEach((ep, idx) => {
            nds.push({
                id: ep.id,
                type: 'input',
                position: { x: 30, y: 100 + (idx * 100) }, // 100px Y gap for clarity
                data: {
                    method: ep.method,
                    path: ep.path,
                    originalIdx: idx,
                    rate: ep.rate
                    // onUpdate will be injected or fallback to setNodes
                }
            });
        });

        // 2. Outputs (Right Column)
        dependencies.forEach((dep, idx) => {
            nds.push({
                id: dep.id,
                type: 'output',
                position: { x: 280, y: 100 + (idx * 100) }, // 100px Y gap, balanced horizontal spacing
                data: {
                    label: dep.label,
                    method: dep.method || 'GET',
                    path: dep.path || '/'
                }
            });
        });

        // 3. Return Node (Right Column, Top - above outputs)
        // API Gateways do not support explicit "Return Reply" nodes as they are pass-through routers
        if (node.type !== 'api_gateway') {
            nds.push({
                id: '__return__',
                type: 'return',
                position: { x: 280, y: 50 }, // Above first output
                data: {}
            });
        }

        return nds;
    }, []); // Only run once on mount

    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialNodes);

    // Inject onUpdate + onDelete callbacks into nodes after mount
    // This allows us to keep initialNodes synchronous (preventing empty flash) while still supporting updates
    useEffect(() => {
        setNodes((nds) => nds.map((n) => {
            if (n.data.onUpdate) return n; // Already injected
            return {
                ...n,
                data: {
                    ...n.data,
                    onUpdate: (newData: any) => {
                        setNodes((current) => current.map((currNode) =>
                            currNode.id === n.id ? { ...currNode, data: newData } : currNode
                        ));
                    },
                    onDelete: () => {
                        setNodes((current) => current.filter(currNode => currNode.id !== n.id));
                        setEdges((current) => current.filter(e => e.source !== n.id && e.target !== n.id));
                    }
                }
            };
        }));
    }, []); // Run once on mount

    const initialEdges: Edge[] = useMemo(() => {
        const eds: Edge[] = [];
        const endpoints = (node.data.endpoints as Endpoint[]) || [];

        endpoints.forEach((ep) => {
            const routes = ep.forward_to || [];
            routes.forEach((route: any, rIdx: number) => {
                const targetId = typeof route === 'string' ? route : route.target_id;

                // Determine RPS: Explicit rate > Route delay > Default (12 ticks = 5 RPS)
                let rps = 5; // Default 5 RPS (12 ticks)
                let delay = 12;

                if (ep.rate && ep.rate > 0) {
                    rps = ep.rate;
                    delay = rpsToDelay(rps);
                } else if (typeof route !== 'string' && route.delay != null && route.delay > 0) {
                    delay = route.delay;
                    rps = delayToRps(delay);
                }

                const isApiGateway = node.type === 'api_gateway';

                eds.push({
                    id: `e-${ep.id}-${targetId}-${rIdx}`,
                    source: ep.id,
                    target: targetId,
                    type: 'rps',
                    animated: true,
                    style: { stroke: '#f97316', strokeWidth: 2 },
                    data: { delay, rps: isApiGateway ? undefined : rps }
                });
            });
        });

        return eds;
    }, []);

    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ id: string; top: number; left: number; isEdge?: boolean } | null>(null);
    const [clipboard, setClipboard] = useState<{ nodes: FlowNode[]; edges: Edge[] }>({ nodes: [], edges: [] });

    // Track last synced data to avoid redundant calls that reset simulation
    const lastSyncedRef = useRef<{ endpoints: string; dependencies: string; nodeData: string }>({
        endpoints: '',
        dependencies: '',
        nodeData: ''
    });

    // --- Graph Operations ---

    // Connect
    const onConnect = useCallback((params: Connection) => {
        const defaultRps = 5;
        const defaultDelay = rpsToDelay(defaultRps);
        setEdges((eds) => addEdge({
            ...params,
            type: 'rps',
            animated: true,
            style: { stroke: '#f97316', strokeWidth: 2 },
            data: { delay: defaultDelay, rps: defaultRps }
        }, eds));
    }, [setEdges]);

    // Add Input
    const addInput = () => {
        const id = `in-${crypto.randomUUID().slice(0, 8)}`;
        const count = nodes.filter(n => n.type === 'input').length;
        const newNode: FlowNode = {
            id,
            type: 'input',
            position: { x: 30, y: count * 100 + 100 }, // 100px Y gap for clarity
            data: {
                method: 'GET',
                path: '/',
                onUpdate: (newData: any) => {
                    setNodes((current) => current.map((currNode) =>
                        currNode.id === id ? { ...currNode, data: newData } : currNode
                    ));
                },
                onDelete: () => {
                    setNodes((current) => current.filter(currNode => currNode.id !== id));
                    setEdges((current) => current.filter(e => e.source !== id && e.target !== id));
                }
            }
        };
        setNodes((nds) => [...nds, newNode]);
    };

    // Add Output Service
    const addService = () => {
        const id = `out-${crypto.randomUUID().slice(0, 8)}`;
        const currentDeps = nodes.filter(n => n.type === 'output');
        const count = currentDeps.length;
        const newNode: FlowNode = {
            id,
            type: 'output',
            position: { x: 280, y: count * 100 + 100 }, // 100px Y gap, balanced horizontal spacing
            data: {
                label: `Output ${count + 1}`,
                method: 'GET',
                path: '/',
                onUpdate: (newData: any) => {
                    setNodes((current) => current.map((currNode) =>
                        currNode.id === id ? { ...currNode, data: newData } : currNode
                    ));
                },
                onDelete: () => {
                    setNodes((current) => current.filter(currNode => currNode.id !== id));
                    setEdges((current) => current.filter(e => e.source !== id && e.target !== id));
                }
            }
        };
        setNodes((nds) => [...nds, newNode]);
    };

    // Delete selected nodes and edges (except __return__ node)
    const handleDelete = useCallback(() => {
        // Find selected nodes (excluding __return__ which should never be deleted)
        const selectedNodeIds = nodes
            .filter(n => n.selected && n.id !== '__return__')
            .map(n => n.id);

        // Find selected edges
        const selectedEdgeIds = edges
            .filter(e => e.selected)
            .map(e => e.id);

        if (selectedNodeIds.length > 0) {
            // Remove selected nodes and their connected edges
            setNodes((nds) => nds.filter(n => !selectedNodeIds.includes(n.id)));
            setEdges((eds) => eds.filter(e =>
                !selectedNodeIds.includes(e.source) &&
                !selectedNodeIds.includes(e.target) &&
                !selectedEdgeIds.includes(e.id)
            ));
        } else if (selectedEdgeIds.length > 0) {
            // Just remove selected edges
            setEdges((eds) => eds.filter(e => !selectedEdgeIds.includes(e.id)));
        }
    }, [nodes, edges, setNodes, setEdges]);

    // Context Menu: Delete by ID (handles both nodes and edges)
    const onContextDelete = useCallback((id: string) => {
        if (id === '__return__') return; // Protect return node

        // Check if it's an edge by looking for it in edges
        const isEdge = edges.some(e => e.id === id);

        if (isEdge) {
            setEdges((eds) => eds.filter(e => e.id !== id));
        } else {
            setNodes((nds) => nds.filter(n => n.id !== id));
            setEdges((eds) => eds.filter(e => e.source !== id && e.target !== id));
        }
    }, [edges, setNodes, setEdges]);

    // Context Menu: Copy
    const onCopy = useCallback((id: string) => {
        const nodeToCopy = nodes.find(n => n.id === id);
        if (nodeToCopy && nodeToCopy.id !== '__return__') {
            setClipboard({ nodes: [nodeToCopy], edges: [] });
        }
    }, [nodes]);

    // Context Menu: Cut
    const onCut = useCallback((id: string) => {
        const nodeToCut = nodes.find(n => n.id === id);
        if (nodeToCut && nodeToCut.id !== '__return__') {
            setClipboard({ nodes: [nodeToCut], edges: [] });
            setNodes((nds) => nds.filter(n => n.id !== id));
            setEdges((eds) => eds.filter(e => e.source !== id && e.target !== id));
        }
    }, [nodes, setNodes, setEdges]);

    // Node Right Click
    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: FlowNode) => {
        event.preventDefault();
        if (node.id === '__return__') return; // No context menu for return node
        setMenu({
            id: node.id,
            top: event.clientY,
            left: event.clientX,
            isEdge: false
        });
    }, []);

    // Edge Right Click
    const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.preventDefault();
        setMenu({
            id: edge.id,
            top: event.clientY,
            left: event.clientX,
            isEdge: true
        });
    }, []);

    // Edge Click
    const onEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
        setSelectedEdgeId(edge.id);
    };

    // Update Edge RPS (converts to delay internally)
    const updateEdgeRps = (rps: number) => {
        if (!selectedEdgeId) return;
        const delay = rpsToDelay(rps);
        setEdges((eds) => eds.map(e => {
            if (e.id === selectedEdgeId) {
                return { ...e, data: { ...e.data, delay, rps } };
            }
            return e;
        }));
    };

    // Sync Graph -> Node Data
    const syncToNodeData = useCallback(() => {
        // Sort nodes by vertical position to reflect reordering in node cards
        const inputNodes = [...nodes]
            .filter(n => n.type === 'input')
            .sort((a, b) => a.position.y - b.position.y);

        const newEndpoints = inputNodes.map(inp => {
            const outgoing = edges.filter(e => e.source === inp.id);
            const routes = outgoing.map(e => ({
                target_id: e.target,
                delay: (e.data?.delay as number) || 30
            }));

            return {
                id: inp.id,
                method: inp.data.method,
                path: inp.data.path,
                forward_to: routes,
                strategy: routes.length > 1 ? 'fan_out' : 'round_robin',
                error_rate: 0.0,
                rate: (inp.data.rate as number) ?? 0 // Default to 0 to prevent WASM deserialization failure
            };
        });

        const outputNodes = [...nodes]
            .filter(n => n.type === 'output')
            .sort((a, b) => a.position.y - b.position.y);
            
        const newDependencies = outputNodes.map(out => ({
            id: out.id,
            label: out.data.label,
            method: out.data.method || 'GET',
            path: out.data.path || '/'
        }));

        const updates = {
            endpoints: newEndpoints,
            dependencies: newDependencies
        };

        // Only call onUpdateNode if data actually changed to avoid parent re-renders
        const nodeDataJson = JSON.stringify(updates);
        if (nodeDataJson !== lastSyncedRef.current.nodeData) {
            onUpdateNode(node.id, updates);
            lastSyncedRef.current.nodeData = nodeDataJson;
        }

    }, [nodes, edges, node.id, onUpdateNode]);

    useEffect(() => {
        syncToNodeData();
    }, [edges, nodes, syncToNodeData]);

    const selectedEdge = edges.find(e => e.id === selectedEdgeId);

    // Render within the Inspector container
    return (
        <div
            className="h-full flex flex-col bg-slate-50 relative border-t border-slate-200"
            tabIndex={0}
            onKeyDown={(e) => {
                // Skip if user is typing in an input field
                const target = e.target as HTMLElement;
                const isInputField = target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable;

                // Handle delete/backspace for inner graph and prevent bubbling to parent ReactFlow
                if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputField) {
                    handleDelete();
                    e.stopPropagation();
                    e.preventDefault();
                }
                // Handle Ctrl+V paste
                if (e.ctrlKey && e.key === 'v' && clipboard.nodes.length > 0) {
                    const newNodes = clipboard.nodes.map(n => {
                        const isInput = n.type === 'input';
                        const newId = isInput ? `ep-${Date.now()}` : `dep-${Date.now()}`;
                        return {
                            ...n,
                            id: newId,
                            position: { x: n.position.x + 30, y: n.position.y + 30 },
                            selected: true
                        };
                    });
                    setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
                    e.stopPropagation();
                    e.preventDefault();
                }
            }}
        >
            {/* Override React Flow's default selection styling */}
            <style>{`
                .react-flow__node.selected > div {
                    outline: none !important;
                    box-shadow: none !important;
                }
                .react-flow__node.selected {
                    outline: none !important;
                    box-shadow: none !important;
                }
                .react-flow__controls {
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
                    border-radius: 8px !important;
                    overflow: hidden !important;
                }
                .react-flow__controls-button {
                    width: 28px !important;
                    height: 28px !important;
                    padding: 4px !important;
                }
            `}</style>
            <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={() => {
                        setSelectedEdgeId(null);
                        setMenu(null);
                    }}
                    onNodeContextMenu={onNodeContextMenu}
                    onEdgeContextMenu={onEdgeContextMenu}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={{ interactionWidth: 20 }}
                    fitView
                    fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
                    proOptions={{ hideAttribution: true }}
                    className="flex-1"
                    selectionOnDrag
                    panOnDrag={[1, 2]}
                    selectionMode={SelectionMode.Partial}
                    deleteKeyCode={null}
                >
                    <FitViewHandler nodesCount={nodes.length} edgesCount={edges.length} />
                    <Background color="#cbd5e1" gap={20} size={1} />

                    {/* Centered Floating Toolbar */}
                    <Panel position="top-center" className="!-top-1">
                        <div className="flex items-center gap-1 p-1 bg-white rounded-full shadow-lg border border-slate-200">
                            {node.type !== 'api_gateway' && (
                                <>
                                    <button
                                        onClick={addInput}
                                        disabled={!canEdit('server.endpoints')}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 max-[400px]:px-2 max-[400px]:py-0.5 text-xs max-[400px]:text-[10px] font-semibold rounded-full transition-all ${!canEdit('server.endpoints') ? 'text-slate-400 cursor-not-allowed bg-transparent' : 'text-blue-600 hover:bg-blue-50 hover:shadow-sm'}`}
                                    >
                                        Add Input
                                    </button>
                                    <div className="w-px h-4 bg-slate-200" />
                                </>
                            )}
                            <button
                                onClick={addService}
                                disabled={!canEdit('server.dependencies')}
                                className={`flex items-center gap-1.5 px-2.5 py-1 max-[400px]:px-2 max-[400px]:py-0.5 text-xs max-[400px]:text-[10px] font-semibold rounded-full transition-all ${!canEdit('server.dependencies') ? 'text-slate-400 cursor-not-allowed bg-transparent' : 'text-purple-600 hover:bg-purple-50 hover:shadow-sm'}`}
                            >
                                Add Output
                            </button>
                        </div>
                    </Panel>

                    {/* Zoom Controls Removed per user request */}

                    {/* Edge Inspector Panel - only show for servers (not api_gateway which has instant routing) */}
                    {selectedEdge && node.type !== 'api_gateway' && (
                        <Panel position="bottom-center" className="mb-4 max-[400px]:mb-2">
                            <div className="bg-white px-4 py-3 max-[400px]:px-2.5 max-[400px]:py-2 rounded-xl shadow-lg border border-slate-200 flex items-center gap-3 max-[400px]:gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
                                <div className="p-1.5 max-[400px]:p-1 bg-orange-100 text-orange-600 rounded-md">
                                    <Clock size={16} className="max-[400px]:w-3.5 max-[400px]:h-3.5" />
                                </div>
                                <span className="text-xs max-[400px]:text-[10px] font-medium text-slate-500 whitespace-nowrap">Throughput</span>
                                <div className="flex items-center gap-2 max-[400px]:gap-1">
                                    <input
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={selectedEdge.data?.rps as number || delayToRps(selectedEdge.data?.delay as number || 30)}
                                        onChange={(e) => updateEdgeRps(Math.min(60, Math.max(1, parseInt(e.target.value) || 1)))}
                                        className="w-20 max-[400px]:w-14 px-2 py-1 max-[400px]:px-1.5 text-sm max-[400px]:text-xs font-bold text-orange-600 font-mono border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-center"
                                    />
                                    <span className="text-sm max-[400px]:text-xs font-medium text-slate-500">RPS</span>
                                </div>
                                <div className="w-px h-5 bg-slate-200 mx-1" />
                                <button
                                    onClick={() => {
                                        onContextDelete(selectedEdgeId!);
                                        setSelectedEdgeId(null);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                    title="Delete connection"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </Panel>
                    )}
                </ReactFlow>

                {/* Context Menu */}
                {menu && (
                    <ContextMenu
                        {...menu}
                        onClose={() => setMenu(null)}
                        onCopy={onCopy}
                        onCut={onCut}
                        onDelete={onContextDelete}
                    />
                )}
            </ReactFlowProvider>
        </div>
    );
}
