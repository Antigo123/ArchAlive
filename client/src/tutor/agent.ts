/**
 * The tutor's agent loop. The server relays one model turn at a time; the browser runs any tools
 * and posts the results, until the model has nothing more to do.
 */
import { DESIGN_TAB_ID, getActiveTab, useTutorStore, type ChatItem } from './store';
import { currentScene, getBridge, openLessonTab } from './controller';
import { executeTool, TOOL_LABELS } from './tools';
import { useSimDataStore } from '../stores/simDataStore';

const MAX_MODEL_TURNS = 12;
const MAX_JSON_RETRIES = 2;

type ContentBlock = { type: string; id?: string; name?: string; input?: unknown; [key: string]: unknown };
type ApiMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

type ServerEvent =
    | { type: 'text'; text: string }
    | { type: 'progress'; text: string }
    | { type: 'tool_start'; name: string }
    | { type: 'done'; message: { role: 'assistant'; content: ContentBlock[] }; stop_reason: string | null }
    | { type: 'error'; code: string; message: string };

let controller: AbortController | null = null;

const store = () => useTutorStore.getState();

function addChat(tabId: string, role: ChatItem['role'], text: string) {
    store().updateTab(tabId, t => ({
        chat: [...t.chat, { id: crypto.randomUUID(), role, text }],
    }));
}

/** What the learner is looking at, sent with each question so the tutor can answer about it. */
function describeCanvas(): string {
    const tab = getActiveTab();
    const lesson = tab.lesson;
    const state: Record<string, unknown> = { scene: currentScene() };
    if (lesson) {
        state.lesson = {
            title: lesson.title,
            current_step: tab.stepIndex + 1,
            total_steps: lesson.steps.length,
            current_step_title: lesson.steps[tab.stepIndex]?.title,
            predictions: Object.entries(tab.answers).map(([index, option]) => {
                const predict = lesson.steps[Number(index)]?.predict;
                return {
                    question: predict?.question,
                    answered: predict?.options[option]?.text,
                    correct: predict?.options[option]?.correct === true,
                };
            }),
        };
    }
    const { outcomes } = useSimDataStore.getState();
    if (outcomes.length) {
        state.requests_so_far = outcomes.map(o => ({ principal: o.principal || '(none)', status: o.status, count: o.count }));
    }
    state.traffic_paused = getBridge().isPaused();
    return `<canvas_state>\n${JSON.stringify(state)}\n</canvas_state>`;
}

/** Posts the conversation and streams one model turn. Returns its final event. */
async function streamTurn(messages: unknown[], signal: AbortSignal): Promise<ServerEvent> {
    const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal,
    });
    if (!res.ok || !res.headers.get('content-type')?.startsWith('text/event-stream')) {
        if (res.status === 413) {
            return { type: 'error', code: 'too_large', message: 'This conversation has become too long. Start a new lesson to continue.' };
        }
        return { type: 'error', code: 'no_server', message: 'The tutor only runs locally, under `npm run dev`. The built-in ACL lesson works without it.' };
    }

    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let last: ServerEvent | null = null;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (!chunk.startsWith('data: ')) continue;
            const event = JSON.parse(chunk.slice(6)) as ServerEvent;
            last = event;
            if (event.type === 'text') {
                useTutorStore.setState(s => ({ liveText: s.liveText + event.text }));
            } else if (event.type === 'progress') {
                store().set({ status: event.text.trim().slice(0, 120) || store().status });
            } else if (event.type === 'tool_start') {
                store().set({ status: TOOL_LABELS[event.name] ?? 'Working' });
            }
        }
    }
    return last ?? { type: 'error', code: 'connection', message: 'The connection closed before the tutor finished.' };
}

/** Moves the streamed text into the chat history. */
function flushLiveText(tabId: string) {
    const text = store().liveText.trim();
    if (text) addChat(tabId, 'assistant', text);
    store().set({ liveText: '' });
}

