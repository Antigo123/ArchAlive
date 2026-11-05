/** Runs the tutor's tool calls against the canvas. Input comes from the model and is unvalidated. */
import { applyPatch, aliasOf, type SceneNode, type ScenePatch } from './scene';
import { validateLesson, type Lesson } from './lesson';
import { currentScene, getBridge, showScene, startLesson } from './controller';
import { getActiveTab, useTutorStore } from './store';
import { useSimDataStore } from '../stores/simDataStore';

export interface ToolResult {
    content: string;
    is_error?: boolean;
}

const ok = (value: object): ToolResult => ({ content: JSON.stringify(value) });
const fail = (errors: string[]): ToolResult => ({
    content: JSON.stringify({ errors, hint: 'Nothing was changed. Fix these and call the tool again.' }),
    is_error: true,
});

function buildScene(input: { title?: unknown; nodes?: unknown }): ToolResult {
    const compiled = showScene(input.nodes as SceneNode[], { replace: true, fit: true });
    if (compiled.errors.length) return fail(compiled.errors);

    const tab = getActiveTab();
    useTutorStore.getState().updateTab(tab.id, {
        // A new scene replaces any lesson that was running on the old one.
        lesson: null, stepIndex: 0, answers: {}, snapshots: {},
        ...(typeof input.title === 'string' && input.title ? { title: input.title.slice(0, 40) } : {}),
    });
    useTutorStore.getState().set({ focus: [] });
    getBridge().setPaused(false);
    return ok({ built: true, nodes: compiled.nodes.map(aliasOf), warnings: compiled.warnings });
}

function updateScene(input: ScenePatch): ToolResult {
    const { scene, errors } = applyPatch(currentScene(), input);
    if (errors.length) return fail(errors);
    const compiled = showScene(scene);
    if (compiled.errors.length) return fail(compiled.errors);
    getBridge().setPaused(false);
    return ok({ updated: true, nodes: compiled.nodes.map(aliasOf), warnings: compiled.warnings });
}

function runStartLesson(input: unknown): ToolResult {
    const { lesson, errors } = validateLesson(input, currentScene());
    if (!lesson) return fail(errors);
    startLesson(lesson as Lesson);
    return ok({
        started: true,
        steps: lesson.steps.length,
        note: 'The learner now sees the first step on the canvas. Traffic pauses at predictions.',
    });
}

async function observeSimulation(input: { seconds?: unknown }, signal: AbortSignal): Promise<ToolResult> {
    if (getBridge().isPaused()) {
        return ok({ paused: true, note: 'Traffic is paused, because the learner has an unanswered prediction or paused it themselves. Nothing was observed.' });
    }
    const seconds = Math.min(20, Math.max(1, Number(input.seconds) || 8));
    const before = useSimDataStore.getState().outcomes;

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, seconds * 1000);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });

    const { outcomes, policyHits } = useSimDataStore.getState();
    const baseline = (principal: string, status: number) =>
        before.find(o => o.principal === principal && o.status === status)?.count ?? 0;
    const requests = outcomes.map(o => {
        const earlier = baseline(o.principal, o.status);
        // The counts restart when the topology changes, so a drop means "since the restart".
        const count = o.count >= earlier ? o.count - earlier : o.count;
        return { principal: o.principal || '(none)', status: o.status, count };
    }).filter(o => o.count > 0);

    const aliases = new Map(getBridge().getCanvas().nodes.map(n => [n.id, aliasOf(n)]));
    return ok({
        seconds,
        requests,
        policy_rule_hits: Object.fromEntries(Object.entries(policyHits).map(([id, hits]) =>
            [aliases.get(id) ?? id, hits])),
        ...(requests.length === 0 ? {
            note: 'No requests finished in this window. The browser tab may be in the background, or the window may be too short for a round trip.',
        } : {}),
    });
}

function highlight(input: { targets?: unknown }): ToolResult {
    const targets = Array.isArray(input.targets) ? input.targets.map(String) : [];
    const known = new Set(currentScene().map(n => n.id));
    const unknown = targets.filter(t => !known.has(t.split(':')[0]));
    if (unknown.length) return fail(unknown.map(t => `Unknown node in "${t}".`));
    useTutorStore.getState().set({ focus: targets });
    return ok({ highlighted: targets });
}

export async function executeTool(name: string, input: unknown, signal: AbortSignal): Promise<ToolResult> {
    const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    try {
        switch (name) {
            case 'build_scene': return buildScene(args);
            case 'update_scene': return updateScene(args as ScenePatch);
            case 'start_lesson': return runStartLesson(args);
            case 'observe_simulation': return await observeSimulation(args, signal);
            case 'highlight': return highlight(args);
            default: return fail([`Unknown tool "${name}".`]);
        }
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        console.error(`[Tutor] ${name} failed:`, e);
        return fail([`${name} failed: ${e instanceof Error ? e.message : String(e)}`]);
    }
}

/** Short progress labels for the chat panel. */
export const TOOL_LABELS: Record<string, string> = {
    build_scene: 'Building the diagram',
    update_scene: 'Changing the diagram',
    start_lesson: 'Writing the lesson',
    observe_simulation: 'Watching the traffic',
    highlight: 'Pointing at it',
};
