import { describe, expect, it } from 'vitest';
import { applyPatch, compileScene, longestRouteHops, sceneFromCanvas, validateScene, type SceneNode } from './scene';
import { validateLesson } from './lesson';
import { ACL_DEMO_LESSON, ACL_DEMO_SCENE } from './demoLesson';

function allocator() {
    let n = 0;
    return (type: string) => `${type}_${n++}`;
}

const compile = (scene: SceneNode[], existing?: any[]) =>
    compileScene(scene, { allocId: allocator(), existing });

const basic: SceneNode[] = [
    { id: 'alice', type: 'client', streams: [{ method: 'get', path: '/x', principal: 'alice', to: 'gate' }] },
    { id: 'gate', type: 'policy', rules: [{ principal: 'alice', method: '*', path: '*', effect: 'allow' }], to: ['api'] },
    { id: 'api', type: 'server', endpoints: [{ method: 'GET', path: '/x', calls: [{ to: 'db' }] }, { method: 'POST', path: '/x' }] },
    { id: 'db', type: 'database' },
];

describe('compileScene', () => {
    it('gives nodes engine-safe ids, whatever the alias says', () => {
        const scene: SceneNode[] = [
            { id: 'server_client_app', type: 'database' },
            { id: 'client_cache', type: 'client', streams: [{ method: 'GET', path: '/', to: 'server_client_app' }] },
        ];
        const { nodes, errors } = compile(scene);
        expect(errors).toEqual([]);
        const db = nodes.find(n => n.data.alias === 'server_client_app')!;
        // The engine would read "server_client_app" as a client: its id must not contain that.
        expect(db.id).toMatch(/^database_\d+$/);
        expect(nodes.find(n => n.data.alias === 'client_cache')!.id).toMatch(/^client_\d+$/);
    });

    it('wires client streams, policy, server endpoints and dependencies to exact handles', () => {
        const { nodes, edges, errors, warnings } = compile(basic);
        expect(errors).toEqual([]);
        expect(warnings).toEqual([]);

        const id = (alias: string) => nodes.find(n => n.data.alias === alias)!.id;
        const stream = (nodes.find(n => n.data.alias === 'alice')!.data.streams as any[])[0];
        expect(stream).toMatchObject({ method: 'GET', is_write: false, weight: 1, principal: 'alice', rate: 1 });

        expect(edges).toContainEqual(expect.objectContaining({ source: id('alice'), sourceHandle: stream.id, target: id('gate') }));
        expect(edges).toContainEqual(expect.objectContaining({ source: id('gate'), target: id('api'), targetHandle: 'ep-api-0' }));
        expect(edges).toContainEqual(expect.objectContaining({ source: id('api'), sourceHandle: 'dep-api-0-0', target: id('db') }));

        const api = nodes.find(n => n.data.alias === 'api')!.data as any;
        expect(api.endpoints[0].forward_to[0].target_id).toBe('dep-api-0-0');
        // An endpoint that calls nothing has to reply, or the engine 404s it.
        expect(api.endpoints[1].forward_to[0].target_id).toBe('__return__');
    });

    it('produces every required TrafficStream field, since a missing one is silently ignored', () => {
        const { nodes } = compile(basic);
        const stream = (nodes.find(n => n.type === 'client')!.data.streams as any[])[0];
        for (const field of ['id', 'label', 'is_write', 'weight', 'method', 'path']) {
            expect(stream[field]).toBeDefined();
        }
    });

    it('keeps ids and positions when recompiling, so a data change does not rebuild the simulation', () => {
        const first = compile(basic);
        const moved = first.nodes.map(n => ({ ...n, position: { x: 999, y: 999 } }));
        const second = compile(basic, moved);
        expect(second.nodes.map(n => n.id)).toEqual(first.nodes.map(n => n.id));
        expect(second.nodes[0].position).toEqual({ x: 999, y: 999 });
    });

    it('assigns a new id when a node changes type', () => {
        const first = compile([{ id: 'a', type: 'database' }]);
        const second = compile([{ id: 'a', type: 'cache' }], first.nodes);
        expect(second.nodes[0].id).toMatch(/^cache_/);
    });

    it('lays out left to right without overlapping columns', () => {
        const { nodes } = compile(basic);
        const x = (alias: string) => nodes.find(n => n.data.alias === alias)!.position.x;
        expect(x('alice')).toBeLessThan(x('gate'));
        expect(x('gate')).toBeLessThan(x('api'));
        expect(x('api')).toBeLessThan(x('db'));
    });

    it('survives cycles in layout', () => {
        const scene: SceneNode[] = [
            { id: 'a', type: 'load_balancer', to: ['b'] },
            { id: 'b', type: 'load_balancer', to: ['a'] },
        ];
        expect(compile(scene).errors).toEqual([]);
    });

    it('places diagram cards beneath traffic and never wires them', () => {
        const scene: SceneNode[] = [
            ...basic,
            { id: 'card', type: 'diagram', block: { kind: 'text', text: 'hello' } },
        ];
        const { nodes, edges } = compile(scene);
        const card = nodes.find(n => n.data.alias === 'card')!;
        expect(edges.some(e => e.source === card.id || e.target === card.id)).toBe(false);
        expect(card.position.y).toBeGreaterThan(Math.max(...nodes.filter(n => n !== card).map(n => n.position.y)));
    });

    it('warns about wiring that will fail, without blocking it', () => {
        const scene: SceneNode[] = [
            { id: 'c', type: 'client', streams: [{ method: 'GET', path: '/missing', to: 'gw' }, { method: 'GET', path: '/ok', to: 'gw' }] },
            { id: 'gw', type: 'load_balancer', to: ['s'] },
            { id: 's', type: 'server', endpoints: [{ method: 'GET', path: '/ok' }] },
        ];
        const { errors, warnings } = compile(scene);
        expect(errors).toEqual([]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('/missing');
        expect(warnings[0]).toContain('404');
    });
});

describe('validateScene', () => {
    const cases: [string, unknown, string][] = [
        ['non-array', {}, 'must be an array'],
        ['bad alias', [{ id: 'has space', type: 'cache' }], 'Invalid node id'],
        ['duplicate', [{ id: 'a', type: 'cache' }, { id: 'a', type: 'cache' }], 'Duplicate'],
        ['unknown type', [{ id: 'a', type: 'mainframe' }], 'unknown type'],
        ['client with no streams', [{ id: 'a', type: 'client' }], 'at least one stream'],
        ['server with no endpoints', [{ id: 'a', type: 'server' }], 'at least one endpoint'],
        ['dangling target', [{ id: 'a', type: 'client', streams: [{ method: 'GET', path: '/', to: 'nope' }] }], 'unknown node'],
        ['traffic to a diagram', [
            { id: 'a', type: 'load_balancer', to: ['d'] },
            { id: 'd', type: 'diagram', block: { kind: 'text', text: 'x' } },
        ], "isn't simulated"],
        ['bad method', [{ id: 'a', type: 'client', streams: [{ method: 'FETCH', path: '/' }] }], 'method must be'],
        ['bad path', [{ id: 'a', type: 'client', streams: [{ method: 'GET', path: 'x' }] }], 'path must start'],
        ['excessive rate', [{ id: 'a', type: 'client', streams: [{ method: 'GET', path: '/', rate: 500 }] }], 'rate must be'],
        ['limit without rate', [{ id: 'a', type: 'policy', rules: [{ principal: '*', method: '*', path: '*', effect: 'limit' }] }], 'positive "rate"'],
        ['bad effect', [{ id: 'a', type: 'policy', rules: [{ principal: '*', method: '*', path: '*', effect: 'maybe' }] }], 'effect must be'],
        ['diagram without block', [{ id: 'a', type: 'diagram' }], 'needs a "block"'],
        ['uneven table', [{ id: 'a', type: 'diagram', block: { kind: 'table', columns: ['x', 'y'], rows: [['1']] } }], 'must have 2 cells'],
        ['duplicate tree id', [{ id: 'a', type: 'diagram', block: { kind: 'tree', root: { id: 'r', label: 'r', children: [{ id: 'r', label: 'c' }] } } }], 'duplicate tree'],
        ['sequence stranger', [{ id: 'a', type: 'diagram', block: { kind: 'sequence', actors: ['x'], messages: [{ from: 'x', to: 'y', label: 'hi' }] } }], 'between listed actors'],
    ];

    it.each(cases)('rejects %s', (_name, scene, expected) => {
        expect(validateScene(scene).join('\n')).toContain(expected);
    });

    it('does not throw on junk input from a truncated model response', () => {
        for (const junk of [[null], [{}], [{ id: 'a', type: 'client', streams: [null] }], [{ id: 'a', type: 'server', endpoints: [null] }], [{ id: 'a', type: 'policy', rules: [null] }], [{ id: 'a', type: 'diagram', block: { kind: 'tree' } }]]) {
            expect(() => validateScene(junk)).not.toThrow();
            expect(validateScene(junk).length).toBeGreaterThan(0);
        }
    });
});

describe('sceneFromCanvas', () => {
    it('round-trips: decompiling and recompiling gives the same canvas', () => {
        for (const scene of [basic, ACL_DEMO_SCENE]) {
            const first = compile(scene);
            const decompiled = sceneFromCanvas(first.nodes, first.edges);
            const second = compile(decompiled, first.nodes);
            expect(second.errors).toEqual([]);
            expect(second.edges).toEqual(first.edges);
            expect(second.nodes.map(n => n.data)).toEqual(first.nodes.map(n => n.data));
        }
    });

    it('reads a hand-drawn canvas with no aliases', () => {
        const nodes: any[] = [
            { id: 'client_5', type: 'client', position: { x: 0, y: 0 }, data: { label: 'C', streams: [{ id: 'st', method: 'GET', path: '/', rate: 5 }] } },
            { id: 'server_6', type: 'server', position: { x: 0, y: 0 }, data: { label: 'S', endpoints: [{ id: 'in', method: 'GET', path: '/', forward_to: [{ target_id: '__return__', delay: 12 }] }], dependencies: [] } },
        ];
        const edges: any[] = [{ id: 'e', source: 'client_5', sourceHandle: 'st', target: 'server_6', targetHandle: 'in' }];
        const scene = sceneFromCanvas(nodes, edges);
        expect(scene[0]).toMatchObject({ id: 'client_5', streams: [{ method: 'GET', to: 'server_6' }] });
        expect(scene[1]).toMatchObject({ id: 'server_6', endpoints: [{ method: 'GET', path: '/', rps: 5 }] });
        const { errors, nodes: compiled } = compile(scene, nodes);
        expect(errors).toEqual([]);
        expect(compiled.map(n => n.id)).toEqual(['client_5', 'server_6']);
    });
});

describe('longestRouteHops', () => {
    it('counts the longest path from a client', () => {
        const { nodes, edges } = compile(basic);
        expect(longestRouteHops(nodes, edges)).toBe(3);
    });

    it('terminates on cycles and handles a scene with no traffic', () => {
        const cycle = compile([
            { id: 'c', type: 'client', streams: [{ method: 'GET', path: '/', to: 'a' }] },
            { id: 'a', type: 'load_balancer', to: ['b'] },
            { id: 'b', type: 'load_balancer', to: ['a'] },
        ]);
        expect(longestRouteHops(cycle.nodes, cycle.edges)).toBe(2);
        expect(longestRouteHops([], [])).toBe(0);
    });
});

describe('applyPatch', () => {
    it('adds, updates and removes', () => {
        const { scene, errors } = applyPatch(basic, {
            add: [{ id: 'cache', type: 'cache' }],
            update: [{ id: 'gate', label: 'New' }],
            remove: ['db'],
        });
        expect(errors).toEqual([]);
        expect(scene.map(n => n.id)).toEqual(['alice', 'gate', 'api', 'cache']);
        expect(scene.find(n => n.id === 'gate')!.label).toBe('New');
    });

    it('drops references to removed nodes so the scene still validates', () => {
        const { scene, errors } = applyPatch(basic, { remove: ['db', 'gate'] });
        expect(errors).toEqual([]);
        expect(validateScene(scene)).toEqual([]);
        expect(scene.find(n => n.id === 'alice')!.streams![0].to).toBeUndefined();
        expect(scene.find(n => n.id === 'api')!.endpoints![0].calls).toEqual([]);
    });

    it('reports unknown ids and duplicates', () => {
        const { errors } = applyPatch(basic, {
            update: [{ id: 'ghost', label: 'x' }],
            remove: ['phantom'],
            add: [{ id: 'db', type: 'cache' }],
        });
        expect(errors).toHaveLength(3);
    });
});

describe('validateLesson', () => {
    const step = { title: 't', body: 'b' };

    it('accepts the built-in ACL lesson', () => {
        expect(validateScene(ACL_DEMO_SCENE)).toEqual([]);
        expect(compile(ACL_DEMO_SCENE).warnings).toEqual([]);
        expect(validateLesson(ACL_DEMO_LESSON, ACL_DEMO_SCENE).errors).toEqual([]);
    });

    it('requires exactly one correct prediction option', () => {
        const options = [{ text: 'a', correct: true }, { text: 'b', correct: true }];
        const { errors } = validateLesson({ steps: [{ ...step, predict: { question: 'q', options, explanation: 'e' } }] }, basic);
        expect(errors.join()).toContain('exactly one');
    });

    it('catches bad changes and highlights before the lesson starts', () => {
        const { errors } = validateLesson({
            steps: [{ ...step, changes: { update: [{ id: 'ghost', label: 'x' }] }, highlight: ['nobody'] }],
        }, basic);
        expect(errors.join()).toContain('unknown node "ghost"');
        expect(errors.join()).toContain('unknown node "nobody"');
    });

    it('checks later steps against the scene earlier steps produced', () => {
        const added = { id: 'extra', type: 'cache' as const, to: ['db'] };
        expect(validateLesson({ steps: [{ ...step, changes: { add: [added] } }, { ...step, highlight: ['extra:0'] }] }, basic).errors).toEqual([]);
        expect(validateLesson({ steps: [{ ...step, highlight: ['extra'] }, { ...step, changes: { add: [added] } }] }, basic).errors).not.toEqual([]);
    });

    it('rejects an empty lesson', () => {
        expect(validateLesson({ steps: [] }, basic).errors).not.toEqual([]);
        expect(validateLesson(null, basic).errors).not.toEqual([]);
    });
});