export async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || store().running) return;

    // Lessons live in their own tabs. Asking from "My design" opens one, leaving the design alone.
    const tab = getActiveTab().id === DESIGN_TAB_ID ? openLessonTab(trimmed.slice(0, 40)) : getActiveTab();
    const tabId = tab.id;

    addChat(tabId, 'user', trimmed);
    controller = new AbortController();
    const { signal } = controller;
    store().set({ running: true, liveText: '', status: 'Thinking', panelOpen: true });

    // If the turn fails, the conversation goes back to here so the next attempt starts clean.
    const startOfTurn = getActiveTab().apiMessages;
    const update = (messages: unknown[]) => store().updateTab(tabId, { apiMessages: messages });
    let messages: unknown[] = [...startOfTurn, {
        role: 'user',
        content: [{ type: 'text', text: trimmed }, { type: 'text', text: describeCanvas() }],
    } satisfies ApiMessage];

    const fail = (message: string) => {
        store().set({ liveText: '' });
        update(startOfTurn);
        addChat(tabId, 'error', message);
    };

    try {
        let jsonRetries = 0;
        for (let turn = 0; ; turn++) {
            if (turn >= MAX_MODEL_TURNS) {
                flushLiveText(tabId);
                fail('The tutor took too many steps on this one. Try asking in a narrower way.');
                return;
            }

            const textBeforeTurn = store().liveText;
            const event = await streamTurn(messages, signal);

            if (event.type === 'error') {
                if (event.code === 'bad_tool_json' && jsonRetries < MAX_JSON_RETRIES) {
                    jsonRetries++;
                    store().set({ liveText: textBeforeTurn });
                    turn--;
                    continue;
                }
                if (event.code === 'no_credentials') store().set({ configured: false });
                fail(event.message);
                return;
            }
            if (event.type !== 'done') {
                fail('The connection closed before the tutor finished. Try again.');
                return;
            }
            jsonRetries = 0;

            const toolUses = event.message.content.filter(b => b.type === 'tool_use');

            if (event.stop_reason === 'refusal') {
                fail("The tutor couldn't answer that one. Its safety checks sometimes flag security topics by mistake, so try rephrasing what you want to learn.");
                return;
            }
            if (event.stop_reason === 'max_tokens' && toolUses.length) {
                // A cut-off tool input can still look valid, so it must not run.
                fail('That answer got cut off partway. Try asking about a smaller part of the topic.');
                return;
            }

            messages = [...messages, event.message];

            if (event.stop_reason !== 'tool_use' || toolUses.length === 0) {
                flushLiveText(tabId);
                update(messages);
                if (event.stop_reason === 'max_tokens') addChat(tabId, 'error', 'That answer was cut off for length.');
                return;
            }

            // Every tool_use needs a result in one message, even when a tool fails.
            const results: ContentBlock[] = [];
            for (const use of toolUses) {
                store().set({ status: TOOL_LABELS[use.name!] ?? 'Working' });
                const result = await executeTool(use.name!, use.input, signal);
                results.push({
                    type: 'tool_result',
                    tool_use_id: use.id,
                    content: result.content,
                    ...(result.is_error ? { is_error: true } : {}),
                });
            }
            messages = [...messages, { role: 'user', content: results } satisfies ApiMessage];
            update(messages);
            store().set({ status: 'Thinking' });
        }
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
            flushLiveText(tabId);
            update(startOfTurn);
        } else {
            console.error('[Tutor]', e);
            fail('Could not reach the tutor. Is the dev server still running?');
        }
    } finally {
        store().set({ running: false, status: null, liveText: '' });
        controller = null;
    }
}

export function stopTutor() {
    controller?.abort();
}

export async function checkTutorStatus() {
    try {
        const res = await fetch('/api/tutor/status');
        const body = res.ok && res.headers.get('content-type')?.includes('json') ? await res.json() : null;
        store().set({ configured: Boolean(body?.configured) });
    } catch {
        store().set({ configured: false });
    }
}
