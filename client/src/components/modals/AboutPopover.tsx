import { useState, useRef, useEffect } from 'react';
import { Info, Mail, X, Github } from 'lucide-react';

export function AboutPopover() {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as HTMLElement)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    return (
        <div className="relative z-[150]" ref={popoverRef}>
            {/* Popover */}
            {isOpen && (
                <div className="absolute bottom-12 right-0 w-72 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_16px_48px_-8px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {/* Header */}
                    <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                        <h3 className="text-base font-black tracking-tight text-slate-900">
                            ArchAlive
                        </h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 text-slate-300 hover:text-slate-500 transition-colors rounded-lg hover:bg-slate-100"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="mx-5 h-px bg-slate-100" />

                    {/* Body */}
                    <div className="px-5 py-4">
                        <p className="text-[12.5px] leading-relaxed text-slate-500">
                            A real-time, packet-level traffic simulator for distributed systems.
                            Design architectures with servers, load balancers, queues, caches, and
                            more - then watch requests flow through your system and observe
                            availability, latency, and throughput in real time.
                        </p>
                    </div>

                    {/* Divider */}
                    <div className="mx-5 h-px bg-slate-100" />

                    {/* Tech Stack */}
                    <div className="px-5 py-3">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            Built With
                        </span>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {[
                                { label: 'Rust / WASM', color: 'bg-orange-50 text-orange-600 border-orange-100' },
                                { label: 'React', color: 'bg-sky-50 text-sky-600 border-sky-100' },
                                { label: 'TypeScript', color: 'bg-blue-50 text-blue-600 border-blue-100' },
                                { label: 'PixiJS', color: 'bg-pink-50 text-pink-600 border-pink-100' },
                                { label: 'Vite', color: 'bg-violet-50 text-violet-600 border-violet-100' },
                                { label: 'Tailwind', color: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
                            ].map(t => (
                                <span key={t.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${t.color}`}>
                                    {t.label}
                                </span>
                            ))}
                        </div>
                        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
                            Simulation engine compiled to WebAssembly runs off the main thread
                            via Web Workers. Packet animations are GPU-accelerated with PixiJS.
                        </p>
                    </div>

                    {/* Divider */}
                    <div className="mx-5 h-px bg-slate-100" />

                    {/* Feedback & Open Source */}
                    <div className="px-5 py-4">
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
                </div>
            )}

            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(o => !o)}
                className={`flex items-center justify-center w-9 h-9 rounded-full shadow-lg border transition-all duration-200 ${
                    isOpen
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-indigo-100'
                        : 'bg-white/95 backdrop-blur-sm text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600 hover:shadow-md'
                }`}
                title="About ArchAlive"
            >
                <Info size={16} />
            </button>
        </div>
    );
}
