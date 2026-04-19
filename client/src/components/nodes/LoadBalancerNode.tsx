import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Scale } from 'lucide-react';

export const LoadBalancerNode = memo(function LoadBalancerNode({ data, selected }: NodeProps) {
    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-indigo-50 to-white rounded-2xl shadow-md border transition-all duration-200 min-w-[280px] flex flex-col group
            ${selected ? 'border-indigo-500 shadow-lg z-10' : 'border-indigo-200 hover:shadow-lg hover:border-indigo-300'}
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-indigo-500 hover:!bg-indigo-100"
                style={{ left: -6, top: '50%' }}
            />
            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-indigo-500 hover:!bg-indigo-100"
                style={{ right: -6, top: '50%' }}
            />

            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b bg-slate-50/30 border-slate-50 rounded-t-2xl">
                <div className="p-2 bg-white text-indigo-600 rounded-xl shadow-sm border border-slate-100">
                    <Scale size={18} />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-sm leading-tight text-slate-700">{data.label as string || "Load Balancer"}</span>
                </div>
            </div>

            <div className="p-2" />
        </div>
    );
});
