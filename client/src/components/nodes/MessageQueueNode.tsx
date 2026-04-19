import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Container } from 'lucide-react';
import { useSimDataStore } from '../../stores/simDataStore';

export const MessageQueueNode = memo(function MessageQueueNode({ id, data, selected }: NodeProps) {
    const simData = useSimDataStore((state) => state.nodes[id]);
    const currentLoad = simData?.current_load ?? 0;
    const capacity = simData?.buffer_capacity ?? (data.buffer_capacity as number) ?? 100;

    // Explicit "Full" check. Using >= capacity to be safe.
    const isFull = currentLoad >= capacity;
    const isCrisis = isFull; // Naming logic just in case we want a threshold later (e.g. > 90)

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-orange-50 to-white rounded-2xl shadow-md border transition-all duration-200 min-w-[280px] flex flex-col group
            ${selected
                ? 'border-orange-500 shadow-lg z-10'
                : (isCrisis
                    ? 'border-red-500 shadow-lg ring-4 ring-red-500/10'
                    : 'border-orange-200 hover:shadow-lg hover:border-orange-300'
                )
            }
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className={`!border-2 !border-slate-400 transition-all hover:!border-orange-500 hover:!bg-orange-100 ${isCrisis ? '!bg-red-500 !border-red-600' : '!bg-slate-50'}`}
                style={{ left: -6, top: '50%' }}
            />
            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className={`!border-2 !border-slate-400 transition-all hover:!border-orange-500 hover:!bg-orange-100 ${isCrisis ? '!bg-red-500 !border-red-600' : '!bg-slate-50'}`}
                style={{ right: -6, top: '50%' }}
            />

            {/* Header */}
            <div className={`flex items-center gap-3 p-3 border-b rounded-t-2xl ${isCrisis ? 'bg-red-50 border-red-100' : 'bg-slate-50/30 border-slate-50'}`}>
                <div className={`p-2 rounded-xl shadow-sm border ${isCrisis ? 'bg-red-100 text-red-600 border-red-200 animate-pulse' : 'bg-white text-orange-600 border-slate-100'}`}>
                    <Container size={18} />
                </div>
                <div className="flex flex-col">
                    <span className={`font-bold text-sm leading-tight ${isCrisis ? 'text-red-700' : 'text-slate-700'}`}>{data.label as string || "Message Queue"}</span>
                    <span className={`text-[10px] font-mono ${isCrisis ? 'text-red-500' : 'text-slate-400'}`}>{isCrisis ? 'OVERFLOW' : ''}</span>
                </div>
            </div>

            {/* Body */}
            <div className="p-3">
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-baseline">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isCrisis ? 'text-red-500' : 'text-slate-400'}`}>Queue Depth</span>
                        <span className={`text-[10px] font-mono ${isCrisis ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                            {currentLoad.toFixed(0)} <span className="text-slate-300">/</span> {capacity.toFixed(0)}
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ease-out ${isCrisis ? 'bg-red-500' : 'bg-orange-500'}`}
                            style={{ width: `${Math.min(100, (currentLoad / capacity) * 100)}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
});
