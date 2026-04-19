import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Radio } from 'lucide-react';
import { useSimDataStore } from '../../stores/simDataStore';

export const TopicNode = memo(function TopicNode({ id, data, selected }: NodeProps) {
    const simData = useSimDataStore((state) => state.nodes[id]);
    const currentLoad = simData?.current_load ?? 0;
    const capacity = simData?.buffer_capacity ?? (data.buffer_capacity as number) ?? 100;
    const loadPercent = Math.min(100, (currentLoad / capacity) * 100);
    const isNearCapacity = loadPercent > 80;

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-pink-50 to-white rounded-2xl shadow-md border transition-all duration-200 min-w-[280px] flex flex-col group
            ${selected ? 'border-pink-500 shadow-lg z-10' : 'border-pink-200 hover:shadow-lg hover:border-pink-300'}
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-pink-500 hover:!bg-pink-100"
                style={{ left: -6, top: '50%' }}
            />

            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b border-pink-100/50 rounded-t-2xl">
                <div className="p-2 bg-pink-50 text-pink-600 rounded-xl shadow-sm border border-pink-100">
                    <Radio size={18} />
                </div>
                <span className="font-bold text-slate-700 text-sm">{data.label as string || "Topic"}</span>
            </div>

            {/* Body */}
            <div className="p-3">
                <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buffer</span>
                    <span className={`text-[10px] font-mono ${isNearCapacity ? 'text-pink-600 font-bold' : 'text-slate-500'}`}>
                        {currentLoad.toFixed(0)} <span className="text-slate-300">/</span> {capacity}
                    </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ease-out ${isNearCapacity ? 'bg-pink-500' : 'bg-pink-400'}`}
                        style={{ width: `${loadPercent}%` }}
                    ></div>
                </div>
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-pink-500 hover:!bg-pink-100"
                style={{ right: -6, top: '50%' }}
            />
        </div>
    );
});
