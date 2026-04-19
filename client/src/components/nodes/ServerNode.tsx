import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Server, CornerDownLeft } from 'lucide-react';
import { getMethodColor } from '../../utils/colors';
import { useSimDataStore } from '../../stores/simDataStore';

export const ServerNode = memo(function ServerNode({ id, data, selected }: NodeProps) {
    // Subscribe to simulation data from store (bypasses React node state updates)
    const simData = useSimDataStore((state) => state.nodes[id]);
    const updateNodeInternals = useUpdateNodeInternals();

    // Trigger internal update when handles change
    useEffect(() => {
        updateNodeInternals(id);
    }, [id, data.endpoints, data.dependencies, updateNodeInternals]);

    const currentLoad = simData?.current_load ?? 0;
    const capacity = simData?.buffer_capacity ?? (data.buffer_capacity as number) ?? 100;
    const isOverloaded = currentLoad >= capacity * 0.9;

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-green-50 to-white rounded-2xl shadow-md border transition-all duration-200 min-w-[280px] flex flex-col group
            ${selected
                ? 'border-green-500 shadow-lg z-10'
                : (isOverloaded
                    ? 'border-red-500 shadow-lg ring-4 ring-red-500/10'
                    : 'border-green-200 hover:shadow-lg hover:border-green-300')
            }
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* Main Target Handle (Only if NO endpoints) */}
            {(!data.endpoints || (data.endpoints as any[]).length === 0) && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className={`!border-2 transition-all hover:!border-green-500 hover:!bg-green-100 ${isOverloaded ? '!bg-red-500 !border-red-600' : '!bg-slate-50 !border-slate-400'}`}
                    style={{ left: -6, top: '50%' }}
                />
            )}
            {/* Main Source Handle (Only if NO dependencies) */}
            {(!data.dependencies || (data.dependencies as any[]).length === 0) && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className={`!border-2 transition-all hover:!border-green-500 hover:!bg-green-100 ${isOverloaded ? '!bg-red-500 !border-red-600' : '!bg-slate-50 !border-slate-400'}`}
                    style={{ right: -6, top: '50%' }}
                />
            )}

            {/* Header */}
            <div className={`flex items-center gap-3 p-3 border-b rounded-t-2xl ${isOverloaded ? 'bg-red-50 border-red-100' : 'bg-slate-50/30 border-slate-50'}`}>
                <div className={`p-2 rounded-xl shadow-sm border ${isOverloaded ? 'bg-red-100 text-red-600 border-red-200 animate-pulse' : 'bg-white text-green-600 border-slate-100'}`}>
                    <Server size={18} />
                </div>
                <div className="flex flex-col">
                    <span className={`font-bold text-sm leading-tight ${isOverloaded ? 'text-red-700' : 'text-slate-700'}`}>{data.label as string || "Server"}</span>
                    <div className="flex items-center gap-2">
                        {isOverloaded && <span className="text-[10px] font-mono text-red-500">OVERLOADED</span>}
                        {/* Total RPS Removed */}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="p-3 flex flex-col gap-3">
                {/* Load Bar */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-baseline">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isOverloaded ? 'text-red-500' : 'text-slate-400'}`}>Load</span>
                        <span className={`text-[10px] font-mono ${isOverloaded ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                            {Math.round(currentLoad)} <span className="text-slate-300">/</span> {capacity.toFixed(0)}
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ease-out ${isOverloaded ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(100, (currentLoad / capacity) * 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Columns Container */}
                {(
                    (Array.isArray(data.endpoints) && data.endpoints.length > 0) ||
                    (Array.isArray(data.dependencies) && data.dependencies.length > 0)
                ) && (
                        <div 
                            className="relative flex mt-1 pt-3 border-t border-slate-50"
                        >
                            {/* Left Column: Inputs (Endpoints) */}
                            {Array.isArray(data.endpoints) && data.endpoints.length > 0 && (
                                <div className="flex-1 min-w-0 w-0 space-y-2">
                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Inputs</div>
                                    {data.endpoints.map((ep: any) => {
                                        const colors = getMethodColor(ep.method);
                                        return (
                                            <div key={ep.id} className={`relative flex items-center bg-white px-2 py-1.5 rounded-md border shadow-sm h-8 w-full transition-colors hover:border-blue-300 min-w-0 ${colors.border}`}>
                                                {/* Input Handle (Left) */}
                                                <Handle
                                                    type="target"
                                                    position={Position.Left}
                                                    id={ep.id}
                                                    className={`!border-2 !border-white transition-all hover:scale-125 hover:!border-blue-200 shadow-sm ${colors.handle}`}
                                                    style={{ left: -14, top: '50%' }}
                                                />
                                                <div className="flex items-center gap-2 min-w-0 w-full">
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>
                                                        {ep.method}
                                                    </span>
                                                    <span className="text-[10px] text-slate-600 font-mono flex-1 overflow-hidden whitespace-nowrap text-ellipsis" title={ep.path} style={{ direction: 'rtl', textAlign: 'left' }}>
                                                        <bdi>{ep.path}</bdi>
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Middle Column: Explicit Gap + SVG Overlay */}
                            <div className="w-4 relative flex-shrink-0">
                                <svg className="absolute inset-y-0 w-full pointer-events-none z-10 overflow-visible">
                                    {Array.isArray(data.endpoints) && data.endpoints.map((ep: any, epIdx: number) => {
                                        const epY = 37 + (epIdx * 40); // 13 (label+gap) + 16 (h-8/2) + 8 (gap) = 37 center of row 1
                                        
                                        return (ep.forward_to || []).map((fw: any, fwIdx: number) => {
                                            const isReturn = fw.target_id === '__return__';
                                            const depIdx = Array.isArray(data.dependencies) 
                                                ? data.dependencies.findIndex((d: any) => d.id === fw.target_id)
                                                : -1;
                                            
                                            if (!isReturn && depIdx === -1) return null;
                                            
                                            const depY = isReturn 
                                                ? 37 
                                                : (37 + ((depIdx + 1) * 40));

                                            // Explicit Gap Mapping: Start @ 0 (Left of gap), End @ 16 (Right of gap)
                                            const x1 = 0;
                                            const x2 = 16;
                                            const cp1 = 4;
                                            const cp2 = 12;

                                            return (
                                                <path
                                                    key={`${ep.id}-${fw.target_id}-${fwIdx}`}
                                                    d={`M ${x1} ${epY} C ${cp1} ${epY}, ${cp2} ${depY}, ${x2} ${depY}`}
                                                    fill="none"
                                                    stroke={isReturn ? "#64748b" : "#22c55e" }
                                                    strokeWidth="2.5"
                                                    strokeDasharray={isReturn ? "4 4" : "none"}
                                                    opacity={isReturn ? 0.5 : 0.7}
                                                />
                                            );
                                        });
                                    })}
                                </svg>
                            </div>

                            {/* Right Column: Outputs (Dependencies) */}
                            {Array.isArray(data.dependencies) && data.dependencies.length > -1 && (
                                <div className="flex-1 min-w-0 w-0 space-y-2 items-end flex flex-col">
                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Outputs</div>
                                    
                                    {/* Static "Return Reply" row (NOW FIRST) */}
                                    <div className="relative flex items-center justify-end bg-green-50/50 px-2 py-1.5 rounded-md border border-dashed border-green-200 shadow-sm h-8 w-full transition-colors hover:border-green-400">
                                        <div className="flex items-center gap-2 min-w-0 w-full justify-end">
                                            <span className="text-[9px] text-slate-500 font-bold italic flex-1 text-right">Return Reply</span>
                                            <div className="p-1 bg-green-100 text-green-600 rounded">
                                                <CornerDownLeft size={10} />
                                            </div>
                                        </div>
                                    </div>

                                    {data.dependencies.map((dep: any) => {
                                        // Use the dependency's own method/path, with defaults
                                        const method = dep.method || 'GET';
                                        const path = dep.path || '/';
                                        const colors = getMethodColor(method);

                                        return (
                                            <div key={dep.id} className={`relative flex items-center justify-end bg-white px-2 py-1.5 rounded-md border shadow-sm h-8 w-full hover:border-purple-300 transition-colors ${colors.border}`}>
                                                <div className="flex items-center gap-2 min-w-0 w-full justify-end">
                                                    <span className="text-[10px] text-slate-600 font-mono flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-right" title={path} style={{ direction: 'rtl', textAlign: 'right' }}>
                                                        <bdi>{path}</bdi>
                                                    </span>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>
                                                        {method}
                                                    </span>
                                                </div>
                                                {/* Output Handle (Right) */}
                                                <Handle
                                                    type="source"
                                                    position={Position.Right}
                                                    id={dep.id}
                                                    className={`!border-2 !border-white transition-all hover:scale-125 hover:!border-purple-200 shadow-sm ${colors.handle}`}
                                                    style={{ right: -14, top: '50%' }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
            </div>
        </div>
    );
});
