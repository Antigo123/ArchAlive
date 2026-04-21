import { useState } from 'react';
import { BookOpen, ArrowRight, Layers, Info, ArrowLeft, Mail, Github } from 'lucide-react';

interface WelcomeModalProps {
    isOpen: boolean;
    onStartTutorial: () => void;
    onSkip: () => void;
}

const TECH_STACK = [
    { label: 'Rust / WASM', color: 'bg-orange-50 text-orange-600 border-orange-100' },
    { label: 'React', color: 'bg-sky-50 text-sky-600 border-sky-100' },
    { label: 'TypeScript', color: 'bg-blue-50 text-blue-600 border-blue-100' },
    { label: 'PixiJS', color: 'bg-pink-50 text-pink-600 border-pink-100' },
    { label: 'Vite', color: 'bg-violet-50 text-violet-600 border-violet-100' },
    { label: 'Tailwind', color: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
];

export function WelcomeModal({ isOpen, onStartTutorial, onSkip }: WelcomeModalProps) {
    const [showAbout, setShowAbout] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/10 backdrop-blur-[1px]">
            <div className="bg-white/90 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] max-w-[360px] w-full mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-500">

                {showAbout ? (
                    /* ============ ABOUT VIEW ============ */
                    <div className="px-8 pt-6 pb-7 flex flex-col">
                        {/* Back button */}
                        <button
                            onClick={() => setShowAbout(false)}
                            className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-slate-600 transition-colors mb-4 -ml-1 self-start"
                        >
                            <ArrowLeft size={14} />
                            Back
                        </button>

                        {/* Title */}
                        <h2 className="text-xl font-black tracking-tight text-slate-900 mb-2">
                            About ArchAlive
                        </h2>

                        {/* Description */}
                        <p className="text-[12.5px] leading-relaxed text-slate-500 mb-4">
                            A real-time, packet-level traffic simulator for distributed systems.
                            Design architectures with servers, load balancers, queues, caches, and
                            more - then watch requests flow through your system and observe
                            availability, latency, and throughput in real time.
                        </p>

                        {/* Divider */}
                        <div className="w-full h-px bg-slate-100 mb-3" />

                        {/* Tech Stack */}
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            Built With
                        </span>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {TECH_STACK.map(t => (
                                <span key={t.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${t.color}`}>
                                    {t.label}
                                </span>
                            ))}
                        </div>
                        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
                            Simulation engine compiled to WebAssembly runs off the main thread
                            via Web Workers. Packet animations are GPU-accelerated with PixiJS.
                        </p>

                        {/* Divider */}
                        <div className="w-full h-px bg-slate-100 my-3" />

                        {/* Feedback & Open Source */}
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            Feedback & Open Source
                        </span>
                        <div className="mt-2 flex flex-col gap-2">
                            <a
                                href="mailto:antigo1993@gmail.com"
                                className="flex items-center gap-2.5 group"
                            >
                                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                                    <Mail size={13} className="text-indigo-500" />
                                </div>
                                <span className="text-[12.5px] font-medium text-slate-600 group-hover:text-indigo-600 transition-colors">
                                    antigo1993@gmail.com
                                </span>
                            </a>
                            <a
                                href="https://github.com/Antigo123/ArchAlive"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2.5 group"
                            >
                                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-slate-100 flex items-center justify-center transition-colors">
                                    <Github size={13} className="text-slate-600 group-hover:text-slate-900" />
                                </div>
                                <span className="text-[12.5px] font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                                    github.com/Antigo123/ArchAlive
                                </span>
                            </a>
                        </div>
                    </div>
                ) : (
                    /* ============ MAIN VIEW ============ */
                    <div className="px-8 pt-8 pb-7 flex flex-col items-center text-center">

                        {/* Title */}
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-2">
                            ArchAlive
                        </h1>

                        {/* Tagline */}
                        <p className="text-[13px] text-slate-500 leading-relaxed mb-4 max-w-[260px]">
                            Real-time packet-level traffic modeling for distributed systems.
                        </p>

                        {/* Divider */}
                        <div className="w-full h-px bg-slate-100 mb-4" />

                        {/* Buttons */}
                        <div className="w-full flex flex-col gap-3">

                            {/* Primary CTA */}
                            <button
                                onClick={onStartTutorial}
                                className="w-full group relative flex items-center gap-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-2xl px-5 py-4 text-left transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300"
                            >
                                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                                    <BookOpen size={17} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold leading-tight">Start Tutorial</div>
                                    <div className="text-[11px] text-indigo-200 mt-0.5">Learn the basics step by step</div>
                                </div>
                                <ArrowRight size={15} className="flex-shrink-0 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                            </button>

                            {/* Secondary CTA */}
                            <button
                                onClick={onSkip}
                                className="w-full group relative flex items-center gap-4 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] text-slate-700 rounded-2xl px-5 py-4 text-left transition-all border border-slate-200"
                            >
                                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-500">
                                    <Layers size={17} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold leading-tight">Open Sandbox</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">Free-build with no constraints</div>
                                </div>
                                <ArrowRight size={15} className="flex-shrink-0 opacity-30 group-hover:opacity-60 group-hover:translate-x-0.5 transition-all" />
                            </button>

                        </div>

                        {/* About Link */}
                        <button
                            onClick={() => setShowAbout(true)}
                            className="mt-4 flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400 hover:text-indigo-500 transition-colors"
                        >
                            <Info size={13} />
                            About this project
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
