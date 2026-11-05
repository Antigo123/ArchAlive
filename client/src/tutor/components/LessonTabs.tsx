import { GraduationCap, LayoutDashboard, Plus, X } from 'lucide-react';
import { closeTab, openLessonTab, switchTab } from '../controller';
import { DESIGN_TAB_ID, useTutorStore } from '../store';

export function LessonTabs() {
    const tabs = useTutorStore(s => s.tabs);
    const activeTabId = useTutorStore(s => s.activeTabId);
    const running = useTutorStore(s => s.running);
    const panelOpen = useTutorStore(s => s.panelOpen);
    const set = useTutorStore(s => s.set);
    const lockedHint = running ? 'The tutor is working on this lesson' : undefined;

    return (
        <nav aria-label="Lessons" className="flex items-stretch gap-1 h-10 flex-shrink-0 bg-slate-100 border-b border-slate-200 px-2 pt-1.5 relative z-[160]">
            <div role="tablist" className="flex items-stretch gap-1 min-w-0 overflow-x-auto flex-1">
                {tabs.map(tab => {
                    const active = tab.id === activeTabId;
                    const isDesign = tab.id === DESIGN_TAB_ID;
                    return (
                        <div
                            key={tab.id}
                            className={`group flex items-center gap-1 min-w-0 max-w-[200px] rounded-t-lg text-xs font-semibold transition-colors flex-shrink-0 ${active
                                ? 'bg-white text-slate-800 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]'
                                : 'text-slate-500 hover:bg-slate-200/70'}`}
                        >
                            <button
                                role="tab"
                                aria-selected={active}
                                onClick={() => switchTab(tab.id)}
                                disabled={running && !active}
                                title={lockedHint ?? tab.title}
                                className={`flex items-center gap-1.5 min-w-0 pl-3 h-full disabled:cursor-not-allowed ${isDesign ? 'pr-3' : 'pr-1'}`}
                            >
                                {isDesign
                                    ? <LayoutDashboard size={13} className="flex-shrink-0" />
                                    : <GraduationCap size={13} className={`flex-shrink-0 ${active ? 'text-indigo-600' : ''}`} />}
                                <span className="truncate">{tab.title}</span>
                            </button>
                            {!isDesign && (
                                <button
                                    onClick={() => closeTab(tab.id)}
                                    disabled={running}
                                    aria-label={`Close ${tab.title}`}
                                    title={lockedHint ?? 'Close lesson'}
                                    className="p-0.5 mr-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            <button
                onClick={() => {
                    if (running) return;
                    openLessonTab('New lesson');
                    set({ panelOpen: true });
                }}
                disabled={running}
                title={lockedHint ?? 'New lesson'}
                aria-label="New lesson"
                className="flex items-center self-center p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed flex-shrink-0"
            >
                <Plus size={15} />
            </button>
            {!panelOpen && (
                <button
                    onClick={() => set({ panelOpen: true })}
                    className="flex items-center self-center gap-1.5 px-2.5 py-1 ml-1 rounded-md text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex-shrink-0 transition-colors"
                >
                    <GraduationCap size={13} />
                    Tutor
                </button>
            )}
        </nav>
    );
}
