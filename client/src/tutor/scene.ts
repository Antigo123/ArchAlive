/**
 * The tutor describes diagrams as a small declarative "scene". This module turns a scene into
 * React Flow nodes and edges the simulator can run, and back again, so the canvas stays the one
 * source of truth even after the learner edits it.
 *
 * It exists because the simulator is unforgiving about wiring: node types are inferred from a
 * substring of the node id, edges must name exact handles, and a malformed stream is silently
 * ignored. The scene format has none of those traps.
 *
 * All wiring is written as outgoing references on the sending node, so there is no edge list to
 * keep consistent.
 */
import type { Edge, Node } from '@xyflow/react';

export const SCENE_NODE_TYPES = [
    'client', 'server', 'database', 'cache', 'load_balancer', 'api_gateway',
    'message_queue', 'topic', 'policy', 'diagram',
] as const;
export type SceneNodeType = (typeof SCENE_NODE_TYPES)[number];

export interface SceneStream {
    method: string;
    path: string;
    rate?: number;
    principal?: string;
    to?: string;
    retries?: number;
}

export interface SceneCall {
    to: string;
    method?: string;
    path?: string;
}

export interface SceneEndpoint {
    method: string;
    path: string;
    rps?: number;
    error_rate?: number;
    calls?: SceneCall[];
}

export interface SceneRoute {
    method: string;
    path: string;
    to: string;
}

export interface PolicyRule {
    principal: string;
    method: string;
    path: string;
    effect: 'allow' | 'deny' | 'limit';
    status?: number;
    rate?: number;
}

export interface TreeBlockNode {
    id: string;
    label: string;
    children?: TreeBlockNode[];
}

export type DiagramBlock =
    | { kind: 'text'; text: string }
    | { kind: 'table'; columns: string[]; rows: string[][] }
    | { kind: 'kv'; entries: { key: string; value: string }[] }
    | { kind: 'tree'; root: TreeBlockNode }
    | { kind: 'sequence'; actors: string[]; messages: { from: string; to: string; label: string }[] };

export interface SceneNode {
    id: string;
    type: SceneNodeType;
    label?: string;
    streams?: SceneStream[];
    endpoints?: SceneEndpoint[];
    routes?: SceneRoute[];
    rules?: PolicyRule[];
    default_effect?: 'allow' | 'deny';
    default_status?: number;
    to?: string[];
    hit_rate?: number;
    rps?: number;
    capacity?: number;
    block?: DiagramBlock;
}

export interface ScenePatch {
    add?: SceneNode[];
    update?: (Partial<SceneNode> & { id: string })[];
    remove?: string[];
}

export interface CompileResult {
    nodes: Node[];
    edges: Edge[];
    /** Problems that make the scene unusable. */
    errors: string[];
    /** Likely mistakes that may also be the point of the lesson, like a route that will 404. */
    warnings: string[];
}

