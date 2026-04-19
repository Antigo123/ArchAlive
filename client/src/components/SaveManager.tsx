import { useState, useEffect, useRef } from 'react';
import { Save, FolderOpen, Trash2, Plus, X, ChevronDown, ChevronUp, Download, Upload } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';

const SAVES_INDEX_KEY = 'archalive_saves_index';
const SAVE_PREFIX = 'archalive_save_';

interface SaveSlot {
    id: string;
    name: string;
    timestamp: number;
    nodeCount: number;
}

interface SaveManagerProps {
    nodes: Node[];
    edges: Edge[];
    viewport: { x: number; y: number; zoom: number } | null;
    onLoad: (nodes: Node[], edges: Edge[], viewport?: { x: number; y: number; zoom: number }) => void;
}

// Get all save slots from localStorage
const getSaveIndex = (): SaveSlot[] => {
    try {
        const index = localStorage.getItem(SAVES_INDEX_KEY);
        return index ? JSON.parse(index) : [];
    } catch {
        return [];
    }
};

// Save the index to localStorage
const setSaveIndex = (slots: SaveSlot[]) => {
    localStorage.setItem(SAVES_INDEX_KEY, JSON.stringify(slots));
};

const serializeNodes = (nodesToSerialize: Node[]) =>
    nodesToSerialize.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
            label: node.data.label,
            request_rate: node.data.request_rate,
            buffer_capacity: node.data.buffer_capacity,
            processing_delay: node.data.processing_delay,
            endpoints: node.data.endpoints,
            streams: node.data.streams,
            dependencies: node.data.dependencies,
            cache_hit_rate: node.data.cache_hit_rate,
            replicas: node.data.replicas,
        },
    }));

