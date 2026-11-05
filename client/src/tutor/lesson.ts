import type { ScenePatch, SceneNode } from './scene';
import { applyPatch, validateScene } from './scene';

export interface LessonPrediction {
    question: string;
    options: { text: string; correct: boolean }[];
    /** Shown once traffic has had time to confirm or contradict the guess. */
    explanation: string;
}

export interface LessonStep {
    title: string;
    body: string;
    /** "nodeId" spotlights a node; "nodeId:part" also marks a rule, table row, tree node, etc. */
    highlight?: string[];
    /** Applied on entering the step, or after the learner answers if there's a prediction. */
    changes?: ScenePatch;
    predict?: LessonPrediction;
}

export interface Lesson {
    title: string;
    steps: LessonStep[];
    follow_ups?: string[];
}

export function validateLesson(input: unknown, scene: SceneNode[]): { lesson?: Lesson; errors: string[] } {
    const errors: string[] = [];
    const raw = input as Partial<Lesson> | null;
    if (!raw || !Array.isArray(raw.steps) || raw.steps.length === 0) {
        return { errors: ['A lesson needs a non-empty "steps" array.'] };
    }

    let current = scene;
    raw.steps.forEach((step, i) => {
        const where = `steps[${i}]`;
        if (typeof step?.title !== 'string' || !step.title) errors.push(`${where}: "title" is required.`);
        if (typeof step?.body !== 'string' || !step.body) errors.push(`${where}: "body" is required.`);

        if (step?.predict) {
            const { question, options, explanation } = step.predict;
            if (!question) errors.push(`${where}.predict: "question" is required.`);
            if (!explanation) errors.push(`${where}.predict: "explanation" is required.`);
            if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
                errors.push(`${where}.predict: give 2 to 4 options.`);
            } else if (options.filter(o => o?.correct === true).length !== 1) {
                errors.push(`${where}.predict: exactly one option must have "correct": true.`);
            }
        }

        // Dry-run each step's changes in order, so a bad step fails now rather than mid-lesson.
        if (step?.changes) {
            const result = applyPatch(current, step.changes);
            errors.push(...result.errors.map(e => `${where}.changes: ${e}`));
            const sceneErrors = validateScene(result.scene);
            errors.push(...sceneErrors.map(e => `${where}.changes: ${e}`));
            if (result.errors.length === 0 && sceneErrors.length === 0) current = result.scene;
        }

        const known = new Set(current.map(n => n.id));
        for (const target of step?.highlight ?? []) {
            const id = String(target).split(':')[0];
            if (!known.has(id)) errors.push(`${where}.highlight: unknown node "${id}".`);
        }
    });

    return errors.length ? { errors } : { lesson: raw as Lesson, errors };
}