export interface CompileOptions {
    /** The nodes currently on the canvas: ids and positions carry over by alias. */
    existing?: Node[];
    allocId: (type: string) => string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALIAS_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_NODES = 24;

const DEFAULT_LABELS: Record<SceneNodeType, string> = {
    client: 'Client', server: 'Server', database: 'Database', cache: 'Cache',
    load_balancer: 'Load Balancer', api_gateway: 'API Gateway', message_queue: 'Message Queue',
    topic: 'Topic', policy: 'Policy', diagram: '',
};

const DEFAULT_ENDPOINT_RPS = 10;
const DEFAULT_RPS: Partial<Record<SceneNodeType, number>> = { database: 20, cache: 20 };
const DEFAULT_CAPACITY: Partial<Record<SceneNodeType, number>> = {
    server: 30, database: 100, cache: 100, message_queue: 100, topic: 100,
};

const delayFromRps = (rps: number) => (rps <= 0 ? 0 : 60 / rps);
const rpsFromDelay = (delay: number) => (delay <= 0 ? 0 : Math.round((60 / delay) * 100) / 100);
const isWriteMethod = (method: string) => method.toUpperCase() !== 'GET';

// ─── Validation ──────────────────────────────────────────────────────────────────────────────

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validateBlock(where: string, block: unknown, errors: string[]) {
    const b = block as DiagramBlock | undefined;
    if (!b || typeof b !== 'object') {
        errors.push(`${where}: a diagram node needs a "block".`);
        return;
    }
    switch (b.kind) {
        case 'text':
            if (!isStr(b.text)) errors.push(`${where}: a text block needs "text".`);
            break;
        case 'table':
            if (!Array.isArray(b.columns) || !Array.isArray(b.rows)) {
                errors.push(`${where}: a table block needs "columns" and "rows" arrays.`);
            } else {
                b.rows.forEach((row, i) => {
                    if (!Array.isArray(row) || row.length !== b.columns.length) {
                        errors.push(`${where}: table row ${i} must have ${b.columns.length} cells.`);
                    }
                });
            }
            break;
        case 'kv':
            if (!Array.isArray(b.entries) || b.entries.some(e => !isStr(e?.key) || typeof e?.value !== 'string')) {
                errors.push(`${where}: a kv block needs "entries" of {key, value}.`);
            }
            break;
        case 'tree': {
            const walk = (n: TreeBlockNode | undefined, seen: Set<string>) => {
                if (!n || !isStr(n.id) || typeof n.label !== 'string') {
                    errors.push(`${where}: every tree node needs "id" and "label".`);
                    return;
                }
                if (seen.has(n.id)) errors.push(`${where}: duplicate tree node id "${n.id}".`);
                seen.add(n.id);
                (n.children ?? []).forEach(c => walk(c, seen));
            };
            walk(b.root, new Set());
            break;
        }
        case 'sequence':
            if (!Array.isArray(b.actors) || !Array.isArray(b.messages)) {
                errors.push(`${where}: a sequence block needs "actors" and "messages" arrays.`);
            } else {
                b.messages.forEach((m, i) => {
                    if (!b.actors.includes(m?.from) || !b.actors.includes(m?.to)) {
                        errors.push(`${where}: sequence message ${i} must go between listed actors.`);
                    }
                });
            }
            break;
        default:
            errors.push(`${where}: unknown block kind. Use text, table, kv, tree or sequence.`);
    }
}

function validateMethodPath(where: string, method: unknown, path: unknown, errors: string[]) {
    if (!isStr(method) || !HTTP_METHODS.includes(method.toUpperCase())) {
        errors.push(`${where}: method must be one of ${HTTP_METHODS.join(', ')}.`);
    }
    if (!isStr(path) || !path.startsWith('/')) errors.push(`${where}: path must start with "/".`);
}

export function validateScene(scene: unknown): string[] {
    const errors: string[] = [];
    if (!Array.isArray(scene)) return ['"nodes" must be an array.'];
    if (scene.length > MAX_NODES) errors.push(`Too many nodes (${scene.length}). Keep a scene under ${MAX_NODES}.`);

    const nodes = scene as SceneNode[];
    const types = new Map<string, SceneNodeType>();
    for (const n of nodes) {
        if (!n || !ALIAS_RE.test(n.id ?? '')) {
            errors.push(`Invalid node id ${JSON.stringify(n?.id)}: use letters, numbers, "-" or "_".`);
            continue;
        }
        if (types.has(n.id)) errors.push(`Duplicate node id "${n.id}".`);
        if (!SCENE_NODE_TYPES.includes(n.type)) {
            errors.push(`${n.id}: unknown type ${JSON.stringify(n.type)}. Use one of ${SCENE_NODE_TYPES.join(', ')}.`);
        }
        types.set(n.id, n.type);
    }

    const checkTarget = (where: string, to: unknown) => {
        if (!isStr(to)) {
            errors.push(`${where}: "to" must be a node id.`);
        } else if (!types.has(to)) {
            errors.push(`${where}: "to" refers to unknown node "${to}".`);
        } else if (types.get(to) === 'diagram') {
            errors.push(`${where}: traffic can't go to diagram node "${to}", which isn't simulated.`);
        } else if (types.get(to) === 'client') {
            errors.push(`${where}: traffic can't be sent to client "${to}".`);
        }
    };

    for (const n of nodes) {
        if (!n || !ALIAS_RE.test(n.id ?? '')) continue;
        switch (n.type) {
            case 'client':
                if (!Array.isArray(n.streams) || n.streams.length === 0) {
                    errors.push(`${n.id}: a client needs at least one stream.`);
                    break;
                }
                n.streams.forEach((s, i) => {
                    const where = `${n.id}.streams[${i}]`;
                    validateMethodPath(where, s?.method, s?.path, errors);
                    if (s?.rate !== undefined && (!isNum(s.rate) || s.rate <= 0 || s.rate > 20)) {
                        errors.push(`${where}: rate must be between 0 and 20 requests/sec.`);
                    }
                    if (s?.to !== undefined) checkTarget(where, s.to);
                });
                break;
            case 'server':
                if (!Array.isArray(n.endpoints) || n.endpoints.length === 0) {
                    errors.push(`${n.id}: a server needs at least one endpoint.`);
                    break;
                }
                n.endpoints.forEach((ep, i) => {
                    const where = `${n.id}.endpoints[${i}]`;
                    validateMethodPath(where, ep?.method, ep?.path, errors);
                    if (ep?.error_rate !== undefined && (!isNum(ep.error_rate) || ep.error_rate < 0 || ep.error_rate > 1)) {
                        errors.push(`${where}: error_rate must be between 0 and 1.`);
                    }
                    if (ep?.rps !== undefined && (!isNum(ep.rps) || ep.rps < 0)) {
                        errors.push(`${where}: rps must not be negative.`);
                    }
                    (ep?.calls ?? []).forEach((c, j) => checkTarget(`${where}.calls[${j}]`, c?.to));
                });
                break;
            case 'api_gateway':
                if (!Array.isArray(n.routes) || n.routes.length === 0) {
                    errors.push(`${n.id}: an api_gateway needs at least one route.`);
                    break;
                }
                n.routes.forEach((r, i) => {
                    const where = `${n.id}.routes[${i}]`;
                    validateMethodPath(where, r?.method, r?.path, errors);
                    checkTarget(where, r?.to);
                });
                break;
            case 'policy':
                if (n.rules !== undefined && !Array.isArray(n.rules)) {
                    errors.push(`${n.id}: "rules" must be an array.`);
                    break;
                }
                (n.rules ?? []).forEach((r, i) => {
                    const where = `${n.id}.rules[${i}]`;
                    if (!['allow', 'deny', 'limit'].includes(r?.effect)) {
                        errors.push(`${where}: effect must be allow, deny or limit.`);
                    }
                    if (r?.effect === 'limit' && (!isNum(r.rate) || r.rate <= 0)) {
                        errors.push(`${where}: a limit rule needs a positive "rate".`);
                    }
                    if (!isStr(r?.principal) || !isStr(r?.method) || !isStr(r?.path)) {
                        errors.push(`${where}: principal, method and path are required ("*" matches anything).`);
                    }
                });
                if (n.default_effect !== undefined && !['allow', 'deny'].includes(n.default_effect)) {
                    errors.push(`${n.id}: default_effect must be allow or deny.`);
                }
                break;
            case 'diagram':
                validateBlock(n.id, n.block, errors);
                break;
        }
        if (n.type === 'cache' && n.hit_rate !== undefined && (!isNum(n.hit_rate) || n.hit_rate < 0 || n.hit_rate > 1)) {
            errors.push(`${n.id}: hit_rate must be between 0 and 1.`);
        }
        if (n.to !== undefined) {
            if (!Array.isArray(n.to)) errors.push(`${n.id}: "to" must be an array of node ids.`);
            else n.to.forEach(t => checkTarget(n.id, t));
        }
    }
    return errors;
}

// ─── Warnings: wiring that will fail at runtime ──────────────────────────────────────────────

function collectWarnings(scene: SceneNode[]): string[] {
    const byId = new Map(scene.map(n => [n.id, n]));
    const warnings: string[] = [];

    /** Follows a request from `id` and reports where it will fail, if anywhere it can tell. */
    const walk = (id: string, method: string, path: string, source: string, seen: Set<string>) => {
        if (seen.has(id)) return;
        seen.add(id);
        const n = byId.get(id);
        if (!n) return;
        const match = (x: { method: string; path: string }) =>
            x.method.toUpperCase() === method.toUpperCase() && x.path === path;
        if (n.type === 'server') {
            const ep = n.endpoints?.find(match);
            if (!ep) {
                warnings.push(`${source} reaches server "${id}", which has no ${method} ${path} endpoint, so it will get 404.`);
                return;
            }
            for (const c of ep.calls ?? []) {
                walk(c.to, c.method ?? ep.method, c.path ?? ep.path, source, new Set(seen));
            }
        } else if (n.type === 'api_gateway') {
            const route = n.routes?.find(match);
            if (!route) {
                warnings.push(`${source} reaches gateway "${id}", which has no ${method} ${path} route, so it will get 404.`);
                return;
            }
            walk(route.to, method, path, source, new Set(seen));
        } else {
            if (n.type === 'cache' && !n.to?.length) {
                warnings.push(`Cache "${id}" has nowhere to send misses, so ${source} will get 503 on a miss.`);
            }
            for (const t of n.to ?? []) walk(t, method, path, source, new Set(seen));
        }
    };

    for (const n of scene) {
        if (n.type !== 'client') continue;
        for (const s of n.streams ?? []) {
            const source = `${n.id}'s ${s.method} ${s.path}`;
            if (!s.to) warnings.push(`${source} has no "to", so it goes nowhere.`);
            else walk(s.to, s.method, s.path, source, new Set());
        }
    }
    return warnings;
}

// ─── Layout ──────────────────────────────────────────────────────────────────────────────────

function outgoing(n: SceneNode): string[] {
    switch (n.type) {
        case 'client': return (n.streams ?? []).flatMap(s => (s.to ? [s.to] : []));
        case 'server': return (n.endpoints ?? []).flatMap(e => (e.calls ?? []).map(c => c.to));
        case 'api_gateway': return (n.routes ?? []).map(r => r.to);
        case 'diagram': return [];
        default: return n.to ?? [];
    }
}

function estimateSize(n: SceneNode): { width: number; height: number } {
    switch (n.type) {
        case 'client': return { width: 280, height: 96 + (n.streams?.length ?? 0) * 40 };
        case 'server': {
            const inputs = n.endpoints?.length ?? 0;
            const outputs = 1 + (n.endpoints ?? []).reduce((sum, e) => sum + (e.calls?.length ?? 0), 0);
            return { width: 300, height: 170 + Math.max(inputs, outputs) * 40 };
        }
        case 'api_gateway': return { width: 240, height: 80 + (n.routes?.length ?? 0) * 38 };
        case 'policy': return { width: 320, height: 90 + ((n.rules?.length ?? 0) + 1) * 30 };
        case 'cache': return { width: 280, height: 170 };
        case 'database': return { width: 280, height: 120 };
        case 'diagram': return estimateBlockSize(n.block);
        default: return { width: 280, height: 90 };
    }
}

function estimateBlockSize(block?: DiagramBlock): { width: number; height: number } {
    if (!block) return { width: 240, height: 100 };
    switch (block.kind) {
        case 'text': return { width: 280, height: 60 + Math.ceil(block.text.length / 38) * 20 };
        case 'table': return { width: Math.max(240, block.columns.length * 130), height: 80 + (block.rows.length + 1) * 30 };
        case 'kv': return { width: 340, height: 60 + block.entries.length * 32 };
        case 'sequence': return { width: Math.max(320, block.actors.length * 150), height: 110 + block.messages.length * 40 };
        case 'tree': {
            const depth = (n: TreeBlockNode): number => 1 + Math.max(0, ...(n.children ?? []).map(depth));
            const leaves = (n: TreeBlockNode): number =>
                n.children?.length ? n.children.reduce((sum, c) => sum + leaves(c), 0) : 1;
            return { width: Math.max(240, leaves(block.root) * 90), height: 70 + depth(block.root) * 70 };
        }
    }
}

const COLUMN_GAP = 90;
const ROW_GAP = 40;

/** Left-to-right layered layout for traffic nodes, with diagram cards in a row beneath them. */
function layoutScene(scene: SceneNode[]): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    const traffic = scene.filter(n => n.type !== 'diagram');
    const diagrams = scene.filter(n => n.type === 'diagram');

