import { useEffect, useRef, useState } from 'react';
import { GraduationCap, KeyRound, Loader2, PlayCircle, SendHorizontal, Square, X } from 'lucide-react';
import { Markdown } from './Markdown';
import { checkTutorStatus, sendMessage, stopTutor } from '../agent';
import { startDemoLesson } from '../controller';
import { DESIGN_TAB_ID, useActiveTab, useTutorStore } from '../store';

const STARTERS = [
    'Teach me what an ACL is',
    'How does rate limiting work?',
    'What does a B-tree index actually do?',
    'Why would I put a queue between two services?',
    'What is inside a JWT?',
];

function SetupNotice() {
    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold"><KeyRound size={13} /> Add an API key to ask anything</div>
            <p>Put <code className="font-mono bg-amber-100 rounded px-1">ANTHROPIC_API_KEY=…</code> in <code className="font-mono bg-amber-100 rounded px-1">client/.env.local</code> and restart <code className="font-mono bg-amber-100 rounded px-1">npm run dev</code>. The built-in lesson works without one.</p>
        </div>
    );
}

function EmptyState() {
    const configured = useTutorStore(s => s.configured);
    const inLesson = useActiveTab().lesson !== null;

    if (inLesson) {
        return (
            <div className="flex flex-col gap-3 p-4">
                <p className="text-sm text-slate-500">
                    Work through the steps on the canvas. Click any node to change it and see what happens, or ask here if something doesn't make sense.
                </p>
                {configured === false && <SetupNotice />}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h2 className="text-base font-bold text-slate-800">What do you want to understand?</h2>
                <p className="text-sm text-slate-500 mt-1">Ask about any backend concept. You'll get a working system to predict and watch.</p>
            </div>
            {configured === false && <SetupNotice />}
            <div className="flex flex-col gap-1.5">
                {configured !== false && STARTERS.map(starter => (
                    <button
                        key={starter}
                        onClick={() => sendMessage(starter)}
                        className="text-left text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                    >
                        {starter}
                    </button>
                ))}
                <button
                    onClick={startDemoLesson}
                    className="flex items-center gap-2 text-left text-sm px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                >
                    <PlayCircle size={15} className="flex-shrink-0" />
                    Try the built-in ACL lesson
                </button>
            </div>
        </div>
    );
}

export function TutorPanel() {
    const tab = useActiveTab();
    const running = useTutorStore(s => s.running);
    const liveText = useTutorStore(s => s.liveText);
    const status = useTutorStore(s => s.status);
    const panelOpen = useTutorStore(s => s.panelOpen);
    const storageFull = useTutorStore(s => s.storageFull);
    const configured = useTutorStore(s => s.configured);
    const set = useTutorStore(s => s.set);
    const [draft, setDraft] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { checkTutorStatus(); }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [tab.id, tab.chat.length, liveText, status]);

    const submit = () => {
        if (!draft.trim() || running) return;
        sendMessage(draft);
        setDraft('');
        inputRef.current?.focus();
    };

    const isEmpty = tab.chat.length === 0 && !running;
    const onDesign = tab.id === DESIGN_TAB_ID;

    if (!panelOpen) return null;

    return (
        <aside
            data-tutor-panel
            aria-label="Tutor"
            className="fixed inset-0 z-[320] md:static md:z-auto md:w-[380px] md:flex-shrink-0 flex flex-col bg-white md:border-l border-slate-200 min-h-0"
        >
            <header className="flex items-center gap-2 px-4 h-12 border-b border-slate-100 flex-shrink-0">
                <GraduationCap size={17} className="text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-700 truncate flex-1">Tutor</h2>
                <button
                    onClick={() => set({ panelOpen: false })}
                    aria-label="Close tutor"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                    <X size={16} />
                </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                {isEmpty ? <EmptyState /> : (
                    <div className="flex flex-col gap-3 p-4">
                        {tab.chat.map(item => (
                            item.role === 'user' ? (
                                <div key={item.id} className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 text-white text-sm px-3 py-2 whitespace-pre-wrap break-words">
                                    {item.text}
                                </div>
                            ) : item.role === 'error' ? (
                                <div key={item.id} role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">
                                    <Markdown>{item.text}</Markdown>
                                </div>
                            ) : (
                                <div key={item.id} className="text-sm text-slate-700"><Markdown>{item.text}</Markdown></div>
                            )
                        ))}
                        {liveText && <div className="text-sm text-slate-700"><Markdown>{liveText}</Markdown></div>}
                        {running && (
                            <div role="status" className="flex items-start gap-2 text-xs text-slate-500">
                                <Loader2 size={13} className="animate-spin flex-shrink-0 mt-0.5" />
                                <span>{status ?? 'Thinking'}</span>
                            </div>
                        )}
                        {!running && configured === false && <SetupNotice />}
                    </div>
                )}
            </div>

            {storageFull && (
                <p className="px-4 py-1.5 text-[11px] text-amber-800 bg-amber-50 border-t border-amber-100">
                    Browser storage is full, so recent lesson changes won't be saved. Close old lesson tabs to free space.
                </p>
            )}

            <form
                className="flex items-end gap-2 p-3 border-t border-slate-100 flex-shrink-0"
                onSubmit={e => { e.preventDefault(); submit(); }}
            >
                <textarea
                    ref={inputRef}
                    rows={2}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    aria-label="Ask the tutor"
                    placeholder={onDesign ? 'Ask about a concept to start a lesson' : 'Ask about what you see'}
                    className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                />
                {running ? (
                    <button
                        type="button"
                        onClick={stopTutor}
                        aria-label="Stop"
                        className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        <Square size={16} className="fill-current" />
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!draft.trim()}
                        aria-label="Send"
                        className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                    >
                        <SendHorizontal size={16} />
                    </button>
                )}
            </form>
        </aside>
    );
}
