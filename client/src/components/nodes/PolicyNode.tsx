import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ShieldCheck } from 'lucide-react';
import { useSimDataStore } from '../../stores/simDataStore';
import { useFocusParts } from '../../tutor/store';
import type { PolicyRule } from '../../tutor/scene';

const EFFECT_STYLES: Record<string, string> = {
    allow: 'bg-green-100 text-green-700',
    deny: 'bg-red-100 text-red-700',
    limit: 'bg-amber-100 text-amber-700',
};

function EffectBadge({ effect, rate }: { effect: string; rate?: number }) {
    return (
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap ${EFFECT_STYLES[effect] ?? EFFECT_STYLES.deny}`}>
            {effect === 'limit' ? `limit ${rate}/s` : effect}
        </span>
    );
}

/**
 * An ordered rule table that requests must pass. Depending on its label and rules, this is an
 * ACL, an authorization check, a firewall or a rate limiter.
 */
export const PolicyNode = memo(function PolicyNode({ id, data, selected }: NodeProps) {
    const rules = (data.rules as PolicyRule[] | undefined) ?? [];
    const hits = useSimDataStore(s => s.policyHits[id]);
    const focusParts = useFocusParts(data.alias);
    const defaultEffect = (data.default_effect as string | undefined) ?? 'deny';

    return (
        <div className={`
            node-card-enhanced bg-gradient-to-b from-violet-50 to-white rounded-2xl shadow-md border transition-all duration-200 w-[320px] flex flex-col group
            ${selected ? 'border-violet-500 shadow-lg z-10 animate-[selection-glow_2s_ease-in-out_infinite]' : 'border-violet-200 hover:shadow-lg hover:border-violet-300'}
        `}>
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-violet-500 hover:!bg-violet-100"
                style={{ left: -6, top: '50%' }}
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-violet-500 hover:!bg-violet-100"
                style={{ right: -6, top: '50%' }}
            />

            <div className="flex items-center gap-3 p-3 border-b border-slate-50 bg-slate-50/30 rounded-t-2xl">
                <div className="p-2 bg-white text-violet-600 rounded-xl shadow-sm border border-slate-100">
                    <ShieldCheck size={18} />
                </div>
                <span className="font-bold text-sm leading-tight text-slate-700 truncate">{data.label as string || 'Policy'}</span>
            </div>

            <div className="p-2 text-[10px]">
                <div className="grid grid-cols-[1.25rem_1fr_auto_2.25rem] gap-x-1.5 items-center px-1.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    <span>#</span><span>Who · action · path</span><span>Then</span><span className="text-right">Hits</span>
                </div>
                {rules.map((rule, i) => (
                    <div
                        key={i}
                        className={`grid grid-cols-[1.25rem_1fr_auto_2.25rem] gap-x-1.5 items-center px-1.5 py-1 rounded-md ${focusParts.includes(String(i)) ? 'bg-violet-100 ring-1 ring-violet-300' : ''}`}
                    >
                        <span className="text-slate-400 font-mono">{i + 1}</span>
                        <span className="font-mono text-slate-700 truncate" title={`${rule.principal} ${rule.method} ${rule.path}`}>
                            <b className="font-semibold">{rule.principal}</b> {rule.method} {rule.path}
                        </span>
                        <EffectBadge effect={rule.effect} rate={rule.rate} />
                        <span className="font-mono tabular-nums text-right text-slate-500">{hits?.rule_hits[i] ?? 0}</span>
                    </div>
                ))}
                <div className={`grid grid-cols-[1.25rem_1fr_auto_2.25rem] gap-x-1.5 items-center px-1.5 py-1 mt-0.5 border-t border-dashed border-slate-200 ${focusParts.includes('default') ? 'bg-violet-100 ring-1 ring-violet-300 rounded-md' : ''}`}>
                    <span />
                    <span className="italic text-slate-500">No rule matched</span>
                    <EffectBadge effect={defaultEffect} />
                    <span className="font-mono tabular-nums text-right text-slate-500">{hits?.default_hits ?? 0}</span>
                </div>
            </div>
        </div>
    );
});
