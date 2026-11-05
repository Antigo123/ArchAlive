/**
 * Everything that moves lessons and tabs forward: switching canvases, entering steps, recording
 * predictions. It reaches the editor through a small bridge, so it doesn't depend on React.
 */
import { compileScene, applyPatch, sceneFromCanvas, type SceneNode } from './scene';
import type { Lesson } from './lesson';
import { ACL_DEMO_LESSON, ACL_DEMO_SCENE } from './demoLesson';
import {
    DESIGN_TAB_ID, emptyLessonTab, getActiveTab, useTutorStore,
    type CanvasState, type LessonTab,
} from './store';

export interface CanvasBridge {
    getCanvas(): CanvasState;
    /** Replaces the canvas and restarts the simulation from it. */
    setCanvas(canvas: CanvasState, options?: { fit?: boolean }): void;
    setPaused(paused: boolean): void;
    isPaused(): boolean;
    /** Fits the diagram into the space left above the lesson card. */
    refit(cardSpace: number): void;
    /** Empties in-flight traffic and zeroes the counts, without changing the system. */
    resetTraffic(): void;
    allocId(type: string): string;
    /** A running puzzle checks the canvas against its goal, so leaving it has to end it. */
    stopPuzzle(): void;
}

let bridge: CanvasBridge | null = null;

const store = () => useTutorStore.getState();

export function getBridge(): CanvasBridge {
    if (!bridge) throw new Error('The editor has not attached yet.');
    return bridge;
}

/** Called once the editor mounts: restores whichever tab was open last. */
export function attachBridge(b: CanvasBridge) {
    bridge = b;
    store().updateTab(DESIGN_TAB_ID, { canvas: b.getCanvas() });
    const active = getActiveTab();
    if (active.id !== DESIGN_TAB_ID) showTab(active);
}

/** Shows a tab's saved canvas and puts traffic and the spotlight where the lesson left them. */
function showTab(tab: LessonTab) {
    const b = getBridge();
    b.setCanvas(tab.canvas, { fit: !tab.canvas.viewport });
    const step = tab.lesson?.steps[tab.stepIndex];
    store().set({ focus: step?.highlight ?? [] });
    b.setPaused(Boolean(step?.predict && tab.answers[tab.stepIndex] === undefined));
}

/** Safe to call from the UI before the editor has attached. */
export function refitCanvas(cardSpace: number) {
    bridge?.refit(cardSpace);
}

export function saveActiveCanvas() {
    if (!bridge) return;
    store().updateTab(getActiveTab().id, { canvas: bridge.getCanvas() });
}

export function switchTab(id: string) {
    const { activeTabId, running, tabs } = store();
    if (id === activeTabId || running) return;
    const target = tabs.find(t => t.id === id);
    if (!target) return;
    saveActiveCanvas();
    getBridge().stopPuzzle();
    store().set({ activeTabId: id });
    showTab(store().tabs.find(t => t.id === id)!);
}

export function openLessonTab(title: string): LessonTab {
    saveActiveCanvas();
    getBridge().stopPuzzle();
    const tab = emptyLessonTab(`lesson-${crypto.randomUUID().slice(0, 8)}`, title);
    useTutorStore.setState(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, focus: [] }));
    getBridge().setPaused(false);
    getBridge().setCanvas(tab.canvas);
    return tab;
}

export function closeTab(id: string) {
    const { activeTabId, running, tabs } = store();
    if (id === DESIGN_TAB_ID || running) return;
    if (id === activeTabId) {
        const index = tabs.findIndex(t => t.id === id);
        switchTab(tabs[index - 1]?.id ?? DESIGN_TAB_ID);
    }
    useTutorStore.setState(s => ({ tabs: s.tabs.filter(t => t.id !== id) }));
}

// ─── Scenes ──────────────────────────────────────────────────────────────────────────────────

export function currentScene(): SceneNode[] {
    const { nodes, edges } = getBridge().getCanvas();
    return sceneFromCanvas(nodes, edges);
}

/** Compiles a scene onto the canvas, returning the compiler's problems instead if it can't. */
export function showScene(scene: SceneNode[], options: { replace?: boolean; fit?: boolean } = {}) {
    const b = getBridge();
    const compiled = compileScene(scene, {
        allocId: b.allocId,
        existing: options.replace ? [] : b.getCanvas().nodes,
    });
    if (compiled.errors.length) return compiled;
    b.setCanvas({ nodes: compiled.nodes, edges: compiled.edges }, { fit: options.fit });
    return compiled;
}

// ─── Lessons ─────────────────────────────────────────────────────────────────────────────────

export function startLesson(lesson: Lesson) {
    store().updateTab(getActiveTab().id, { lesson, stepIndex: 0, answers: {}, snapshots: {} });
    enterStep(0);
}

function applyStepChanges(index: number) {
    const step = getActiveTab().lesson?.steps[index];
    if (!step?.changes) {
        getBridge().resetTraffic();
        return;
    }
    const { scene, errors } = applyPatch(currentScene(), step.changes);
    const compiled = errors.length ? null : showScene(scene);
    if (!compiled || compiled.errors.length) {
        // Steps are checked against the tutor's scene, but the learner may have edited the canvas
        // since. Keep going so they aren't stuck, and leave the canvas as they made it.
        console.warn('[Tutor] Could not apply a step\'s changes:', errors, compiled?.errors);
        getBridge().resetTraffic();
    }
}

/** Runs a step from its start. Traffic stays paused while a prediction is waiting for an answer. */
function enterStep(index: number) {
    const tab = getActiveTab();
    const step = tab.lesson?.steps[index];
    if (!step) return;
    const { nodes, edges } = getBridge().getCanvas();
    store().updateTab(tab.id, t => ({
        stepIndex: index,
        snapshots: { ...t.snapshots, [index]: { nodes, edges } },
    }));
    store().set({ focus: step.highlight ?? [] });
    if (step.predict) {
        getBridge().setPaused(true);
    } else {
        getBridge().setPaused(false);
        applyStepChanges(index);
    }
}

export function answerPrediction(option: number) {
    const tab = getActiveTab();
    const index = tab.stepIndex;
    if (!tab.lesson?.steps[index]?.predict || tab.answers[index] !== undefined) return;
    store().updateTab(tab.id, t => ({ answers: { ...t.answers, [index]: option } }));
    getBridge().setPaused(false);
    applyStepChanges(index);
}

export function nextStep() {
    const tab = getActiveTab();
    if (tab.lesson && tab.stepIndex < tab.lesson.steps.length - 1) enterStep(tab.stepIndex + 1);
}

/** Goes back to the start of the previous step, undoing its changes so it can be retried. */
export function previousStep() {
    const tab = getActiveTab();
    const index = tab.stepIndex - 1;
    const snapshot = tab.snapshots[index];
    if (index < 0 || !snapshot) return;
    getBridge().setCanvas({ ...snapshot, viewport: getBridge().getCanvas().viewport });
    store().updateTab(tab.id, t => {
        const answers = { ...t.answers };
        delete answers[index];
        delete answers[tab.stepIndex];
        return { answers };
    });
    enterStep(index);
}

export function startDemoLesson() {
    openLessonTab(ACL_DEMO_LESSON.title);
    showScene(ACL_DEMO_SCENE, { replace: true, fit: true });
    startLesson(ACL_DEMO_LESSON);
}