    // Longest path from a source, capped so a cycle can't loop forever.
    const layer = new Map(traffic.map(n => [n.id, 0]));
    for (let pass = 0; pass < traffic.length; pass++) {
        let changed = false;
        for (const n of traffic) {
            for (const t of outgoing(n)) {
                if (layer.has(t) && layer.get(t)! < layer.get(n.id)! + 1) {
                    layer.set(t, layer.get(n.id)! + 1);
                    changed = true;
                }
            }
        }
        if (!changed) break;
    }

    const columns = new Map<number, SceneNode[]>();
    for (const n of traffic) {
        const l = layer.get(n.id)!;
        columns.set(l, [...(columns.get(l) ?? []), n]);
    }

    let x = 0;
    let trafficBottom = 0;
    let trafficHeight = 0;
    const columnHeight = (col: SceneNode[]) =>
        col.reduce((sum, n) => sum + estimateSize(n).height, 0) + (col.length - 1) * ROW_GAP;
    for (const col of columns.values()) trafficHeight = Math.max(trafficHeight, columnHeight(col));

    for (const l of [...columns.keys()].sort((a, b) => a - b)) {
        const col = columns.get(l)!;
        let y = (trafficHeight - columnHeight(col)) / 2;
        let width = 0;
        for (const n of col) {
            const size = estimateSize(n);
            positions.set(n.id, { x, y });
            y += size.height + ROW_GAP;
            width = Math.max(width, size.width);
            trafficBottom = Math.max(trafficBottom, y);
        }
        x += width + COLUMN_GAP;
    }

