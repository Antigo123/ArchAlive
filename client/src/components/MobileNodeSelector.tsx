import { useRef, useState, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { NODE_TYPES_CONFIG } from './node-types';

interface MobileNodeSelectorProps {
    onClear: () => void;
    hide?: boolean;
    isOpen: boolean;
    onToggle: (open: boolean) => void;
    onDragDrop: (type: string, screenX: number, screenY: number) => void;
}

interface DragState {
    type: string;
    startX: number;
    startY: number;
    isDragging: boolean;
}

interface GhostPos {
    x: number;
    y: number;
    type: string;
}

export function MobileNodeSelector({ hide, isOpen, onToggle, onDragDrop, onClear }: MobileNodeSelectorProps) {
    const dragRef = useRef<DragState | null>(null);
    const [ghostPos, setGhostPos] = useState<GhostPos | null>(null);

    const handlePointerDown = useCallback((type: string, e: React.PointerEvent<HTMLButtonElement>) => {
        // Capture the pointer so pointermove/pointerup keep firing on this element
        // even after the cursor/finger leaves it — essential for drag-to-canvas.
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
            type,
            startX: e.clientX,
            startY: e.clientY,
            isDragging: false,
        };
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;

        if (!dragRef.current.isDragging && Math.hypot(dx, dy) > 8) {
            dragRef.current.isDragging = true;
            onToggle(false); // close the popup while dragging
        }

        if (dragRef.current.isDragging) {
            setGhostPos({ x: e.clientX, y: e.clientY, type: dragRef.current.type });
        }
    }, [onToggle]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current) return;
        if (dragRef.current.isDragging) {
            onDragDrop(dragRef.current.type, e.clientX, e.clientY);
        } else {
            // Short click/tap without drag — close the menu
            onToggle(false);
        }
        dragRef.current = null;
        setGhostPos(null);
    }, [onDragDrop, onToggle]);

    const handlePointerCancel = useCallback(() => {
        dragRef.current = null;
        setGhostPos(null);
    }, []);

    // Only unmount when hidden AND no drag is in progress
    if (hide && !ghostPos) return null;

    const ghostConfig = ghostPos ? NODE_TYPES_CONFIG.find(n => n.type === ghostPos.type) : null;

    return (
        <>
            {/* Sheet Overlay — captures taps outside to close */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[290] bg-slate-900/10 backdrop-blur-[2px]"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(false);
                    }}
                />
            )}

            {/* Compact Node Menu — sits just above the FAB */}
            <div
                onClick={(e) => e.stopPropagation()}
                className={`
                    fixed bottom-16 left-4 right-4 max-w-sm mx-auto bg-white/95 backdrop-blur-md rounded-3xl max-[400px]:rounded-2xl shadow-2xl p-4 max-[400px]:p-3 z-[300] transition-all duration-300 transform origin-bottom
                    ${isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4 pointer-events-none'}
                    border border-slate-200/60
                `}
            >
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
                    Drag to place
                </p>
                <div className="grid grid-cols-4 gap-3 max-[400px]:gap-2">
                    {NODE_TYPES_CONFIG.map((item) => (
                        <button
                            key={item.type}
                            type="button"
                            className="relative flex flex-col items-center justify-center gap-2 max-[400px]:gap-1 p-2 max-[400px]:p-1.5 rounded-2xl max-[400px]:rounded-xl bg-white border border-slate-100/80 active:bg-slate-50 active:scale-95 transition-all touch-none select-none"
                            onPointerDown={(e) => handlePointerDown(item.type, e)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerCancel}
                        >
                            <div className={`p-2 max-[400px]:p-1.5 rounded-xl max-[400px]:rounded-lg bg-slate-50/50 shadow-sm border border-slate-100 ${item.color}`}>
                                <item.icon size={20} className="max-[400px]:w-4 max-[400px]:h-4" />
                            </div>
                            <span className="text-[10px] max-[400px]:text-[8px] font-bold text-slate-600 text-center leading-tight">
                                {item.label.split(' ')[0]}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Clean All Components — Mobile Action */}
                <div className="pt-4 mt-3 border-t border-slate-100 flex justify-center">
                    <button
                        onClick={() => {
                            if (window.confirm("Clean all components from canvas?")) {
                                onClear();
                                onToggle(false);
                            }
                        }}
                        className="flex items-center gap-2 px-6 py-2.5 max-[400px]:px-4 max-[400px]:py-2 rounded-full bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-all text-xs max-[400px]:text-[10px] font-bold active:scale-95 shadow-sm"
                    >
                        <Trash2 size={16} className="max-[400px]:w-3.5 max-[400px]:h-3.5" />
                        <span>Clean All Components</span>
                    </button>
                </div>
            </div>

            {/* Drag Ghost — follows the finger while dragging */}
            {ghostPos && ghostConfig && (
                <div
                    className="fixed pointer-events-none z-[400]"
                    style={{
                        left: ghostPos.x,
                        top: ghostPos.y,
                        transform: 'translate(-50%, -110%)',
                    }}
                >
                    <div className={`flex flex-col items-center gap-1.5 px-4 py-3 bg-white rounded-2xl shadow-2xl border-2 border-blue-400 ring-4 ring-blue-400/20`}>
                        <div className={`p-2 rounded-xl bg-slate-50 border border-slate-100 ${ghostConfig.color}`}>
                            <ghostConfig.icon size={22} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{ghostConfig.label}</span>
                    </div>
                    {/* Drop indicator arrow */}
                    <div className="flex justify-center mt-0.5">
                        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent border-t-blue-400" />
                    </div>
                </div>
            )}
        </>
    );
}
