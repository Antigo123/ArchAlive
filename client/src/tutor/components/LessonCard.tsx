import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, XCircle } from 'lucide-react';
import { Markdown } from './Markdown';
import { sendMessage } from '../agent';
import { answerPrediction, getBridge, nextStep, previousStep, refitCanvas } from '../controller';
import { longestRouteHops } from '../scene';
import { useActiveTab, useTutorStore } from '../store';
import { useSimDataStore } from '../../stores/simDataStore';

/** A request crosses an edge in about 2.2 seconds, each way. */
const SECONDS_PER_ROUND_TRIP_HOP = 4.5;
const MAX_WATCH_SECONDS = 20;

/** Long enough for a full round trip, so successes show up alongside any rejections. */
function watchSeconds(nodes: Parameters<typeof longestRouteHops>[0], edges: Parameters<typeof longestRouteHops>[1]) {
    return Math.min(MAX_WATCH_SECONDS, Math.ceil(longestRouteHops(nodes, edges) * SECONDS_PER_ROUND_TRIP_HOP) + 2);
}

const statusStyle = (status: number) =>
    status === 200 ? 'bg-green-100 text-green-800'
        : status === 429 ? 'bg-amber-100 text-amber-800'
            : 'bg-red-100 text-red-800';

/** Live per-person request counts: the evidence the learner checks their prediction against. */
function ObservedTraffic() {
    const outcomes = useSimDataStore(s => s.outcomes);
    const principals = [...new Set(outcomes.map(o => o.principal))];

    if (principals.length === 0) {
        return <p className="text-xs text-slate-400">Requests are on their way…</p>;
    }
    return (
        <table className="w-full text-xs" aria-label="Requests by outcome">
            <tbody>
                {principals.map(principal => (
                    <tr key={principal}>
                        <th scope="row" className="py-0.5 pr-3 text-left font-semibold text-slate-600 whitespace-nowrap w-px">
                            {principal || 'All requests'}
                        </th>
                        <td className="py-0.5">
                            <div className="flex flex-wrap gap-1">
                                {outcomes.filter(o => o.principal === principal).map(o => (
                                    <span key={o.status} className={`rounded px-1.5 py-0.5 font-mono font-bold tabular-nums ${statusStyle(o.status)}`}>
                                        {o.status} × {o.count}
                                    </span>
                                ))}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** `dodgeInspector`: the node inspector is open over the canvas's right side. */
export function LessonCard({ dodgeInspector }: { dodgeInspector: boolean }) {
    const tab = useActiveTab();
    const running = useTutorStore(s => s.running);
    const [collapsed, setCollapsed] = useState(false);
    const lesson = tab.lesson;
    const index = tab.stepIndex;
    const step = lesson?.steps[index];
    const answer = tab.answers[index];
    const hasTraffic = tab.canvas.nodes.some(n => n.type === 'client');

    // The countdown belongs to the step it started on, so leaving the step cancels it. Answers
    // given earlier (before a reload or tab switch) don't need to be watched again.
    const stepKey = `${tab.id}:${index}`;
    const [watch, setWatch] = useState({ stepKey: '', remaining: 0 });
    const remaining = watch.stepKey === stepKey ? watch.remaining : 0;

    useEffect(() => {
        if (remaining <= 0) return;
        const timer = setTimeout(() => setWatch(w => ({ ...w, remaining: w.remaining - 1 })), 1000);
        return () => clearTimeout(timer);
    }, [remaining]);

    // Keep the diagram visible above the card, however tall this step makes it.
    const cardRef = useRef<HTMLElement>(null);
    const hasCard = Boolean(lesson && step);
    useEffect(() => {
        const card = cardRef.current;
        if (!card || !hasCard) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => refitCanvas(card.offsetHeight + 84), 120);
        });
        observer.observe(card);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [hasCard, tab.id]);

    if (!lesson || !step) return null;

    const predict = step.predict;
    const answered = answer !== undefined;
    const revealed = answered && remaining <= 0;
    const isLast = index === lesson.steps.length - 1;
    const correct = answered && predict?.options[answer]?.correct === true;

    const onAnswer = (option: number) => {
        answerPrediction(option);
        const { nodes, edges } = getBridge().getCanvas();
        setWatch({ stepKey, remaining: hasTraffic ? watchSeconds(nodes, edges) : 0 });
    };

    return (
        <section
            ref={cardRef}
            data-lesson-card
            aria-label={`Lesson: ${lesson.title}`}
            className={`absolute bottom-16 z-[140] max-h-[42%] flex flex-col bg-white/98 backdrop-blur rounded-2xl shadow-xl border border-slate-200 ${dodgeInspector
                ? 'left-4 w-[min(520px,calc(100%-30rem))] min-w-[320px]'
                : 'left-1/2 -translate-x-1/2 w-[min(560px,calc(100%-1.5rem))]'}`}
        >
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 whitespace-nowrap">
                    Step {index + 1} of {lesson.steps.length}
                </span>
                <h3 className="text-sm font-bold text-slate-800 truncate flex-1">{step.title}</h3>
                <button
                    onClick={() => setCollapsed(c => !c)}
                    aria-label={collapsed ? 'Expand step' : 'Collapse step'}
                    aria-expanded={!collapsed}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                    {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
            </div>

            {!collapsed && (
                <>
                    <div className="px-4 pb-3 overflow-y-auto min-h-0 flex flex-col gap-3 text-sm text-slate-700">
                        <Markdown>{step.body}</Markdown>

                        {predict && (
                            <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-3 flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                                    <Eye size={12} /> {answered ? 'Your prediction' : 'Predict before you watch'}
                                </div>
                                <div className="font-semibold text-slate-800"><Markdown>{predict.question}</Markdown></div>
                                <div className="flex flex-col gap-1.5" role="group" aria-label="Options">
                                    {predict.options.map((option, i) => {
                                        const chosen = answer === i;
                                        // Once revealed, only your pick and the right answer still matter.
                                        if (revealed && !chosen && !option.correct) return null;
                                        const style = !answered
                                            ? 'border-slate-200 bg-white hover:border-indigo-400 hover:bg-white cursor-pointer'
                                            : revealed && option.correct
                                                ? 'border-green-400 bg-green-50'
                                                : revealed && chosen
                                                    ? 'border-red-300 bg-red-50'
                                                    : chosen
                                                        ? 'border-indigo-400 bg-white'
                                                        : 'border-slate-200 bg-white/60 text-slate-500';
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => onAnswer(i)}
                                                disabled={answered}
                                                aria-pressed={chosen}
                                                className={`flex items-start gap-2 text-left text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:cursor-default ${style}`}
                                            >
                                                {revealed && option.correct && <CheckCircle2 size={15} className="text-green-600 flex-shrink-0 mt-0.5" />}
                                                {revealed && chosen && !option.correct && <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />}
                                                <span className="min-w-0"><Markdown>{option.text}</Markdown></span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {!answered && <p className="text-xs text-slate-500">Traffic is paused until you choose.</p>}
                            </div>
                        )}

                        {answered && hasTraffic && (
                            <div className="flex flex-col gap-1.5">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">What actually happened</div>
                                <ObservedTraffic />
                            </div>
                        )}

                        {answered && !revealed && (
                            <button
                                onClick={() => setWatch({ stepKey, remaining: 0 })}
                                className="self-start text-xs font-semibold text-indigo-700 hover:underline"
                            >
                                Watch for {remaining}s, or show the explanation now
                            </button>
                        )}

                        {revealed && predict && (
                            <div className={`rounded-xl border p-3 ${correct ? 'border-green-200 bg-green-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                                <div className="text-xs font-bold mb-1">{correct ? 'You called it.' : 'Not quite.'}</div>
                                <Markdown>{predict.explanation}</Markdown>
                            </div>
                        )}

                        {isLast && (!predict || revealed) && !!lesson.follow_ups?.length && (
                            <div className="flex flex-col gap-1.5">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Keep going</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {lesson.follow_ups.map(question => (
                                        <button
                                            key={question}
                                            disabled={running}
                                            onClick={() => sendMessage(question)}
                                            className="text-xs text-left px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50 transition-colors"
                                        >
                                            {question}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-slate-100 flex-shrink-0">
                        <button
                            onClick={previousStep}
                            disabled={index === 0}
                            className="flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent transition-colors"
                        >
                            <ChevronLeft size={14} /> Back
                        </button>
                        <div className="flex gap-1" aria-hidden="true">
                            {lesson.steps.map((_, i) => (
                                <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === index ? 'bg-indigo-600' : i < index ? 'bg-indigo-300' : 'bg-slate-200'}`} />
                            ))}
                        </div>
                        <button
                            onClick={nextStep}
                            disabled={isLast || (Boolean(predict) && !revealed)}
                            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 transition-colors"
                        >
                            Next <ChevronRight size={14} />
                        </button>
                    </div>
                </>
            )}
        </section>
    );
}