    let dx = 0;
    const dy = traffic.length ? trafficBottom + ROW_GAP : 0;
    for (const n of diagrams) {
        positions.set(n.id, { x: dx, y: dy });
        dx += estimateSize(n).width + COLUMN_GAP / 2;
    }
    return positions;
}

// ─── Compile ─────────────────────────────────────────────────────────────────────────────────

export function aliasOf(node: Node): string {
    return (node.data?.alias as string | undefined) ?? node.id;
}

export function compileScene(scene: SceneNode[], options: CompileOptions): CompileResult {
    const errors = validateScene(scene);
    if (errors.length) return { nodes: [], edges: [], errors, warnings: [] };

    const existingByAlias = new Map((options.existing ?? []).map(n => [aliasOf(n), n]));
    const layout = layoutScene(scene);

    const ids = new Map<string, string>();
    for (const n of scene) {
        const prev = existingByAlias.get(n.id);
        // The engine infers a node's type from its id, so a retyped node needs a fresh one.
        ids.set(n.id, prev && prev.type === n.type ? prev.id : options.allocId(n.type));
    }

    const byAlias = new Map(scene.map(n => [n.id, n]));
    const edges: Edge[] = [];

    /** The handle a request should enter a node through. Only servers have named inputs. */
    const targetHandleFor = (alias: string, method: string, path: string): string | undefined => {
        const target = byAlias.get(alias);
        if (target?.type !== 'server') return undefined;
        const eps = target.endpoints ?? [];
        const idx = eps.findIndex(e => e.method.toUpperCase() === method.toUpperCase() && e.path === path);
        return `ep-${alias}-${Math.max(idx, 0)}`;
    };

    const addEdge = (source: string, sourceHandle: string | undefined, target: string, targetHandle: string | undefined) => {
        const sourceId = ids.get(source)!;
        const targetId = ids.get(target)!;
        edges.push({
            id: `e-${sourceId}-${sourceHandle ?? 'out'}-${targetId}-${targetHandle ?? 'in'}`,
            source: sourceId,
            sourceHandle,
            target: targetId,
            targetHandle,
            data: { latency_ms: 0 },
        });
    };

    const nodes: Node[] = scene.map(n => {
        const data: Record<string, unknown> = { alias: n.id, label: n.label ?? DEFAULT_LABELS[n.type] };
        const defaultCapacity = DEFAULT_CAPACITY[n.type];
        if (n.capacity !== undefined || defaultCapacity !== undefined) {
            data.buffer_capacity = n.capacity ?? defaultCapacity;
        }
        const defaultRps = DEFAULT_RPS[n.type];
        if (n.rps !== undefined || defaultRps !== undefined) {
            data.processing_delay = delayFromRps(n.rps ?? defaultRps!);
        }

        switch (n.type) {
            case 'client':
                data.streams = n.streams!.map((s, i) => {
                    const method = s.method.toUpperCase();
                    const id = `s-${n.id}-${i}`;
                    if (s.to) addEdge(n.id, id, s.to, targetHandleFor(s.to, method, s.path));
                    return {
                        id,
                        label: `${method} ${s.path}`,
                        is_write: isWriteMethod(method),
                        weight: 1,
                        method,
                        path: s.path,
                        rate: s.rate ?? 1,
                        retries: s.retries ?? 0,
                        principal: s.principal ?? '',
                    };
                });
                break;

            case 'server': {
                const dependencies: Record<string, unknown>[] = [];
                data.endpoints = n.endpoints!.map((ep, i) => {
                    const method = ep.method.toUpperCase();
                    const delay = delayFromRps(ep.rps ?? DEFAULT_ENDPOINT_RPS);
                    const forward_to = (ep.calls ?? []).map((c, j) => {
                        const depId = `dep-${n.id}-${i}-${j}`;
                        const callMethod = (c.method ?? method).toUpperCase();
                        const callPath = c.path ?? ep.path;
                        dependencies.push({ id: depId, label: c.to, method: callMethod, path: callPath });
                        addEdge(n.id, depId, c.to, targetHandleFor(c.to, callMethod, callPath));
                        return { target_id: depId, delay };
                    });
                    if (forward_to.length === 0) forward_to.push({ target_id: '__return__', delay });
                    return {
                        id: `ep-${n.id}-${i}`,
                        method,
                        path: ep.path,
                        delay,
                        forward_to,
                        strategy: 'round_robin',
                        error_rate: ep.error_rate ?? 0,
                        rate: 0,
                    };
                });
                data.dependencies = dependencies;
                break;
            }

            case 'api_gateway':
                data.dependencies = n.routes!.map((r, i) => {
                    const method = r.method.toUpperCase();
                    const depId = `dep-${n.id}-${i}`;
                    addEdge(n.id, depId, r.to, targetHandleFor(r.to, method, r.path));
                    return { id: depId, label: r.to, method, path: r.path };
                });
                break;

            case 'policy':
                data.rules = (n.rules ?? []).map(r => ({ ...r, status: r.status ?? 0, rate: r.rate ?? 0 }));
                data.default_effect = n.default_effect ?? 'deny';
                data.default_status = n.default_status ?? 0;
                break;

            case 'cache':
                data.cache_hit_rate = n.hit_rate ?? 0.8;
                break;

            case 'diagram':
                data.block = n.block;
                break;
        }

        if (!['client', 'server', 'api_gateway', 'diagram'].includes(n.type)) {
            for (const t of n.to ?? []) addEdge(n.id, undefined, t, targetHandleFor(t, 'GET', ''));
        }

        const prev = existingByAlias.get(n.id);
        return {
            ...(prev?.type === n.type ? prev : {}),
            id: ids.get(n.id)!,
            type: n.type,
            position: prev?.position ?? layout.get(n.id)!,
            data,
        } as Node;
    });

    return { nodes, edges, errors: [], warnings: collectWarnings(scene) };
}

