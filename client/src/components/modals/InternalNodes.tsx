import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getMethodColor } from '../../utils/colors';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Input Node (Left Side) - Represents an API Endpoint
export function ServerInputNode({ id, data, selected }: NodeProps) {
    const { setNodes } = useReactFlow();
    const [showMethodDropdown, setShowMethodDropdown] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const method = (data.method as string) || 'GET';
    const path = (data.path as string) || '/';
    const colors = getMethodColor(method);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
                setShowMethodDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Update dropdown position continuously while open
    useEffect(() => {
        if (!showMethodDropdown || !buttonRef.current) return;

        let animationId: number;
        const updatePosition = () => {
            if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 4, left: rect.left });
            }
            animationId = requestAnimationFrame(updatePosition);
        };
        updatePosition();

        return () => cancelAnimationFrame(animationId);
    }, [showMethodDropdown]);

    const updateMethod = (newMethod: string) => {
        if (data.onUpdate && typeof data.onUpdate === 'function') {
            data.onUpdate({ ...data, method: newMethod });
        } else {
            console.warn("ServerInputNode: Missing onUpdate in data, falling back to setNodes");
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === id ? { ...n, data: { ...n.data, method: newMethod } } : n
                )
            );
        }
        setShowMethodDropdown(false);
    };

    const updatePath = (newPath: string) => {
        if (data.onUpdate && typeof data.onUpdate === 'function') {
            data.onUpdate({ ...data, path: newPath });
        } else {
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === id ? { ...n, data: { ...n.data, path: newPath } } : n
                )
            );
        }
    };

    return (
        <div className={`
            relative px-3 py-2 rounded-xl border-2 shadow-sm transition-all bg-white min-w-[160px] outline-none
            ${selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}
        `}>
            <div className="flex flex-col gap-1.5">
                {/* Top Row: Method + Delete */}
                <div className="flex items-center justify-between">
                    {/* Method Badge with Dropdown */}
                    <div className="relative">
                        <button
                            ref={buttonRef}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMethodDropdown(!showMethodDropdown);
                            }}
                            className={`
                                px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 border
                                ${colors.bg} ${colors.text} ${colors.border}
                                hover:opacity-80 transition-opacity
                            `}
                        >
                            {method}
                            <ChevronDown size={10} />
                        </button>

                        {showMethodDropdown && createPortal(
                            <div
                                ref={dropdownRef}
                                className="fixed bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden"
                                style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                            >
                                {HTTP_METHODS.map((m) => (
                                    <button
                                        key={m}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateMethod(m);
                                        }}
                                        className={`
                                            block w-full px-3 py-1.5 text-xs font-bold text-left
                                            ${colors.bg} ${colors.text} hover:opacity-80
                                        `}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>,
                            document.body
                        )}
                    </div>
                    {!!data.onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); (data.onDelete as () => void)(); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>

                {/* Bottom Row: Path */}
                <div>
                    <input
                        type="text"
                        value={path}
                        onChange={(e) => updatePath(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="nodrag text-sm font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 w-full focus:border-blue-500 focus:outline-none"
                        placeholder="/path"
                    />
                </div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="!w-5 !h-5 !bg-blue-500 !border-2 !border-white"
                style={{ right: -10 }}
            />
        </div>
    );
}

// Output Node (Right Side) - Represents a Dependency with outgoing request config
export function ServerOutputNode({ id, data, selected }: NodeProps) {
    const { setNodes } = useReactFlow();
    const [showMethodDropdown, setShowMethodDropdown] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const method = (data.method as string) || 'GET';
    const path = (data.path as string) || '/';
    const colors = getMethodColor(method);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
                setShowMethodDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Update dropdown position continuously while open
    useEffect(() => {
        if (!showMethodDropdown || !buttonRef.current) return;

        let animationId: number;
        const updatePosition = () => {
            if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 4, left: rect.left });
            }
            animationId = requestAnimationFrame(updatePosition);
        };
        updatePosition();

        return () => cancelAnimationFrame(animationId);
    }, [showMethodDropdown]);

    const updateField = (field: string, value: string) => {
        if (data.onUpdate && typeof data.onUpdate === 'function') {
            data.onUpdate({ ...data, [field]: value });
        } else {
            console.warn("ServerOutputNode: Missing onUpdate in data, falling back to setNodes");
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
                )
            );
        }
        if (field === 'method') setShowMethodDropdown(false);
    };

    return (
        <div className={`
            relative px-3 py-2 rounded-xl border-2 shadow-sm transition-all bg-white min-w-[160px] outline-none
            ${selected ? 'border-purple-400 ring-2 ring-purple-100' : 'border-slate-200 hover:border-purple-300'}
        `}>
            <Handle
                type="target"
                position={Position.Left}
                className="!w-5 !h-5 !bg-purple-500 !border-2 !border-white"
            />

            <div className="flex flex-col gap-1.5">
                {/* Top Row: Method + Delete */}
                <div className="flex items-center justify-between">
                    {/* Method Badge with Dropdown */}
                    <div className="relative">
                        <button
                            ref={buttonRef}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMethodDropdown(!showMethodDropdown);
                            }}
                            className={`
                                px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 border
                                ${colors.bg} ${colors.text} ${colors.border}
                                hover:opacity-80 transition-opacity
                            `}
                        >
                            {method}
                            <ChevronDown size={10} />
                        </button>

                        {showMethodDropdown && createPortal(
                            <div
                                ref={dropdownRef}
                                className="fixed bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden"
                                style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                            >
                                {HTTP_METHODS.map((m) => {
                                    const c = getMethodColor(m);
                                    return (
                                        <button
                                            key={m}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateField('method', m);
                                            }}
                                            className={`
                                                block w-full px-3 py-1.5 text-xs font-bold text-left
                                                ${c.bg} ${c.text} hover:opacity-80
                                            `}
                                        >
                                            {m}
                                        </button>
                                    );
                                })}
                            </div>,
                            document.body
                        )}
                    </div>
                    {!!data.onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); (data.onDelete as () => void)(); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>

                {/* Bottom Row: Path */}
                <div>
                    <input
                        type="text"
                        value={path}
                        onChange={(e) => updateField('path', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="nodrag text-sm font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 w-full focus:border-purple-500 focus:outline-none"
                        placeholder="/path"
                    />
                </div>
            </div>
        </div>
    );
}

// Return Node (Right Side) - Represents Replying to Caller
export function ServerReturnNode({ selected }: NodeProps) {
    return (
        <div className={`
            px-3 py-2 rounded-xl border-2 border-dashed shadow-sm transition-all bg-slate-50 outline-none
            ${selected ? 'border-green-400 ring-2 ring-green-100' : 'border-slate-300 hover:border-green-400'}
        `}>
            <Handle
                type="target"
                position={Position.Left}
                className="!w-5 !h-5 !bg-green-500 !border-2 !border-white"
            />

            <div className="flex items-center">
                <span className="text-sm font-semibold text-slate-700">
                    Return Reply
                </span>
            </div>
        </div>
    );
}
