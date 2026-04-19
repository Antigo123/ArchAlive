import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import { useSimDataStore } from '../../stores/simDataStore';

export const CacheNode = memo(function CacheNode({ id, data, selected }: NodeProps) {
    const hitRate = data.cache_hit_rate as number || 0.8;
    const simData = useSimDataStore((state) => state.nodes[id]);
    const currentLoad = simData?.current_load ?? 0;
    const capacity = simData?.buffer_capacity ?? (data.buffer_capacity as number) ?? 5;

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-purple-50 to-white rounded-2xl shadow-md border transition-all duration-200 min-w-[280px] flex flex-col group
            ${selected ? 'border-purple-500 shadow-lg z-10' : 'border-purple-200 hover:shadow-lg hover:border-purple-300'}
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-purple-500 hover:!bg-purple-100"
                style={{ left: -6, top: '50%' }}
            />
            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-purple-500 hover:!bg-purple-100"
                style={{ right: -6, top: '50%' }}
            />

            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b bg-slate-50/30 border-slate-50 rounded-t-2xl">
                <div className="p-2 bg-white text-purple-600 rounded-xl shadow-sm border border-slate-100 flex-shrink-0">
                    <Zap size={18} className={hitRate > 0.8 ? "fill-purple-500" : ""} />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-bold text-sm leading-tight text-slate-700 truncate">{data.label as string || "Cache"}</span>
                </div>
                <div className="px-1.5 py-0.5 bg-purple-100/80 text-purple-700 border border-purple-200/50 rounded shadow-sm text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                    {(() => {
                        const delay = (data.processing_delay as number) ?? 3;
                        return delay <= 0 ? '∞ RPS' : `${Math.round(60 / delay)} RPS`;
                    })()}
                </div>
            </div>

            {/* Body */}
            <div className="p-3 flex flex-col gap-3">
                {/* Hit Rate */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-baseline">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hit Rate</span>
                        <span className="text-[10px] font-mono text-purple-600 font-bold">
                            {(hitRate * 100).toFixed(0)}%
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${hitRate * 100}%` }}></div>
                    </div>
                </div>

                {/* Load / Capacity */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-baseline">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Load</span>
                        <span className="text-[10px] font-mono text-slate-500">
                            {currentLoad.toFixed(1)} <span className="text-slate-300">/</span> {capacity.toFixed(0)}
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ease-out ${currentLoad > capacity * 0.9 ? 'bg-red-500' : 'bg-purple-400'}`}
                            style={{ width: `${Math.min(100, (currentLoad / capacity) * 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});
