import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Network } from 'lucide-react';
import { getMethodColor } from '../../utils/colors';

export const ApiGatewayNode = memo(function ApiGatewayNode({ id, data, selected }: NodeProps) {
    const updateNodeInternals = useUpdateNodeInternals();

    useEffect(() => {
        updateNodeInternals(id);
    }, [id, data.dependencies, updateNodeInternals]);

    const deps = Array.isArray(data.dependencies) ? (data.dependencies as any[]) : [];

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-indigo-50 to-white rounded-2xl shadow-md border transition-all duration-200 min-w-[200px] group flex flex-col
            ${selected ? 'border-indigo-500 shadow-lg z-10' : 'border-indigo-200 hover:shadow-lg hover:border-indigo-300'}
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* Single input handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!border-2 transition-all hover:!border-indigo-500 hover:!bg-indigo-100 !bg-slate-50 !border-slate-400"
                style={{ left: -6, top: '50%' }}
            />

            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b bg-slate-50/30 border-slate-50 rounded-t-2xl">
                <div className="p-2 rounded-xl shadow-sm border bg-white text-indigo-600 border-slate-100">
                    <Network size={18} />
                </div>
                <span className="font-bold text-sm leading-tight text-slate-700">{data.label as string || "API Gateway"}</span>
            </div>

            {/* Outputs list */}
            {deps.length > 0 && (
                <div className="p-2 space-y-1.5">
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1 mb-1">Outputs</div>
                    {deps.map((dep: any) => {
                        const method = dep.method || 'GET';
                        const path = dep.path || '/';
                        const colors = getMethodColor(method);
                        return (
                            <div
                                key={dep.id}
                                className={`relative flex items-center justify-end bg-white px-2 py-1.5 rounded-md border shadow-sm h-8 w-full hover:border-indigo-300 transition-colors ${colors.border}`}
                            >
                                <div className="flex items-center gap-2 min-w-0 w-full justify-end pr-2">
                                    <span
                                        className="text-[10px] text-slate-600 font-mono flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-right"
                                        title={path}
                                        style={{ direction: 'rtl', textAlign: 'right' }}
                                    >
                                        <bdi>{path}</bdi>
                                    </span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>
                                        {method}
                                    </span>
                                </div>
                                <Handle
                                    type="source"
                                    position={Position.Right}
                                    id={dep.id}
                                    isConnectable={1 as unknown as boolean}
                                    className={`!border-2 !border-white transition-all hover:scale-125 hover:!border-indigo-200 shadow-sm ${colors.handle}`}
                                    style={{ right: -14, top: '50%' }}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