/** Hops on the longest route traffic can take from a client, for timing a full round trip. */
export function longestRouteHops(nodes: Node[], edges: Edge[]): number {
    const walk = (id: string, seen: Set<string>): number => {
        let best = 0;
        for (const e of edges) {
            if (e.source !== id || seen.has(e.target)) continue;
            best = Math.max(best, 1 + walk(e.target, new Set(seen).add(e.target)));
        }
        return best;
    };
    return Math.max(0, ...nodes.filter(n => n.type === 'client').map(n => walk(n.id, new Set([n.id]))));
}

// ─── Decompile: read the live canvas back as a scene ─────────────────────────────────────────

export function sceneFromCanvas(nodes: Node[], edges: Edge[]): SceneNode[] {
    const aliasById = new Map(nodes.map(n => [n.id, aliasOf(n)]));
    const edgeFromHandle = (nodeId: string, handle: string) =>
        edges.find(e => e.source === nodeId && e.sourceHandle === handle);
    const targetAlias = (nodeId: string, handle: string) => {
        const edge = edgeFromHandle(nodeId, handle);
        return edge ? aliasById.get(edge.target) : undefined;
    };

    return nodes.flatMap((node): SceneNode[] => {
        if (!SCENE_NODE_TYPES.includes(node.type as SceneNodeType)) return [];
        const data = node.data as Record<string, any>;
        const out: SceneNode = { id: aliasOf(node), type: node.type as SceneNodeType };
        if (data.label) out.label = data.label;

        switch (node.type) {
            case 'client':
                out.streams = (data.streams ?? []).map((s: any) => {
                    const stream: SceneStream = { method: s.method, path: s.path, rate: s.rate };
                    if (s.principal) stream.principal = s.principal;
                    if (s.retries) stream.retries = s.retries;
                    const to = targetAlias(node.id, s.id);
                    if (to) stream.to = to;
                    return stream;
                });
                break;

            case 'server': {
                const deps: any[] = data.dependencies ?? [];
                out.endpoints = (data.endpoints ?? []).map((ep: any) => {
                    const routes: any[] = Array.isArray(ep.forward_to) ? ep.forward_to : [];
                    const endpoint: SceneEndpoint = { method: ep.method, path: ep.path };
                    if (routes[0]) endpoint.rps = rpsFromDelay(routes[0].delay ?? 0);
                    if (ep.error_rate) endpoint.error_rate = ep.error_rate;
                    const calls: SceneCall[] = routes.flatMap(r => {
                        const dep = deps.find(d => d.id === r.target_id);
                        const to = dep && targetAlias(node.id, dep.id);
                        return to ? [{ to, method: dep.method, path: dep.path }] : [];
                    });
                    if (calls.length) endpoint.calls = calls;
                    return endpoint;
                });
                break;
            }

            case 'api_gateway':
                out.routes = (data.dependencies ?? []).flatMap((d: any) => {
                    const to = targetAlias(node.id, d.id);
                    return to ? [{ method: d.method ?? 'GET', path: d.path ?? '/', to }] : [];
                });
                break;

            case 'policy':
                out.rules = (data.rules ?? []).map((r: any) => {
                    const rule: PolicyRule = { principal: r.principal, method: r.method, path: r.path, effect: r.effect };
                    if (r.status) rule.status = r.status;
                    if (r.rate) rule.rate = r.rate;
                    return rule;
                });
                out.default_effect = data.default_effect ?? 'deny';
                if (data.default_status) out.default_status = data.default_status;
                break;

            case 'cache':
                out.hit_rate = data.cache_hit_rate;
                break;

            case 'diagram':
                out.block = data.block;
                break;
        }

        if (!['client', 'server', 'api_gateway', 'diagram'].includes(node.type!)) {
            const to = edges.filter(e => e.source === node.id).flatMap(e => aliasById.get(e.target) ?? []);
            if (to.length) out.to = to;
        }
        if (data.buffer_capacity !== undefined && data.buffer_capacity !== DEFAULT_CAPACITY[out.type]) {
            out.capacity = data.buffer_capacity;
        }
        if (node.type === 'database' || node.type === 'cache') {
            if (data.processing_delay !== undefined) out.rps = rpsFromDelay(data.processing_delay);
        }
        return [out];
    });
}

