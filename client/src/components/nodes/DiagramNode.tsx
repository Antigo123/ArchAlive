import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useFocusParts } from '../../tutor/store';
import type { DiagramBlock, TreeBlockNode } from '../../tutor/scene';

const MARK = 'bg-amber-100 ring-1 ring-amber-300';

function TableBlock({ block, marked }: { block: Extract<DiagramBlock, { kind: 'table' }>; marked: string[] }) {
    return (
        <table className="w-full text-[11px] border-collapse">
            <thead>
                <tr>
                    {block.columns.map((c, i) => (
                        <th key={i} scope="col" className="text-left font-bold text-slate-500 px-2 py-1 border-b border-slate-200 whitespace-nowrap">{c}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {block.rows.map((row, i) => (
                    <tr key={i} className={marked.includes(String(i)) ? MARK : ''}>
                        {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1 border-b border-slate-100 font-mono text-slate-700">{cell}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function KvBlock({ block, marked }: { block: Extract<DiagramBlock, { kind: 'kv' }>; marked: string[] }) {
    return (
        <dl className="grid grid-cols-[auto_1fr] text-[11px]">
            {block.entries.map(entry => {
                const style = marked.includes(entry.key) ? MARK : '';
                return (
                    <div key={entry.key} className="contents">
                        <dt className={`font-mono font-bold text-slate-600 px-2 py-1 border-b border-slate-100 ${style}`}>{entry.key}</dt>
                        <dd className={`m-0 font-mono text-slate-700 px-2 py-1 border-b border-slate-100 break-all ${style}`}>{entry.value}</dd>
                    </div>
                );
            })}
        </dl>
    );
}

function TreeBranch({ node, marked }: { node: TreeBlockNode; marked: string[] }) {
    const children = node.children ?? [];
    return (
        <div className="flex flex-col items-center min-w-max">
            <div className={`px-2 py-1 rounded-md border text-[11px] font-mono whitespace-nowrap bg-white ${marked.includes(node.id) ? 'border-amber-400 bg-amber-100 font-bold' : 'border-slate-300 text-slate-700'}`}>
                {node.label}
            </div>
            {children.length > 0 && (
                <>
                    <div className="w-px h-3 bg-slate-300" />
                    <div className="flex items-start">
                        {children.map((child, i) => (
                            <div key={child.id} className="relative flex flex-col items-center px-1.5 pt-3">
                                {/* The horizontal bar joining siblings, and each child's stem. */}
                                {children.length > 1 && (
                                    <div className={`absolute top-0 h-px bg-slate-300 ${i === 0 ? 'left-1/2 right-0' : i === children.length - 1 ? 'left-0 right-1/2' : 'left-0 right-0'}`} />
                                )}
                                <div className="absolute top-0 left-1/2 w-px h-3 bg-slate-300" />
                                <TreeBranch node={child} marked={marked} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

const ACTOR_GAP = 150;
const ROW_HEIGHT = 40;

function SequenceBlock({ block, marked }: { block: Extract<DiagramBlock, { kind: 'sequence' }>; marked: string[] }) {
    const x = (actor: string) => ACTOR_GAP / 2 + block.actors.indexOf(actor) * ACTOR_GAP;
    const width = block.actors.length * ACTOR_GAP;
    const height = 34 + block.messages.length * ROW_HEIGHT + 8;
    return (
        <svg width={width} height={height} role="img" aria-label={`Sequence between ${block.actors.join(', ')}`} className="block">
            <defs>
                <marker id="seq-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 L8 4 L0 8 z" fill="#64748b" />
                </marker>
            </defs>
            {block.actors.map(actor => (
                <g key={actor}>
                    <line x1={x(actor)} x2={x(actor)} y1={26} y2={height} stroke="#cbd5e1" strokeDasharray="3 3" />
                    <text x={x(actor)} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155">{actor}</text>
                </g>
            ))}
            {block.messages.map((m, i) => {
                const y = 34 + i * ROW_HEIGHT + 20;
                const on = marked.includes(String(i));
                const self = m.from === m.to;
                const from = x(m.from);
                const to = self ? from + 40 : x(m.to) + (x(m.to) > from ? -2 : 2);
                return (
                    <g key={i}>
                        <text x={(from + to) / 2} y={y - 6} textAnchor="middle" fontSize={10} fontFamily="ui-monospace, monospace" fontWeight={on ? 700 : 400} fill={on ? '#b45309' : '#475569'}>
                            {`${i + 1}. ${m.label}`}
                        </text>
                        <line x1={from} x2={to} y1={y} y2={y} stroke={on ? '#d97706' : '#64748b'} strokeWidth={on ? 2 : 1.25} markerEnd="url(#seq-arrow)" />
                    </g>
                );
            })}
        </svg>
    );
}

/**
 * A static teaching card for things the simulator can't run, such as a data structure or a token
 * format. It takes no traffic. Lessons redraw it and mark its parts through step changes.
 */
export const DiagramNode = memo(function DiagramNode({ data, selected }: NodeProps) {
    const block = data.block as DiagramBlock | undefined;
    const marked = useFocusParts(data.alias);
    const label = data.label as string | undefined;

    return (
        <div className={`
            node-card-enhanced bg-white rounded-2xl shadow-md border transition-all duration-200 flex flex-col w-max max-w-[760px]
            ${selected ? 'border-amber-500 shadow-lg' : 'border-slate-200 hover:shadow-lg'}
        `}>
            {label && (
                <div className="px-3 py-2 border-b border-slate-100 text-xs font-bold text-slate-700">{label}</div>
            )}
            <div className="p-2">
                {block?.kind === 'text' && <p className="m-0 max-w-[260px] px-1 text-xs text-slate-700 whitespace-pre-wrap">{block.text}</p>}
                {block?.kind === 'table' && <TableBlock block={block} marked={marked} />}
                {block?.kind === 'kv' && <KvBlock block={block} marked={marked} />}
                {block?.kind === 'tree' && <div className="p-1"><TreeBranch node={block.root} marked={marked} /></div>}
                {block?.kind === 'sequence' && <SequenceBlock block={block} marked={marked} />}
            </div>
        </div>
    );
});