export function SaveManager({ nodes, edges, viewport, onLoad }: SaveManagerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [slots, setSlots] = useState<SaveSlot[]>([]);
    const [newName, setNewName] = useState('');
    const [showInput, setShowInput] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleOutside = (e: MouseEvent | TouchEvent) => {
            const target = (e instanceof TouchEvent ? e.touches[0]?.target : e.target) as globalThis.Node;
            if (containerRef.current && !containerRef.current.contains(target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('touchstart', handleOutside);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('touchstart', handleOutside);
        };
    }, [isOpen]);

    // Load slots on mount
    useEffect(() => {
        setSlots(getSaveIndex());
    }, [isOpen]);

    const handleSave = () => {
        if (!newName.trim()) return;

        const id = `save_${Date.now()}`;
        const newSlot: SaveSlot = {
            id,
            name: newName.trim(),
            timestamp: Date.now(),
            nodeCount: nodes.length,
        };

        const saveData = { nodes: serializeNodes(nodes), edges, viewport };
        localStorage.setItem(`${SAVE_PREFIX}${id}`, JSON.stringify(saveData));

        const updatedSlots = [...slots, newSlot];
        setSaveIndex(updatedSlots);
        setSlots(updatedSlots);

        setNewName('');
        setShowInput(false);
    };

    const handleLoad = (slot: SaveSlot) => {
        try {
            const data = localStorage.getItem(`${SAVE_PREFIX}${slot.id}`);
            if (data) {
                const parsed = JSON.parse(data);
                onLoad(parsed.nodes || [], parsed.edges || [], parsed.viewport);
                setIsOpen(false);
            }
        } catch (e) {
            console.error('Failed to load save:', e);
        }
    };

    const handleDelete = (slot: SaveSlot) => {
        if (deleteConfirm !== slot.id) {
            setDeleteConfirm(slot.id);
            return;
        }

        localStorage.removeItem(`${SAVE_PREFIX}${slot.id}`);

        const updatedSlots = slots.filter(s => s.id !== slot.id);
        setSaveIndex(updatedSlots);
        setSlots(updatedSlots);
        setDeleteConfirm(null);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleExportJson = (overrideNodes?: Node[], overrideEdges?: Edge[]) => {
        const exportNodes = overrideNodes ?? nodes;
        const exportEdges = overrideEdges ?? edges;
        const data = { nodes: serializeNodes(exportNodes), edges: exportEdges, viewport };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diagram-${Date.now()}.archalive.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportSlot = (slot: SaveSlot) => {
        try {
            const data = localStorage.getItem(`${SAVE_PREFIX}${slot.id}`);
            if (data) {
                const parsed = JSON.parse(data);
                handleExportJson(parsed.nodes, parsed.edges);
            }
        } catch (e) {
            console.error('Failed to export slot:', e);
        }
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportError(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string);
                if (!Array.isArray(parsed.nodes)) throw new Error('Invalid format');
                onLoad(parsed.nodes, parsed.edges || [], parsed.viewport);
                setIsOpen(false);
            } catch {
                setImportError('Invalid file - expected a .archalive.json diagram file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
        <div className="flex items-center gap-2 relative" ref={containerRef}>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`group flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 max-[400px]:px-2.5 max-[400px]:py-1.5 rounded-full shadow-lg border transition-all duration-300 ${
                    isOpen
                        ? 'bg-white text-blue-600 border-blue-200 ring-4 ring-blue-500/10 shadow-[0_0_20px_rgba(37,99,235,0.15)]'
                        : 'bg-white/95 backdrop-blur-sm text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md hover:text-blue-600'
                }`}
            >
                <Save size={16} className={`transition-colors max-[400px]:w-3.5 max-[400px]:h-3.5 ${isOpen ? 'text-blue-600' : 'text-slate-600 group-hover:text-blue-600'}`} />
                <span className="text-xs md:text-sm max-[400px]:text-[10px] font-bold">Saves</span>
                {isOpen ? <ChevronDown size={14} className="max-[400px]:w-3 max-[400px]:h-3" /> : <ChevronUp size={14} className="max-[400px]:w-3 max-[400px]:h-3" />}
            </button>

            {/* Dropdown Panel - Opens upward */}
            {isOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-[calc(100vw-2rem)] max-[400px]:w-[220px] md:w-80 max-w-80 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-slate-200 overflow-hidden transition-all duration-200">
                    {/* Header */}
                    <div className="px-4 py-3 max-[400px]:px-3 max-[400px]:py-2 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-sm max-[400px]:text-xs font-semibold text-slate-700">Saved Designs</h3>
                        <button
                            onClick={() => setShowInput(!showInput)}
                            className="p-1.5 max-[400px]:p-1 rounded-md hover:bg-slate-100 transition-colors"
                            title="New Save"
                        >
                            {showInput ? <X size={16} className="max-[400px]:w-3.5 max-[400px]:h-3.5" /> : <Plus size={16} className="max-[400px]:w-3.5 max-[400px]:h-3.5" />}
                        </button>
                    </div>

                    {/* New Save Input */}
                    {showInput && (
                        <div className="px-4 py-3 max-[400px]:px-3 max-[400px]:py-2 border-b border-slate-100 flex gap-2">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                placeholder="Enter save name..."
                                className="flex-1 px-3 py-2 max-[400px]:px-2 max-[400px]:py-1.5 text-sm max-[400px]:text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                autoFocus
                            />
                            <button
                                onClick={handleSave}
                                disabled={!newName.trim()}
                                className="px-3 py-2 max-[400px]:px-2 max-[400px]:py-1.5 bg-blue-600 text-white text-sm max-[400px]:text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    )}

                    {/* Slots List */}
                    <div className="max-h-64 max-[400px]:max-h-48 overflow-y-auto">
                        {slots.length === 0 ? (
                            <div className="px-4 py-8 max-[400px]:py-4 text-center text-slate-400 text-sm max-[400px]:text-xs">
                                No saved designs yet
                            </div>
                        ) : (
                            slots.map((slot) => (
                                <div
                                    key={slot.id}
                                    className="group px-4 py-3 max-[400px]:px-3 max-[400px]:py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm max-[400px]:text-xs text-slate-700 truncate">
                                                {slot.name}
                                            </div>
                                            <div className="text-xs max-[400px]:text-[10px] text-slate-400 mt-0.5">
                                                {formatDate(slot.timestamp)} · {slot.nodeCount} nodes
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleLoad(slot)}
                                                className="p-2 rounded-md hover:bg-blue-100 text-blue-600 transition-colors"
                                                title="Load"
                                            >
                                                <FolderOpen size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleExportSlot(slot)}
                                                className="p-2 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                                                title="Download as JSON"
                                            >
                                                <Download size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(slot)}
                                                className={`p-2 rounded-md transition-colors ${deleteConfirm === slot.id
                                                    ? 'bg-red-100 text-red-600'
                                                    : 'hover:bg-red-100 text-red-500'
                                                    }`}
                                                title={deleteConfirm === slot.id ? 'Click again to confirm' : 'Delete'}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer with Export / Import */}
                    <div className="px-4 py-2 max-[400px]:px-3 max-[400px]:py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-xs max-[400px]:text-[10px] text-slate-400">{nodes.length} nodes</span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => handleExportJson()}
                                className="flex items-center gap-1 px-2 py-1 text-xs max-[400px]:text-[10px] font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Export diagram as JSON"
                            >
                                <Download size={12} className="max-[400px]:w-2.5 max-[400px]:h-2.5" />
                                Export
                            </button>
                            <button
                                onClick={() => { setImportError(null); fileInputRef.current?.click(); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs max-[400px]:text-[10px] font-medium text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                                title="Import diagram from JSON"
                            >
                                <Upload size={12} className="max-[400px]:w-2.5 max-[400px]:h-2.5" />
                                Import
                            </button>
                        </div>
                    </div>

                    {/* Import Error */}
                    {importError && (
                        <div className="px-4 py-2 bg-red-50 text-xs text-red-600 border-t border-red-100">
                            {importError}
                        </div>
                    )}

                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportFile}
                    />
                </div>
            )}
        </div>
    );
}
