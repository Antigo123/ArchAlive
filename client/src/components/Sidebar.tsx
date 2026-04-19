import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NODE_TYPES_CONFIG } from './node-types';

interface SidebarProps {
    onClear: () => void;
    allowedNodes?: string[];
}

export function Sidebar({ onClear, allowedNodes }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false);

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const items = NODE_TYPES_CONFIG.filter(item =>
        !allowedNodes || allowedNodes.includes(item.type)
    );

    return (
        <aside data-sidebar className={`absolute top-4 left-4 hidden md:flex flex-col gap-2 transition-all duration-300 z-[100] ${collapsed ? 'w-auto' : 'w-56'}`}>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col p-2">
                <div className="flex items-center justify-between p-2 mb-2">
                    {!collapsed && <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Components</h2>}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                <div className="flex flex-col gap-1">
                    {items.map((item) => (
                        <div
                            key={item.type}
                            className={`
                                flex items-center gap-3 p-2 rounded-xl cursor-grab hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 hover:shadow-sm
                                ${collapsed ? 'justify-center w-10 h-10' : ''}
                            `}
                            draggable
                            onDragStart={(event) => onDragStart(event, item.type)}
                            title={collapsed ? item.label : undefined}
                        >
                            <item.icon size={20} className={item.color} />
                            {!collapsed && <span className="text-sm font-medium text-slate-700">{item.label}</span>}
                        </div>
                    ))}
                </div>

                <div className="pt-4 mt-2 border-t border-slate-100">
                    <button
                        onClick={onClear}
                        className={`
                            ${collapsed ? 'w-10 h-10 p-0 justify-center' : 'w-full p-2 px-3'}
                            bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-colors text-sm font-bold flex items-center justify-center gap-2
                        `}
                        title={collapsed ? "Clear Canvas" : undefined}
                    >
                        <Trash2 size={18} />
                        {!collapsed && <span>Clear Canvas</span>}
                    </button>
                </div>
            </div>
        </aside>
    );
}