// ─── Patches ─────────────────────────────────────────────────────────────────────────────────

/** Fields replace wholesale, so changing one rule means sending the full `rules` list. */
export function applyPatch(scene: SceneNode[], patch: ScenePatch): { scene: SceneNode[]; errors: string[] } {
    const errors: string[] = [];
    const removed = new Set(patch.remove ?? []);
    for (const id of removed) {
        if (!scene.some(n => n.id === id)) errors.push(`remove: unknown node "${id}".`);
    }

    let next = scene
        .filter(n => !removed.has(n.id))
        .map(n => {
            const update = patch.update?.find(u => u.id === n.id);
            return update ? { ...n, ...update, id: n.id, type: update.type ?? n.type } : n;
        });

    for (const u of patch.update ?? []) {
        if (!scene.some(n => n.id === u.id)) errors.push(`update: unknown node "${u.id}".`);
        else if (removed.has(u.id)) errors.push(`update: node "${u.id}" is also being removed.`);
    }

    if (removed.size) {
        // Drop references to removed nodes rather than making the tutor rewire every sender.
        next = next.map(n => {
            const copy = { ...n };
            if (copy.to) copy.to = copy.to.filter(t => !removed.has(t));
            if (copy.routes) copy.routes = copy.routes.filter(r => !removed.has(r.to));
            if (copy.streams) {
                copy.streams = copy.streams.map(s => {
                    if (!s.to || !removed.has(s.to)) return s;
                    return { ...s, to: undefined };
                });
            }
            if (copy.endpoints) {
                copy.endpoints = copy.endpoints.map(e => ({
                    ...e,
                    ...(e.calls ? { calls: e.calls.filter(c => !removed.has(c.to)) } : {}),
                }));
            }
            return copy;
        });
    }

    for (const a of patch.add ?? []) {
        if (next.some(n => n.id === a?.id)) errors.push(`add: node "${a.id}" already exists.`);
        else next.push(a);
    }
    return { scene: next, errors };
}
