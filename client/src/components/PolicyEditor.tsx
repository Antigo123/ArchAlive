import type { Node } from '@xyflow/react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { DiagramBlock, PolicyRule } from '../tutor/scene';

interface EditorProps {
    node: Node;
    onUpdateNode: (id: string, updates: Record<string, unknown>) => void;
}

const METHODS = ['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const FIELD = 'bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-md px-1.5 py-1 focus:outline-none focus:border-violet-400 transition-all';

/** Edits a policy's rule table, so a learner can test their own ideas against live traffic. */
export function PolicyEditor({ node, onUpdateNode }: EditorProps) {
    const rules = (node.data.rules as PolicyRule[] | undefined) ?? [];
    const defaultEffect = (node.data.default_effect as string | undefined) ?? 'deny';
    const defaultStatus = (node.data.default_status as number | undefined) ?? 0;

    const commit = (next: PolicyRule[], effect = defaultEffect) =>
        onUpdateNode(node.id, { rules: next, default_effect: effect, default_status: defaultStatus });

    const edit = (i: number, patch: Partial<PolicyRule>) =>
        commit(rules.map((r, j) => {
            if (j !== i) return r;
            const merged = { ...r, ...patch };
            // A limit rule with no rate would reject everything, which isn't what "limit" suggests.
            return merged.effect === 'limit' && !merged.rate ? { ...merged, rate: 2 } : merged;
        }));

    const move = (i: number, by: number) => {
        const next = [...rules];
        const [rule] = next.splice(i, 1);
        next.splice(i + by, 0, rule);
        commit(next);
    };

    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-500">Requests are checked from the top, and the first matching rule decides.</p>

            <div className="space-y-2">
                {rules.map((rule, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-2 space-y-1.5 shadow-sm">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-400 w-3">{i + 1}</span>
                            <select
                                aria-label={`Rule ${i + 1} effect`}
                                value={rule.effect}
                                onChange={e => edit(i, { effect: e.target.value as PolicyRule['effect'] })}
                                className={`${FIELD} font-bold flex-1`}
                            >
                                <option value="allow">Allow</option>
                                <option value="deny">Deny</option>
                                <option value="limit">Rate limit</option>
                            </select>
                            {rule.effect === 'limit' && (
                                <label className="flex items-center gap-1 text-[10px] text-slate-500 whitespace-nowrap">
                                    <input
                                        type="number"
                                        min="0.1"
                                        step="0.5"
                                        aria-label={`Rule ${i + 1} requests per second`}
                                        value={rule.rate ?? 2}
                                        onChange={e => edit(i, { rate: parseFloat(e.target.value) || 0.1 })}
                                        className={`${FIELD} w-12 font-mono`}
                                    />
                                    /s
                                </label>
                            )}
                            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move rule ${i + 1} up`} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={13} /></button>
                            <button onClick={() => move(i, 1)} disabled={i === rules.length - 1} aria-label={`Move rule ${i + 1} down`} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={13} /></button>
                            <button onClick={() => commit(rules.filter((_, j) => j !== i))} aria-label={`Delete rule ${i + 1}`} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <input aria-label={`Rule ${i + 1} principal`} value={rule.principal} placeholder="who, or *" onChange={e => edit(i, { principal: e.target.value })} className={`${FIELD} w-20 min-w-0 font-mono`} />
                            <select aria-label={`Rule ${i + 1} method`} value={rule.method} onChange={e => edit(i, { method: e.target.value })} className={`${FIELD} font-mono`}>
                                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <input aria-label={`Rule ${i + 1} path`} value={rule.path} placeholder="/path, /prefix/*, *" onChange={e => edit(i, { path: e.target.value })} className={`${FIELD} flex-1 min-w-0 font-mono`} />
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={() => commit([...rules, { principal: '*', method: '*', path: '*', effect: 'deny' }])}
                className="w-full px-3 py-1.5 text-[11px] font-semibold rounded-lg text-violet-700 bg-violet-50 border border-violet-100 hover:bg-violet-100 transition-colors"
            >
                Add rule
            </button>

            <label className="flex items-center justify-between gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                If no rule matches
                <select
                    value={defaultEffect}
                    onChange={e => commit(rules, e.target.value)}
                    className={`${FIELD} font-bold normal-case tracking-normal`}
                >
                    <option value="deny">Deny</option>
                    <option value="allow">Allow</option>
                </select>
            </label>
        </div>
    );
}

export function DiagramEditor({ node, onUpdateNode }: EditorProps) {
    const block = node.data.block as DiagramBlock | undefined;
    if (block?.kind !== 'text') {
        return <p className="text-xs text-slate-500">Ask the tutor to change this diagram.</p>;
    }
    return (
        <textarea
            aria-label="Note text"
            rows={5}
            value={block.text}
            onChange={e => onUpdateNode(node.id, { block: { kind: 'text', text: e.target.value } })}
            className={`${FIELD} w-full resize-y`}
        />
    );
}
