import { useState, useEffect, useRef } from 'react';
import type { PuzzleState } from '../../puzzles/types';
import { useSimDataStore } from '../../stores/simDataStore';
import {
    Target, Trophy, Play, XCircle, ChevronDown, ChevronUp, LayoutTemplate, CheckCircle2
} from 'lucide-react';
import { TUTORIALS, TEMPLATES } from '../../puzzles/scenarios';


const stripEmoji = (str: string) => {
    // Basic regex to strip emojis and leading/trailing whitespace
    return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '').trim();
};

interface PuzzleHUDProps {
    gameState: PuzzleState;
    onStartLevel: (id: string) => void;
    onQuitLevel: () => void;
    completedPuzzles: string[];
    onToggleSelector: (open: boolean) => void;
}

export function PuzzleHUD({ gameState, onStartLevel, onQuitLevel, completedPuzzles, onToggleSelector }: PuzzleHUDProps) {
    const { currentPuzzle, status, holdProgress, metrics, currentTutorialStep } = gameState;
    const simNodes = useSimDataStore(s => s.nodes);
    const [tutorialsCollapsed, setTutorialsCollapsed] = useState(true);
    const [templatesCollapsed, setTemplatesCollapsed] = useState(true);

    const tutorialsRef = useRef<HTMLDivElement>(null);
    const templatesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (tutorialsCollapsed && templatesCollapsed) return;
        const handleOutside = (e: MouseEvent | TouchEvent) => {
            const target = (e instanceof TouchEvent ? e.touches[0]?.target : e.target) as Node;
            if (!tutorialsCollapsed && tutorialsRef.current && !tutorialsRef.current.contains(target)) {
                setTutorialsCollapsed(true);
            }
            if (!templatesCollapsed && templatesRef.current && !templatesRef.current.contains(target)) {
                setTemplatesCollapsed(true);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('touchstart', handleOutside);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('touchstart', handleOutside);
        };
    }, [tutorialsCollapsed, templatesCollapsed]);

    const [minimized, setMinimized] = useState(false);

    useEffect(() => {
        if (currentPuzzle?.id || status === 'won') {
            setMinimized(false);
        }
    }, [currentPuzzle?.id, status]);

    if (status === 'idle') {
        return (
            <div className="absolute top-2 left-2 md:left-1/2 md:-translate-x-1/2 z-[110] flex flex-row gap-2 md:gap-3 items-center w-auto max-w-[calc(100%-1rem)]">
                {/* Tutorials Menu */}
                <div className="relative" ref={tutorialsRef}>
                    <button
                        onClick={() => {
                            setTutorialsCollapsed(!tutorialsCollapsed);
                            if (tutorialsCollapsed) { setTemplatesCollapsed(true); onToggleSelector(false); }
                        }}
                        className={`group flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 max-[400px]:px-2.5 max-[400px]:py-1.5 rounded-full font-bold text-xs md:text-sm max-[400px]:text-[10px] transition-all duration-200 ${!tutorialsCollapsed
                            ? 'bg-white text-blue-600 shadow-md border border-blue-200 ring-1 ring-blue-100'
                            : 'bg-white/95 backdrop-blur-md text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-sm hover:text-blue-600 hover:shadow-md'
                            }`}
                    >
                        <Target size={16} className={`transition-transform ${!tutorialsCollapsed ? 'scale-110' : 'group-hover:scale-110'}`} />
                        <span>Tutorials</span>
                        {tutorialsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                    {!tutorialsCollapsed && (
                        <div className="absolute top-full left-0 md:left-1/2 md:-translate-x-1/2 mt-2 bg-white/95 backdrop-blur rounded-xl shadow-xl border border-slate-200 p-2 w-56 max-h-[60vh] overflow-y-auto">
                            {TUTORIALS.map(p => {
                                const isCompleted = completedPuzzles.includes(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => onStartLevel(p.id)}
                                        className={`w-full text-left p-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${isCompleted ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'hover:bg-slate-100 text-slate-700'}`}
                                    >
                                        {isCompleted ? <Trophy size={14} className="text-green-500" /> : <Play size={14} className="text-blue-500" />}
                                        {p.title}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Templates Menu */}
                <div className="relative" ref={templatesRef}>
                    <button
                        onClick={() => {
                            setTemplatesCollapsed(!templatesCollapsed);
                            if (templatesCollapsed) { setTutorialsCollapsed(true); onToggleSelector(false); }
                        }}
                        className={`group flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 max-[400px]:px-2.5 max-[400px]:py-1.5 rounded-full font-bold text-xs md:text-sm max-[400px]:text-[10px] transition-all duration-200 ${!templatesCollapsed
                            ? 'bg-white text-purple-600 shadow-md border border-purple-200 ring-1 ring-purple-100'
                            : 'bg-white/95 backdrop-blur-md text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-sm hover:text-purple-600 hover:shadow-md'
                            }`}
                    >
                        <LayoutTemplate size={16} className={`transition-transform ${!templatesCollapsed ? 'scale-110' : 'group-hover:scale-110'}`} />
                        <span>Templates</span>
                        {templatesCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                    {!templatesCollapsed && (
                        <div className="absolute top-full left-0 md:left-1/2 md:-translate-x-1/2 mt-2 bg-white/95 backdrop-blur rounded-xl shadow-xl border border-slate-200 p-2 w-56 max-h-[60vh] overflow-y-auto">
                            {TEMPLATES.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => onStartLevel(p.id)}
                                    className="w-full text-left p-2.5 hover:bg-purple-50 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-2 transition-colors"
                                >
                                    <LayoutTemplate size={14} className="text-purple-500" />
                                    {p.title.replace('Template: ', '')}
                                </button>
                            ))}
                        </div>
                    )}
                </div>


            </div>
        );
    }

    if (!currentPuzzle) return null;

    const tutorialSteps = currentPuzzle.tutorialSteps;
    const hasTutorial = tutorialSteps && tutorialSteps.length > 0;
    const hasObjectives = currentPuzzle.winConditions && currentPuzzle.winConditions.length > 0;
    const isTemplate = currentPuzzle.id.startsWith('template-');
    const isTutorial = currentPuzzle.id.startsWith('tutorial-');
    const currentStep = hasTutorial ? tutorialSteps[currentTutorialStep] : null;
    const tutorialComplete = hasTutorial && currentTutorialStep >= tutorialSteps.length;

    return (
        <div className="absolute top-2 md:top-4 left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 z-[110] flex flex-col gap-2 items-center">
            <div className={`
                bg-white shadow-2xl rounded-2xl border-2 overflow-hidden transition-colors duration-300
                ${status === 'won' ? 'border-green-400' : 'border-indigo-100'}
            `}>
                {/* Header */}
                <div className="bg-slate-50 p-3 max-[400px]:p-2 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h2 className="font-bold text-slate-800 max-[400px]:text-sm truncate max-w-[180px] sm:max-w-[240px] md:max-w-[400px]">
                            {isTemplate ? currentPuzzle.title.replace('Template: ', '') : currentPuzzle.title}
                        </h2>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        {(!isTemplate || hasObjectives || hasTutorial) && (
                            <button
                                onClick={() => setMinimized(m => !m)}
                                className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                                title={minimized ? 'Expand' : 'Minimize'}
                            >
                                {minimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </button>
                        )}
                        <button onClick={onQuitLevel} className="text-slate-400 hover:text-red-500 transition-colors p-0.5">
                            <XCircle size={18} />
                        </button>
                    </div>
                </div>

                {/* Body: steps + goals — stacked on mobile, side by side on desktop */}
                {!minimized && status !== 'won' && (hasTutorial || hasObjectives) && (
                    <div className="flex flex-col md:flex-row divide-y divide-slate-100 md:divide-y-0 md:divide-x">

                        {/* Tutorial Steps Section */}
                        {hasTutorial && (
                            <div className="relative overflow-hidden bg-white/40 backdrop-blur-md flex-1 min-w-48 max-[400px]:min-w-0">
                                {/* Progress Bar Header */}
                                <div className="h-1.5 w-full bg-slate-200/30 flex gap-0.5 px-0.5 pt-0.5">
                                    {tutorialSteps.map((_, idx) => (
                                        <div
                                            key={idx}
                                            className={`h-full flex-1 rounded-full transition-all duration-500 ${
                                                idx < currentTutorialStep
                                                    ? 'bg-green-500'
                                                    : idx === currentTutorialStep
                                                        ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]'
                                                        : 'bg-slate-300/50'
                                            }`}
                                        />
                                    ))}
                                </div>

                                <div className="p-3 max-[400px]:p-2">
                                    {currentStep && !tutorialComplete ? (
                                        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-[10px] font-black tracking-[0.1em] text-indigo-500/60">
                                                    Step {String(currentTutorialStep + 1).padStart(2, '0')}
                                                </span>
                                                <div className="h-px flex-1 bg-indigo-100/50" />
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-800 leading-tight mb-1">
                                                {stripEmoji(currentStep.title)}
                                            </h3>
                                            <p className="text-xs font-medium text-slate-500 leading-relaxed">
                                                {stripEmoji(currentStep.hint)}
                                            </p>
                                        </div>
                                    ) : tutorialComplete && (
                                        <div className="flex items-center gap-2 py-1 animate-in zoom-in-95 duration-500">
                                            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
                                                <CheckCircle2 size={16} />
                                            </div>
                                            <div className="text-xs font-bold text-green-700">
                                                All steps done! Waiting for goal...
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Objectives */}
                        {currentPuzzle.winConditions && currentPuzzle.winConditions.length > 0 && (
                            <div className="px-3 py-3 max-[400px]:px-2 max-[400px]:py-2 space-y-2.5 max-[400px]:space-y-1.5 bg-slate-50/50 flex-shrink-0 w-full md:w-40">
                                <div className="text-[10px] max-[400px]:text-[8px] font-black tracking-[0.1em] text-indigo-500/60 mb-1">Objectives</div>
                                {currentPuzzle.winConditions.map((cond, idx) => {
                                    const isMet = holdProgress > 0;

                                    let currentValue: number;
                                    let targetValue: number;
                                    let unit: string;

                                    switch (cond.metric) {
                                        case 'avg_latency':
                                            currentValue = metrics.currentLatency;
                                            targetValue = cond.value;
                                            unit = 's';
                                            break;
                                        case 'throughput':
                                        case 'total_processed':
                                            currentValue = metrics.currentThroughput;
                                            targetValue = cond.value;
                                            unit = '';
                                            break;
                                        case 'dropped_packets':
                                        case 'total_dropped':
                                            currentValue = metrics.currentDropped;
                                            targetValue = cond.value;
                                            unit = '';
                                            break;
                                        case 'node_type_processed':
                                            currentValue = Object.entries(simNodes)
                                                .filter(([id]) => cond.nodeType ? id.includes(cond.nodeType) : true)
                                                .reduce((sum, [, data]) => sum + (data.total_processed ?? 0), 0);
                                            targetValue = cond.value;
                                            unit = '';
                                            break;
                                        default:
                                            currentValue = 0;
                                            targetValue = cond.value;
                                            unit = '';
                                    }

                                    return (
                                        <div key={idx} className="space-y-1 max-[400px]:space-y-0.5">
                                            <div className="flex justify-between items-baseline text-[11px] max-[400px]:text-[9px] font-medium leading-none gap-1">
                                                <span className="text-slate-500">{cond.description}</span>
                                                <span className={`font-mono font-bold whitespace-nowrap flex-shrink-0 ${isMet ? 'text-green-600' : 'text-slate-700'}`}>
                                                    {unit ? `${currentValue.toFixed(1)}${unit}` : Math.floor(currentValue)}
                                                </span>
                                            </div>
                                            {/* Progress Bar */}
                                            <div className="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 ${isMet ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-blue-400'}`}
                                                    style={{
                                                        width: `${Math.min(100, cond.metric === 'avg_latency'
                                                            ? (holdProgress * 100)
                                                            : (currentValue / targetValue) * 100
                                                        )}%`
                                                    }}
                                                />
                                            </div>
                                            {cond.metric === 'avg_latency' && (
                                                <div className="text-[10px] text-right text-slate-400 font-mono">
                                                    {(holdProgress * (cond.holdDurationSeconds || 0)).toFixed(1)}s / {cond.holdDurationSeconds}s
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                    </div>
                )}

                {/* Victory Overlay */}
                {!minimized && status === 'won' && !isTemplate && (
                    <div className="bg-green-50 p-4 border-t border-green-100 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-center gap-3 mb-3">
                            <Trophy className="text-yellow-500" size={24} />
                            <span className="font-bold text-green-800">
                                {isTutorial ? 'Tutorial Complete!' : 'Scenario Complete!'}
                            </span>
                        </div>
                        {/* Next Button */}
                        {(() => {
                            const puzzleList = isTutorial ? TUTORIALS : TEMPLATES;
                            const currentIndex = puzzleList.findIndex((m) => m.id === currentPuzzle.id);
                            const nextPuzzle = currentIndex !== -1 ? puzzleList[currentIndex + 1] : undefined;

                            if (nextPuzzle) {
                                return (
                                    <button
                                        onClick={() => onStartLevel(nextPuzzle.id)}
                                        className="w-full mt-2 flex items-center justify-center gap-2 bg-white text-blue-600 font-bold py-2.5 px-4 rounded-xl shadow-sm border border-slate-200 ring-1 ring-slate-100 hover:text-blue-700 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] transition-all text-sm group"
                                    >
                                        <Play size={14} className="fill-current group-hover:scale-110 transition-transform" />
                                        Next: {nextPuzzle.title}
                                    </button>
                                );
                            }
                            return (
                                <div className="text-center text-green-700 text-sm">
                                    🎉 {isTutorial ? 'All tutorials complete!' : 'Scenario complete!'}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}
