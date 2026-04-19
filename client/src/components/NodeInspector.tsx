import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { Node } from '@xyflow/react';
import { Settings, Trash2, Plus, ChevronDown } from 'lucide-react';
import { ServerLogicEditor } from './ServerLogicEditor';
import { getMethodColor } from '../utils/colors';
import { NODE_TYPES_CONFIG } from './node-types';

export type MobileSheetState = 'closed' | 'open';

interface NodeInspectorProps {
    node: Node | null;
    onUpdateNode: (id: string, updates: any) => void;
    onClose?: () => void;
    editableFields?: string[]; // If undefined, all editable. If [], none.
    mobileSheetState?: MobileSheetState;
    onMobileSheetStateChange?: (s: MobileSheetState) => void;
}

interface TrafficStream {
    id: string;
    label: string;
    is_write: boolean;
    weight: number;
    method: string;
    path: string;
    rate?: number;
    retries?: number;
}

export function NodeInspector({ node, onUpdateNode, onClose, editableFields, mobileSheetState = 'closed', onMobileSheetStateChange }: NodeInspectorProps) {
    // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS

    // Resize state
    const [width, setWidth] = useState<number | null>(null);
    const [height, setHeight] = useState<number | null>(null);
    const inspectorRef = useRef<HTMLDivElement>(null);
    const resizeType = useRef<'horizontal' | 'vertical' | 'both' | null>(null);
    const startX = useRef(0);
    const startY = useRef(0);
    const startWidth = useRef(0);
    const startHeight = useRef(0);
    const dragWidthRef = useRef<number | null>(null);
    const dragHeightRef = useRef<number | null>(null);
    const touchStartY = useRef(0);
    const touchStartHeightRef = useRef(0);
    const mobileDragHeightRef = useRef<number | null>(null);
    const [mobileHeightPx, setMobileHeightPx] = useState(() =>
        typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.5) : 400
    );

    // Only re-render when the mobile breakpoint is actually crossed, not on every
    // pixel of window resize. Frequent setWindowSize calls re-render the whole
    // subtree (including ServerLogicEditor / FitViewHandler) which triggers
    // fitView animations and causes a single-frame flash.
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 768 : false
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Local State - use empty defaults when node is null
    const [label, setLabel] = useState('');
    const [capacity, setCapacity] = useState(5);
    const [streams, setStreams] = useState<TrafficStream[]>([]);
    const [hitRate, setHitRate] = useState(0.8);
    const [processingDelay, setProcessingDelay] = useState(60);
    const [gatewayOutputs, setGatewayOutputs] = useState<{ id: string; label: string; method: string; path: string }[]>([]);

    // Derived values (safe to compute even if node is null)
    const nodeType = node?.type;
    const isServer = nodeType === 'server';
    const isApiGateway = nodeType === 'api_gateway';

    // Get config for the current node type
    const nodeConfig = NODE_TYPES_CONFIG.find(c => c.type === nodeType);
    const Icon = nodeConfig?.icon || Settings;
    // Use the color from config, but we need to derive the light background. 
    // Most colors are 'text-X-600', we want 'bg-X-100'.
    const colorBase = nodeConfig?.color.split('-')[1] || 'slate';
    const bgColor = `bg-${colorBase}-100`;
    const textColor = nodeConfig?.color || 'text-slate-500';

    // Calculate dynamic defaults for servers
    const endpoints = (node?.data?.endpoints as any[]) || [];
    const dependencies = (node?.data?.dependencies as any[]) || [];
    const numInputs = endpoints.length;
    const numOutputs = dependencies.length + (node?.type === 'server' ? 1 : 0);
    const maxRows = Math.max(numInputs, numOutputs, 1); // At least 1 row to avoid tiny start

    const defaultWidth = isServer ? 'clamp(360px, 30vw, 460px)' : (isApiGateway ? 320 : 280);
    const defaultHeight = isServer
        ? `clamp(350px, ${180 + (maxRows * 100)}px, 85vh)`
        : 'auto';

    // Helper to check permissions - supports both "streams" and "client.streams" style
    const canEdit = useCallback((field: string) => {
        if (!editableFields) return true; // No restrictions
        // Check for exact match or prefixed match (e.g., "streams" matches "client.streams")
        return editableFields.some(ef => ef === field || ef.endsWith('.' + field));
    }, [editableFields]);

    // Sync state with node data
    useEffect(() => {
        if (!node) return;
        setLabel(node.data.label as string || "");
        
        // Sync buffer capacity (max load)
        if (node.data.buffer_capacity !== undefined) {
            setCapacity(node.data.buffer_capacity as number);
        } else if (node.type === 'message_queue' || node.type === 'load_balancer' || node.type === 'topic') {
            setCapacity(100); // Default if missing
        } else if (node.type === 'server' || node.type === 'api_gateway' || node.type === 'database' || node.type === 'cache') {
            setCapacity(5); // Default if missing
        }

        if (node.type === 'client') {
            setStreams((node.data.streams as TrafficStream[]) ?? []);
        }
        if (node.type === 'cache') {
            setHitRate((node.data.cache_hit_rate as number) ?? 0.8);
        }
        if (node.type === 'database' || node.type === 'cache') {
            setProcessingDelay((node.data.processing_delay as number) ?? (node.type === 'database' ? 12 : 3));
        }
        if (node.type === 'api_gateway') {
            setGatewayOutputs(
                ((node.data.dependencies as any[]) ?? []).map((d: any) => ({
                    ...d,
                    method: d.method || 'GET',
                    path: d.path || '/',
                }))
            );
        }
    }, [node?.id, node?.data?.label, node?.data?.buffer_capacity, node?.data?.streams, node?.data?.cache_hit_rate, node?.data?.processing_delay, node?.type]);

    // Reset width/height when the selected node changes - useLayoutEffect prevents
    // the one-frame flash where new content renders at the previous node's size.
    useLayoutEffect(() => {
        setWidth(null);
        setHeight(null);
    }, [node?.id]);

    // Reset mobile sheet height to 50vh whenever a different node is opened
    useEffect(() => {
        if (node && isMobile) {
            setMobileHeightPx(Math.round(window.innerHeight * 0.5));
        }
    }, [node?.id]);

    // Resize mouse move/up handlers.
    // We mutate the DOM directly during drag (no setState → no re-renders → no jitter),
    // then commit the final size to React state only on mouseup.
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeType.current || !inspectorRef.current) return;

            if (resizeType.current === 'horizontal' || resizeType.current === 'both') {
                const newWidth = Math.max(240, Math.min(1000, startWidth.current + (startX.current - e.clientX)));
                dragWidthRef.current = newWidth;
                inspectorRef.current.style.width = `${newWidth}px`;
            }

            if (resizeType.current === 'vertical' || resizeType.current === 'both') {
                const newHeight = Math.max(150, Math.min(window.innerHeight * 0.9, startHeight.current + (startY.current - e.clientY)));
                dragHeightRef.current = newHeight;
                inspectorRef.current.style.height = `${newHeight}px`;
            }
        };

        const handleMouseUp = () => {
            if (!resizeType.current) return;
            resizeType.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Commit final dimensions to React state so they survive re-renders
            if (dragWidthRef.current !== null) { setWidth(dragWidthRef.current); dragWidthRef.current = null; }
            if (dragHeightRef.current !== null) { setHeight(dragHeightRef.current); dragHeightRef.current = null; }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Resize mouse down handler
    const handleMouseDown = useCallback((e: React.MouseEvent, type: 'horizontal' | 'vertical' | 'both') => {
        e.preventDefault();
        resizeType.current = type;
        startX.current = e.clientX;
        startY.current = e.clientY;

        const rect = inspectorRef.current?.getBoundingClientRect();
        startWidth.current = rect?.width ?? 500;
        startHeight.current = rect?.height ?? 400;

        document.body.style.cursor = type === 'both' ? 'nwse-resize' : (type === 'horizontal' ? 'ew-resize' : 'ns-resize');
        document.body.style.userSelect = 'none';
    }, []);

    // NOW we can have the early return - after all hooks
    if (!node) {
        return null;
    }

    const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newLabel = e.target.value;
        setLabel(newLabel);
        onUpdateNode(node.id, { label: newLabel });
    };

    const handleCapacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        setCapacity(val);
        onUpdateNode(node.id, { buffer_capacity: val });
    };

    const handleHitRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value) / 100;
        setHitRate(val);
        onUpdateNode(node.id, { cache_hit_rate: val });
    };



    const updateStreams = (newStreams: TrafficStream[]) => {
        setStreams(newStreams);
        onUpdateNode(node.id, { streams: newStreams });
    };

    const addStream = () => {
        const newStream: TrafficStream = {
            id: `stream-${crypto.randomUUID().slice(0, 8)}`,
            label: "Read Traffic",
            is_write: false,
            weight: 1,
            method: "GET",
            path: "/",
            rate: 5.0
        };
        updateStreams([...streams, newStream]);
    };

    const removeStream = (idx: number) => {
        const next = streams.filter((_, i) => i !== idx);
        updateStreams(next);
    };

    const editStream = (idx: number, field: keyof TrafficStream, val: any) => {
        const next = streams.map((s, i) => i === idx ? { ...s, [field]: val } : s);
        updateStreams(next);
    };

    // Gateway output handlers
    const updateGatewayOutputs = (next: typeof gatewayOutputs) => {
        setGatewayOutputs(next);
        // Each output gets its own matching endpoint so packets only leave via
        // the output whose method+path matches the request.
        const endpoints = next.map(dep => ({
            id: `ep-${dep.id}`,
            method: dep.method,
            path: dep.path,
            forward_to: [{ target_id: dep.id, delay: 0 }],
            strategy: 'round_robin',
            error_rate: 0,
            rate: 0,
        }));
        onUpdateNode(node.id, { dependencies: next, endpoints });
    };

    const addGatewayOutput = () => {
        const id = `out-${crypto.randomUUID().slice(0, 8)}`;
        updateGatewayOutputs([...gatewayOutputs, { id, label: `Service ${gatewayOutputs.length + 1}`, method: 'GET', path: '/' }]);
    };

    const removeGatewayOutput = (idx: number) => {
        updateGatewayOutputs(gatewayOutputs.filter((_, i) => i !== idx));
    };

    const editGatewayOutput = (idx: number, field: string, val: string) => {
        updateGatewayOutputs(gatewayOutputs.map((o, i) => i === idx ? { ...o, [field]: val } : o));
    };

    // During drag, dragWidthRef/dragHeightRef hold the live value. Reading them here
    // ensures any React re-render triggered by unrelated state (e.g. simulation metrics)
    // applies the correct current drag size rather than the stale committed state,
    // which would otherwise override our direct DOM mutation for a single frame.
    const liveWidth = dragWidthRef.current ?? width;
    const liveHeight = dragHeightRef.current ?? height;
    const actualWidth = isMobile ? '100%' : (liveWidth ?? defaultWidth);
    const actualHeight = isMobile
        ? (mobileDragHeightRef.current ?? mobileHeightPx)
        : (liveHeight ?? defaultHeight);

    const mobileHidden = isMobile && mobileSheetState === 'closed';

    return (
        <div
            ref={inspectorRef}
            data-inspector
            className={`
                fixed z-[200] bg-white/95 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col scale-100
                transition-[opacity,transform] duration-200
                ${isMobile
                    ? `inset-x-0 bottom-0 rounded-t-3xl max-[400px]:rounded-t-2xl border-t border-slate-200`
                    : 'right-6 bottom-6 max-h-[min(900px,90vh)] rounded-3xl border border-white/50 ring-1 ring-slate-200/50 translate-y-0'}
            `}
            style={{
                width: actualWidth,
                height: actualHeight,
                transform: isMobile
                    ? (mobileHidden ? 'translateY(100%)' : 'none')
                    : (!node ? 'translateY(20px) scale(0.95)' : 'none'),
                opacity: isMobile ? (mobileHidden ? 0 : 1) : (!node ? 0 : 1),
                pointerEvents: (isMobile ? mobileHidden : !node) ? 'none' : 'auto'
            }}
        >
            {/* Mobile Grab Handle — drag to resize, drag down past threshold to dismiss */}
            {isMobile && (
                <div
                    className="w-full flex justify-center pt-3 pb-2 absolute top-0 z-20 touch-none"
                    onTouchStart={(e) => {
                        touchStartY.current = e.touches[0].clientY;
                        touchStartHeightRef.current = mobileHeightPx;
                        // Disable height transition for smooth live drag
                        if (inspectorRef.current) {
                            inspectorRef.current.style.transition = 'opacity 200ms, transform 200ms';
                        }
                    }}
                    onTouchMove={(e) => {
                        if (!inspectorRef.current) return;
                        const delta = touchStartY.current - e.touches[0].clientY;
                        const newHeight = Math.max(60, Math.min(window.innerHeight * 0.92, touchStartHeightRef.current + delta));
                        mobileDragHeightRef.current = newHeight;
                        inspectorRef.current.style.height = `${newHeight}px`;
                    }}
                    onTouchEnd={() => {
                        // Restore CSS transition
                        if (inspectorRef.current) {
                            inspectorRef.current.style.transition = '';
                        }
                        const finalHeight = mobileDragHeightRef.current;
                        mobileDragHeightRef.current = null;
                        if (finalHeight !== null && finalHeight < 100) {
                            onClose?.();
                            onMobileSheetStateChange?.('closed');
                            setMobileHeightPx(Math.round(window.innerHeight * 0.5));
                        } else if (finalHeight !== null) {
                            setMobileHeightPx(Math.round(finalHeight));
                        }
                    }}
                >
                    <div className="w-12 h-1.5 max-[400px]:w-8 max-[400px]:h-1 bg-slate-200 rounded-full" />
                </div>
            )}

            {/* Resize Handles (Desktop Only) */}
            {!isMobile && (
                <>
                    {/* Left Edge */}
                    <div
                        onMouseDown={(e) => handleMouseDown(e, 'horizontal')}
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize group hover:bg-blue-500/10 transition-colors z-[210]"
                    >
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200/50 group-hover:bg-blue-400 transition-colors" />
                    </div>
                    {/* Top Edge */}
                    <div
                        onMouseDown={(e) => handleMouseDown(e, 'vertical')}
                        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize group hover:bg-blue-500/10 transition-colors z-[210]"
                    >
                        <div className="absolute left-0 top-0 right-0 h-0.5 bg-slate-200/50 group-hover:bg-blue-400 transition-colors" />
                    </div>
                    {/* Top-Left Corner */}
                    <div
                        onMouseDown={(e) => handleMouseDown(e, 'both')}
                        className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize group z-[220] flex items-center justify-center"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-blue-500 transition-colors" />
                    </div>
                </>
            )}

            {/* Header with Label Editing */}
            <div
                className="p-4 max-[400px]:p-2.5 border-b border-slate-100 flex items-center gap-3 max-[400px]:gap-2 bg-slate-50/50"
            >
                <div className={`p-2 max-[400px]:p-1.5 rounded-lg ${bgColor} ${textColor}`}>
                    <Icon size={18} className="max-[400px]:w-3.5 max-[400px]:h-3.5" />
                </div>
                <div className="flex-1">
                    <input
                        value={label}
                        onChange={handleLabelChange}
                        className="w-full bg-transparent border-none p-0 text-sm max-[400px]:text-xs font-bold text-slate-800 focus:ring-0 placeholder-slate-400 outline-none"
                        placeholder="Node Label"
                        disabled={!canEdit('label')}
                    />
                    <div className="text-[10px] max-[400px]:text-[8px] text-slate-400 font-mono">{node.id}</div>
                </div>
            </div>

            {/* Content Area */}
            <div className={`flex-1 overflow-hidden flex flex-col ${isServer ? '' : 'overflow-y-auto'}`}>

                {isApiGateway ? (
                    <div className="p-4 max-[400px]:p-3 space-y-4">
                        {/* Add Output */}
                        <div className="flex justify-center">
                            <button
                                onClick={addGatewayOutput}
                                className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-full transition-all text-indigo-600 bg-white shadow border border-slate-200 hover:bg-indigo-50"
                            >
                                Add Output
                            </button>
                        </div>

                        {/* Output rows */}
                        <div className="space-y-2">
                            {gatewayOutputs.map((out, idx) => {
                                const colors = getMethodColor(out.method || 'GET');
                                return (
                                    <div
                                        key={out.id}
                                        className="relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:border-indigo-300 transition-all duration-200"
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.bg}`} />
                                        <div className="pl-3.5 pr-2.5 py-2.5 space-y-2">
                                            {/* Label row */}
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={out.label}
                                                    onChange={(e) => editGatewayOutput(idx, 'label', e.target.value)}
                                                    className="flex-1 bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium rounded-md px-2 py-1 focus:outline-none focus:border-indigo-400 transition-all"
                                                    placeholder="Service name"
                                                />
                                                <button
                                                    onClick={() => removeGatewayOutput(idx)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                            {/* Method + Path row */}
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-shrink-0">
                                                    <select
                                                        value={out.method}
                                                        onChange={(e) => editGatewayOutput(idx, 'method', e.target.value)}
                                                        className={`${colors.bg} ${colors.text} ${colors.border} border text-xs font-bold rounded px-2 py-0.5 cursor-pointer focus:outline-none appearance-none hover:opacity-80 transition-opacity pr-5`}
                                                    >
                                                        <option value="GET">GET</option>
                                                        <option value="POST">POST</option>
                                                        <option value="PUT">PUT</option>
                                                        <option value="DELETE">DELETE</option>
                                                    </select>
                                                    <ChevronDown size={10} className={`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none ${colors.text}`} />
                                                </div>
                                                <input
                                                    value={out.path}
                                                    onChange={(e) => editGatewayOutput(idx, 'path', e.target.value)}
                                                    className="flex-1 bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono rounded-md px-2 py-1 focus:outline-none focus:border-indigo-400 transition-all"
                                                    placeholder="/api/v1"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {gatewayOutputs.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                                        <Icon className="text-slate-400" size={24} />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 mb-1">No outputs defined</p>
                                    <p className="text-xs text-slate-400">Click "Add Output" to add a downstream service</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : isServer ? (
                    <div className="flex-1 h-full min-h-0 flex flex-col relative">
                        {/* Hardware Settings for Server */}
                        <div className="px-4 py-3 max-[400px]:px-3 max-[400px]:py-2 bg-white border-b border-slate-100 flex items-center justify-between gap-4 max-[400px]:gap-2">
                            <span className="text-xs max-[400px]:text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Buffer Capacity</span>
                            <div className="flex items-center bg-slate-100/50 border border-slate-200 rounded-md px-2 py-0.5 focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent transition-all">
                                <input
                                    type="number"
                                    min="1"
                                    value={capacity}
                                    onChange={handleCapacityChange}
                                    className="w-20 max-[400px]:w-14 text-xs max-[400px]:text-[10px] font-bold font-mono text-blue-600 bg-transparent outline-none text-right"
                                />
                                <span className="text-[10px] max-[400px]:text-[8px] text-slate-400 ml-1">req</span>
                            </div>
                        </div>

                        <div className="flex-1 relative">
                            <ServerLogicEditor
                                key={node.id}
                                node={node}
                                onUpdateNode={onUpdateNode}
                                editableFields={editableFields}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="p-4 max-[400px]:p-3 space-y-6 max-[400px]:space-y-4">

                        {/* Buffer Capacity for Non-Server Nodes */}
                        {(node.type === 'message_queue' || node.type === 'database' || node.type === 'cache' || node.type === 'topic') && (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Buffer Capacity</span>
                                <div className="flex items-center bg-slate-100/50 border border-slate-200 rounded-md px-2 py-0.5 focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent transition-all">
                                    <input
                                        type="number"
                                        min="1"
                                        value={capacity}
                                        onChange={handleCapacityChange}
                                        className="w-14 text-xs font-bold font-mono text-blue-600 bg-transparent outline-none text-right"
                                        disabled={!canEdit('buffer_capacity')}
                                    />
                                    <span className="text-[10px] font-bold text-slate-400 ml-1">req</span>
                                </div>
                            </div>
                        )}

                        {/* Cache Hit Rate */}
                        {node.type === 'cache' && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                                    <span>Hit Rate</span>
                                    <span className="text-slate-800">{(hitRate * 100).toFixed(0)}%</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={hitRate * 100}
                                    onChange={handleHitRateChange}
                                    className="w-full accent-purple-500"
                                    disabled={!canEdit('cache_hit_rate')}
                                />
                            </div>
                        )}

                        {/* Database / Cache Delay */}
                        {(node.type === 'database' || node.type === 'cache') && (
                            <div className="space-y-2">
                                <div className="flex flex-col gap-1 mb-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
                                        <span>Throughput</span>
                                        <div className="flex items-center bg-slate-100/50 border border-slate-200 rounded-md px-2 py-0.5 focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent transition-all">
                                            <input
                                                type="number"
                                                value={processingDelay <= 0 ? 0 : Number((60 / processingDelay).toFixed(1))}
                                                onChange={(e) => {
                                                    const rpsVal = parseFloat(e.target.value);
                                                    if (isNaN(rpsVal)) return;
                                                    const delay = rpsVal <= 0 ? 0 : 60 / rpsVal;
                                                    setProcessingDelay(delay);
                                                    onUpdateNode(node.id, { processing_delay: delay });
                                                }}
                                                className="w-14 bg-transparent text-xs font-bold font-mono text-blue-600 text-right focus:outline-none"
                                                min="0"
                                                step="0.1"
                                                disabled={!canEdit('processing_delay')}
                                            />
                                            <span className="text-[10px] text-slate-400 ml-1">rps</span>
                                        </div>
                                    </label>
                                    <div className="text-[10px] text-slate-400 text-right">
                                        {processingDelay <= 0 ? 'Instant' : `~${Math.round(processingDelay * 16.67)}ms Latency`}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Client Traffic Streams */}
                        {node.type === 'client' && (
                            <div className="space-y-4">
                                {!canEdit('streams') && (
                                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                                            🔒
                                        </div>
                                        <p className="text-sm text-amber-700 font-medium">Client traffic is locked during puzzles</p>
                                    </div>
                                )}

                                {/* Add Stream */}
                                {canEdit('streams') && (
                                    <div className="flex justify-center">
                                        <div className="flex items-center gap-1 px-1 py-0.5 bg-white rounded-full shadow border border-slate-200">
                                            <button
                                                onClick={addStream}
                                                className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-full transition-all text-blue-600 hover:bg-blue-50"
                                            >
                                                Add Stream
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Stream Cards */}
                                <div className="space-y-3">
                                    {streams.map((stream, idx) => {
                                        const colors = getMethodColor(stream.method);

                                        return (
                                            <div
                                                key={stream.id}
                                                className={`relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:border-blue-300 transition-all duration-200 ${!canEdit('streams') ? 'opacity-60 pointer-events-none' : ''}`}
                                            >
                                                {/* Compact Accent Bar */}
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.bg}`}></div>

                                                <div className="pl-3.5 pr-2.5 py-2.5 space-y-2.5">
                                                    {/* Stream Controls Row */}
                                                    <div className="flex items-center gap-2">
                                                        {/* Method Badge */}
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <div className="relative">
                                                                <select
                                                                    value={stream.method}
                                                                    onChange={(e) => {
                                                                        const newMethod = e.target.value;
                                                                        const newIsWrite = newMethod !== 'GET';
                                                                        const next = streams.map((s, i) => i === idx ? { ...s, method: newMethod, is_write: newIsWrite } : s);
                                                                        updateStreams(next);
                                                                    }}
                                                                    className={`${colors.bg} ${colors.text} ${colors.border} border text-xs font-bold rounded px-2 py-0.5 cursor-pointer focus:outline-none appearance-none hover:opacity-80 transition-opacity pr-5`}
                                                                    disabled={!canEdit('streams')}
                                                                >
                                                                    <option value="GET">GET</option>
                                                                    <option value="POST">POST</option>
                                                                    <option value="PUT">PUT</option>
                                                                    <option value="DELETE">DELETE</option>
                                                                </select>
                                                                <ChevronDown size={10} className={`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none ${colors.text}`} />
                                                            </div>
                                                        </div>

                                                        {/* Path Input */}
                                                        <div className="flex-1 relative">
                                                            <input
                                                                value={stream.path}
                                                                onChange={(e) => editStream(idx, 'path', e.target.value)}
                                                                className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono rounded-md px-2 py-1 focus:outline-none focus:border-blue-400 transition-all"
                                                                placeholder="/api/v1"
                                                                disabled={!canEdit('streams')}
                                                            />
                                                        </div>

                                                        {/* Delete (Desktop only) */}
                                                        {canEdit('streams') && (
                                                            <button
                                                                onClick={() => removeStream(idx)}
                                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* RPS / Retries Row */}
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">RPS</span>
                                                            <input
                                                                type="number"
                                                                value={stream.rate != null && !isNaN(stream.rate) ? stream.rate : 5}
                                                                onChange={(e) => { const v = parseInt(e.target.value, 10); editStream(idx, 'rate', isNaN(v) ? 0 : v); }}
                                                                className="w-10 bg-transparent text-xs font-bold text-slate-700 focus:outline-none text-right"
                                                                min="0"
                                                                step="1"
                                                                disabled={!canEdit('streams')}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 focus-within:ring-1 focus-within:ring-amber-400 transition-all">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Retries</span>
                                                            <input
                                                                type="number"
                                                                value={stream.retries ?? 0}
                                                                onChange={(e) => { const v = parseInt(e.target.value); editStream(idx, 'retries', Math.min(5, Math.max(0, isNaN(v) ? 0 : v))); }}
                                                                className="w-8 bg-transparent text-xs font-bold text-amber-600 focus:outline-none text-right"
                                                                min="0"
                                                                max="5"
                                                                disabled={!canEdit('streams')}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Empty State */}
                                    {streams.length === 0 && canEdit('streams') && (
                                        <div className="flex flex-col items-center justify-center py-8 text-center">
                                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                                                <Icon className="text-slate-400" size={24} />
                                            </div>
                                            <p className="text-sm font-medium text-slate-500 mb-1">No traffic streams</p>
                                            <p className="text-xs text-slate-400">Click "Add Stream" to create your first traffic stream</p>
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Close button for Mobile (positioned at the end to ensure it's on top) */}
            {isMobile && (
                <button
                    onClick={() => onClose?.()}
                    className="absolute top-4 right-4 max-[400px]:top-3 max-[400px]:right-3 p-3 max-[400px]:p-2 bg-white/80 backdrop-blur shadow-sm border border-slate-200 text-slate-500 rounded-full z-50 active:scale-90 transition-all"
                    title="Close Inspector"
                >
                    <Plus size={24} className="rotate-45 max-[400px]:w-5 max-[400px]:h-5" />
                </button>
            )}
        </div>
    );
}
