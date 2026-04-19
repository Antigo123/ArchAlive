import { useCallback } from 'react';

interface ContextMenuProps {
    id: string;
    top: number;
    left: number;
    right?: number;
    bottom?: number;
    onClose: () => void;
    onCopy: (id: string) => void;
    onCut: (id: string) => void;
    onDelete: (id: string) => void;
    onPaste?: () => void;
    isPaneMenu?: boolean;
    isEdge?: boolean;
    hasClipboard?: boolean;
    onClear?: () => void;
}

export function ContextMenu({ id, top, left, right, bottom, onClose, onCopy, onCut, onDelete, onPaste, isPaneMenu, isEdge, hasClipboard, onClear }: ContextMenuProps) {

    // Delete Logic (Default or Custom)
    const handleDelete = useCallback(() => {
        onDelete(id);
        onClose();
    }, [id, onDelete, onClose]);

    const handleCopy = useCallback(() => {
        onCopy(id);
        onClose();
    }, [id, onCopy, onClose]);

    const handleCut = useCallback(() => {
        onCut(id);
        onClose();
    }, [id, onCut, onClose]);

    const handlePaste = useCallback(() => {
        if (onPaste) onPaste();
        onClose();
    }, [onPaste, onClose]);

    // Pane menu - only show paste
    if (isPaneMenu) {
        return (
            <div
                style={{ top, left, right, bottom }}
                className="fixed z-[9999] bg-white border border-slate-200 shadow-lg rounded-md py-1 min-w-[120px]"
            >
                <button
                    onClick={handlePaste}
                    disabled={!hasClipboard}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hasClipboard ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                >
                    📋 Paste
                </button>
                {onClear && (
                    <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                            onClick={() => {
                                onClear();
                                onClose();
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                            🗑️ Clear Canvas
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Edge menu: only delete (cut/copy are meaningless for connections)
    if (isEdge) {
        return (
            <div
                style={{ top, left, right, bottom }}
                className="fixed z-[9999] bg-white border border-slate-200 shadow-lg rounded-md py-1 min-w-[120px]"
            >
                <button
                    onClick={handleDelete}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                    🗑️ Delete
                </button>
            </div>
        );
    }

    return (
        <div
            style={{ top, left, right, bottom }}
            className="fixed z-[9999] bg-white border border-slate-200 shadow-lg rounded-md py-1 min-w-[120px]"
        >
            <button
                onClick={handleCut}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
                ✂️ Cut
            </button>
            <button
                onClick={handleCopy}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
                📋 Copy
            </button>
            <button
                onClick={handleDelete}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
                🗑️ Delete
            </button>
        </div>
    );
}
