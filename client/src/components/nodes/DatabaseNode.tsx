import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Database } from 'lucide-react';
import { useSimDataStore } from '../../stores/simDataStore';

export const DatabaseNode = memo(function DatabaseNode({ id, data, selected }: NodeProps) {
    const simData = useSimDataStore((state) => state.nodes[id]);
    const currentLoad = simData?.current_load ?? 0;
    const capacity = simData?.buffer_capacity ?? (data.buffer_capacity as number) ?? 100;

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-amber-50 to-white rounded-2xl shadow-md border transition-all duration-200 min-w-[280px] group flex flex-col
            ${selected ? 'border-amber-500 shadow-lg z-10' : 'border-amber-200 hover:shadow-lg hover:border-amber-300'}
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-amber-500 hover:!bg-amber-100"
                style={{ left: -6, top: '50%' }}
            />

            {/* Optional Output Handle (for replication/streaming) */}
            <Handle
                type="source"
                position={Position.Right}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-amber-500 hover:!bg-amber-100"
                style={{ right: -6, top: '50%' }}
            />

            {/* Header */}
            <div className="flex items-center gap-2 p-3 border-b border-slate-50 bg-slate-50/30 rounded-t-2xl">
                <div className="p-2 bg-white text-amber-600 rounded-xl shadow-sm border border-slate-100 flex-shrink-0">
                    <Database size={18} />
                </div>
                <span className="font-bold text-slate-700 text-sm leading-tight flex-1 truncate">{data.label as string || "Database"}</span>
                <div className="px-2 py-1 bg-amber-100/80 text-amber-700 border border-amber-200/50 rounded-md shadow-sm text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                    {(() => {
                        const delay = (data.processing_delay as number) ?? 12;
                        return delay <= 0 ? '∞ RPS' : `${Math.round(60 / delay)} RPS`;
                    })()}
                </div>
            </div>

            {/* Body */}
            <div className="p-3">
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-baseline">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Load</span>
                        <span className="text-[10px] font-mono text-slate-500">
                            {currentLoad.toFixed(1)} <span className="text-slate-300">/</span> {capacity.toFixed(0)}
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ease-out ${currentLoad > (capacity * 0.9) ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, (currentLoad / capacity) * 100)}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
});
