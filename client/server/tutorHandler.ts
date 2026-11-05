/**
 * The tutor's chat endpoint. It keeps the API key on this machine and relays a conversation to
 * Claude as server-sent events. It is stateless: the browser holds the history, runs the tools
 * and posts the next turn.
 *
 * Only `messages` comes from the request. The model, system prompt, tools and limits are fixed
 * here, so the endpoint can't be used as a general-purpose proxy for the key.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { TUTOR_SYSTEM_PROMPT, TUTOR_TOOLS } from './tutorTools.ts';

export const DEFAULT_TUTOR_MODEL = 'claude-sonnet-5-5';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 1000;

export type TutorEvent =
    | { type: 'text'; text: string }
    | { type: 'progress'; text: string }
    | { type: 'tool_start'; name: string }
    | { type: 'done'; message: { role: 'assistant'; content: unknown[] }; stop_reason: string | null; model: string }
    | { type: 'error'; code: TutorErrorCode; message: string };

export type TutorErrorCode =
    | 'no_credentials' | 'auth' | 'rate_limited' | 'overloaded' | 'bad_request' | 'connection' | 'bad_tool_json' | 'api';

export interface TutorHandlerOptions {
    apiKey?: string;
    model?: string;
    /** Test seam: replaces the API client. */
    createClient?: () => Anthropic;
}

function hasCredentials(apiKey?: string): boolean {
    return Boolean(
        apiKey ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.ANTHROPIC_AUTH_TOKEN ||
        process.env.ANTHROPIC_PROFILE ||
        existsSync(join(homedir(), '.config', 'anthropic')),
    );
}

/** Refuses requests from other websites, which could otherwise spend the key via localhost. */
function isSameOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // Browsers always send Origin on cross-site POSTs.
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('too_large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function json(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

function parseMessages(body: string): Anthropic.Beta.BetaMessageParam[] | null {
    let parsed: { messages?: unknown };
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    const messages = parsed?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
    const valid = messages.every(m =>
        m && (m.role === 'user' || m.role === 'assistant') &&
        (typeof m.content === 'string' || Array.isArray(m.content)));
    return valid ? (messages as Anthropic.Beta.BetaMessageParam[]) : null;
}

function describeError(err: unknown): { code: TutorErrorCode; message: string } {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return { code: 'auth', message: 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in client/.env.local.' };
    }
    if (err instanceof Anthropic.RateLimitError) {
        return { code: 'rate_limited', message: 'Rate limited by the Anthropic API. Try again in a moment.' };
    }
    if (err instanceof Anthropic.BadRequestError) {
        return { code: 'bad_request', message: `The Anthropic API rejected the request: ${err.message}` };
    }
    if (err instanceof Anthropic.APIConnectionError) {
        return { code: 'connection', message: 'Could not reach the Anthropic API. Check your connection.' };
    }
    if (err instanceof Anthropic.APIError) {
        if (err.status === 529 || (err.status ?? 0) >= 500) {
            return { code: 'overloaded', message: 'The Anthropic API is having trouble. Try again in a moment.' };
        }
        return { code: 'api', message: `Anthropic API error ${err.status}: ${err.message}` };
    }
    if (err instanceof Anthropic.AnthropicError) {
        // With eager input streaming, the SDK raises this when the model's tool JSON can't be parsed.
        return { code: 'bad_tool_json', message: 'The tutor produced a malformed response.' };
    }
    return { code: 'api', message: err instanceof Error ? err.message : 'Unexpected error.' };
}

export function createTutorHandler(options: TutorHandlerOptions) {
    const model = options.model || DEFAULT_TUTOR_MODEL;
    const createClient = options.createClient ?? (() => new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {}));
    let client: Anthropic | undefined;

    return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const path = (req.url ?? '').split('?')[0];

        if (path === '/api/tutor/status' && req.method === 'GET') {
            json(res, 200, { configured: Boolean(options.createClient) || hasCredentials(options.apiKey), model });
            return true;
        }
        if (path !== '/api/tutor') return false;

        if (req.method !== 'POST') {
            json(res, 405, { error: 'Use POST.' });
            return true;
        }
        if (!isSameOrigin(req) || !req.headers['content-type']?.startsWith('application/json')) {
            json(res, 403, { error: 'Same-origin JSON requests only.' });
            return true;
        }

        let body: string;
        try {
            body = await readBody(req);
        } catch {
            if (!res.headersSent && !res.destroyed) json(res, 413, { error: 'Conversation too large.' });
            return true;
        }
        const messages = parseMessages(body);
        if (!messages) {
            json(res, 400, { error: 'Expected {messages: [...]}.' });
            return true;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const send = (event: TutorEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

        if (!options.createClient && !hasCredentials(options.apiKey)) {
            send({
                type: 'error',
                code: 'no_credentials',
                message: 'No Anthropic API key found. Add ANTHROPIC_API_KEY to client/.env.local and restart the dev server.',
            });
            res.end();
            return true;
        }

        client ??= createClient();
        const stream = client.beta.messages.stream({
            model,
            max_tokens: 64000,
            // Shows the short notes the model writes between tool calls, which arrive as thinking
            // blocks, as status lines. Blocks go back to the API unchanged on the next request.
            thinking: { type: 'adaptive', display: 'updates' },
            output_config: { effort: 'medium' },
            // Security topics can trip safety classifiers; this retries a false positive on another model.
            betas: ['server-side-fallback-2026-07-01', 'thinking-display-updates-2026-08-18'],
            fallbacks: 'default',
            cache_control: { type: 'ephemeral' },
            system: TUTOR_SYSTEM_PROMPT,
            tools: TUTOR_TOOLS,
            messages,
        });

        // Stop paying for tokens once the learner has hit Stop or closed the page.
        res.on('close', () => {
            if (!res.writableEnded) stream.abort();
        });

        try {
            for await (const event of stream) {
                if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
                    send({ type: 'tool_start', name: event.content_block.name });
                } else if (event.type === 'content_block_delta') {
                    if (event.delta.type === 'text_delta') {
                        send({ type: 'text', text: event.delta.text });
                    } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
                        send({ type: 'progress', text: event.delta.thinking });
                    }
                }
            }
            const final = await stream.finalMessage();
            send({
                type: 'done',
                message: { role: 'assistant', content: final.content },
                stop_reason: final.stop_reason,
                model: final.model,
            });
        } catch (err) {
            if (!(err instanceof Anthropic.APIUserAbortError) && !res.destroyed) {
                const described = describeError(err);
                if (described.code === 'bad_request' || described.code === 'api') {
                    console.error('[tutor]', err);
                }
                send({ type: 'error', ...described });
            }
        }
        res.end();
        return true;
    };
}
