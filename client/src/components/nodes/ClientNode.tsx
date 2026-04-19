import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Smartphone } from 'lucide-react';
import { getMethodColor } from '../../utils/colors';

export const ClientNode = memo(function ClientNode({ data, selected }: NodeProps) {
    const streams = (data.streams as any[]) || [];

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-blue-50 to-white rounded-2xl shadow-md border transition-all duration-200 w-[280px] group flex flex-col
            ${selected ? 'border-blue-500 shadow-lg z-10' : 'border-blue-200 hover:shadow-lg hover:border-blue-300'}
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}>
            {/* HINT: Client usually doesn't have an input handle in this sim, but if needed, add here */}

            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b border-slate-50 bg-slate-50/30 rounded-t-2xl">
                <div className="p-2 bg-white text-blue-600 rounded-xl shadow-sm border border-slate-100">
                    <Smartphone size={18} />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-slate-700 text-sm leading-tight">{data.label as string || "Client"}</span>
                    {/* Total RPS Removed */}
                </div>
            </div>

            {/* Body */}
            <div className={`p-3 space-y-2 ${streams.length === 0 ? 'pb-4' : ''}`}>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Traffic Streams</div>

                {streams.length === 0 && (
                    <div className="text-[10px] text-slate-400 text-center py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        No traffic configured
                    </div>
                )}

                {streams.map((stream) => {
                    const method = stream.method || (stream.is_write ? 'POST' : 'GET');

                    const colors = getMethodColor(method);

                    return (
                        <div key={stream.id} className={`relative flex items-center justify-between bg-white px-2 py-1.5 rounded-md border shadow-sm h-8 transition-colors hover:border-blue-300 min-w-0 ${colors.border}`}>
                            <div className="flex items-center gap-2 w-full pr-3 min-w-0">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>
                                    {method}
                                </span>
                                <span className="text-[10px] text-slate-600 font-mono flex-1 overflow-hidden whitespace-nowrap text-ellipsis" title={stream.path || '/'} style={{ direction: 'rtl', textAlign: 'left' }}>
                                    <bdi>{stream.path || '/'}</bdi>
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono flex-shrink-0">
                                    {(stream.rate || 1.0).toFixed(1)} <span className="text-[7px] uppercase">RPS</span>
                                </span>
                            </div>
                            {/* Stream Handle */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={stream.id}
                                className={`!border-2 !border-white transition-all hover:scale-125 hover:!border-blue-200 shadow-sm ${colors.handle}`}
                                style={{ right: -13, top: '50%' }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
