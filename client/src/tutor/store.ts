import type { Edge, Node, Viewport } from '@xyflow/react';
import { create } from 'zustand';
import type { Lesson } from './lesson';

export const DESIGN_TAB_ID = 'design';
const STORAGE_KEY = 'archalive_lessons_v1';

export interface CanvasState {
    nodes: Node[];
    edges: Edge[];
    viewport?: Viewport;
}

export interface ChatItem {
    id: string;
    role: 'user' | 'assistant' | 'error';
    text: string;
}

export interface LessonTab {
    id: string;
    title: string;
    canvas: CanvasState;
    /** The exact API conversation. Append-only: the API rejects edited thinking blocks. */
    apiMessages: unknown[];
    chat: ChatItem[];
    lesson: Lesson | null;
    stepIndex: number;
    /** Step index -> the option the learner chose. */
    answers: Record<number, number>;
    /** Step index -> the canvas before that step's changes, so Back can undo them. */
    snapshots: Record<number, { nodes: Node[]; edges: Edge[] }>;
}

interface TutorState {
    tabs: LessonTab[];
    activeTabId: string;
    /** The tutor is mid-turn. Tab switching is locked, since tools act on the visible canvas. */
    running: boolean;
    /** The assistant text streaming in right now, shown until the turn finishes. */
    liveText: string;
    status: string | null;
    /** What's spotlit: "alias" or "alias:part". */
    focus: string[];
    panelOpen: boolean;
    storageFull: boolean;
    configured: boolean | null;
    updateTab: (id: string, patch: Partial<LessonTab> | ((tab: LessonTab) => Partial<LessonTab>)) => void;
    set: (patch: Partial<TutorState>) => void;
}

const designTab = (): LessonTab => ({
    id: DESIGN_TAB_ID,
    title: 'My design',
    canvas: { nodes: [], edges: [] },
    apiMessages: [],
    chat: [],
    lesson: null,
    stepIndex: 0,
    answers: {},
    snapshots: {},
});

export function emptyLessonTab(id: string, title: string): LessonTab {
    return { ...designTab(), id, title };
}

function loadPersisted(): { tabs: LessonTab[]; activeTabId: string } {
    const fresh = { tabs: [designTab()], activeTabId: DESIGN_TAB_ID };
    if (typeof window === 'undefined') return fresh;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return fresh;
        const saved = JSON.parse(raw) as { tabs: LessonTab[]; activeTabId: string };
        const tabs = [designTab(), ...saved.tabs];
        return { tabs, activeTabId: tabs.some(t => t.id === saved.activeTabId) ? saved.activeTabId : DESIGN_TAB_ID };
    } catch (e) {
        console.error('[Tutor] Could not load saved lessons:', e);
        return fresh;
    }
}

const persisted = loadPersisted();

export const useTutorStore = create<TutorState>((set) => ({
    tabs: persisted.tabs,
    activeTabId: persisted.activeTabId,
    running: false,
    liveText: '',
    status: null,
    focus: [],
    panelOpen: typeof window === 'undefined' || window.innerWidth >= 768,
    storageFull: false,
    configured: null,
    updateTab: (id, patch) => set(state => ({
        tabs: state.tabs.map(t => {
            if (t.id !== id) return t;
            return { ...t, ...(typeof patch === 'function' ? patch(t) : patch) };
        }),
    })),
    set: patch => set(patch),
}));

export const getActiveTab = (): LessonTab => {
    const { tabs, activeTabId } = useTutorStore.getState();
    return tabs.find(t => t.id === activeTabId) ?? tabs[0];
};

export const useActiveTab = (): LessonTab =>
    useTutorStore(s => s.tabs.find(t => t.id === s.activeTabId) ?? s.tabs[0]);

/** Which parts of a node are spotlit: for "acl:1" and alias "acl", that's ["1"]. */
export const useFocusParts = (alias: unknown): string[] => {
    const focus = useTutorStore(s => s.focus);
    if (typeof alias !== 'string') return EMPTY;
    const parts = focus.filter(f => f.startsWith(`${alias}:`)).map(f => f.slice(alias.length + 1));
    return parts.length ? parts : EMPTY;
};
const EMPTY: string[] = [];

// ─── Persistence ─────────────────────────────────────────────────────────────────────────────

const slimNode = (n: Node) => ({ id: n.id, type: n.type, position: n.position, data: n.data });

function serialize(state: TutorState): string {
    return JSON.stringify({
        activeTabId: state.activeTabId,
        // The design tab's canvas is saved by the editor under its own, older key.
        tabs: state.tabs.filter(t => t.id !== DESIGN_TAB_ID).map(t => ({
            ...t,
            canvas: { ...t.canvas, nodes: t.canvas.nodes.map(slimNode) },
            snapshots: Object.fromEntries(Object.entries(t.snapshots).map(([k, s]) =>
                [k, { nodes: s.nodes.map(slimNode), edges: s.edges }])),
        })),
    });
}

if (typeof window !== 'undefined') {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = '';
    useTutorStore.subscribe((state, prev) => {
        if (state.tabs === prev.tabs && state.activeTabId === prev.activeTabId) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            const current = useTutorStore.getState();
            const text = serialize(current);
            if (text === last) return;
            try {
                localStorage.setItem(STORAGE_KEY, text);
                last = text;
                if (current.storageFull) current.set({ storageFull: false });
            } catch (e) {
                console.error('[Tutor] Could not save lessons:', e);
                if (!current.storageFull) current.set({ storageFull: true });
            }
        }, 500);
    });
}
