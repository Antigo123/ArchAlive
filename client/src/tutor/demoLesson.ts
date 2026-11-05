import type { Lesson } from './lesson';
import type { SceneNode } from './scene';

/** A hand-written lesson that needs no API key. It also shows the intended lesson shape. */
export const ACL_DEMO_SCENE: SceneNode[] = [
    {
        id: 'alice', type: 'client', label: 'Alice (editor)',
        streams: [
            { method: 'GET', path: '/docs', rate: 1, principal: 'alice', to: 'acl' },
            { method: 'POST', path: '/docs', rate: 1, principal: 'alice', to: 'acl' },
        ],
    },
    {
        id: 'bob', type: 'client', label: 'Bob (viewer)',
        streams: [
            { method: 'GET', path: '/docs', rate: 1, principal: 'bob', to: 'acl' },
            { method: 'POST', path: '/docs', rate: 1, principal: 'bob', to: 'acl' },
        ],
    },
    {
        id: 'acl', type: 'policy', label: 'ACL on /docs',
        rules: [
            { principal: 'alice', method: '*', path: '/docs', effect: 'allow' },
            { principal: 'bob', method: 'GET', path: '/docs', effect: 'allow' },
        ],
        default_effect: 'deny',
        to: ['api'],
    },
    {
        id: 'api', type: 'server', label: 'Docs API',
        endpoints: [
            { method: 'GET', path: '/docs' },
            { method: 'POST', path: '/docs' },
        ],
    },
];

export const ACL_DEMO_LESSON: Lesson = {
    title: 'Access control lists',
    steps: [
        {
            title: 'A list attached to the resource',
            body: 'An **access control list (ACL)** is a list attached to a resource, saying who may do what to it. Here, every request to `/docs` passes through this one. Each row names a *who*, an *action* and a *resource*.\n\nThe counts on each row show how many requests that rule has decided.',
            highlight: ['acl'],
        },
        {
            title: 'A request nothing mentions',
            body: 'Alice has a rule covering every method on `/docs`. Bob has a rule too, but it only names `GET`.',
            highlight: ['bob', 'acl:1'],
            predict: {
                question: "Bob sends `POST /docs`. No rule mentions Bob and POST together. What does he get?",
                options: [
                    { text: '200: he has a rule for /docs, so he gets in', correct: false },
                    { text: '403: nothing allows it, so it is denied at the ACL', correct: true },
                    { text: '404: the API has no route for him', correct: false },
                ],
                explanation: "**Nothing matched, so the default applied.** A rule has to match the who, the action *and* the resource. Most ACLs deny by default: anything not explicitly allowed is refused, so a forgotten rule fails closed. Watch Bob's POSTs turn red at the ACL. They never reach the API, so it doesn't spend any work on them.",
            },
        },
        {
            title: 'Order matters',
            body: 'ACLs are read top to bottom, and the **first matching rule wins**. Say we want to block Bob, so we add a deny rule. We put it *below* his existing allow.',
            highlight: ['acl'],
            predict: {
                question: 'Rule 2 still allows Bob `GET /docs`. Rule 3 now denies Bob everything. What happens to his GETs?',
                options: [
                    { text: "They succeed: rule 2 matches first, so rule 3 is never reached", correct: true },
                    { text: 'They fail: a deny always beats an allow', correct: false },
                    { text: 'About half succeed, as the two rules conflict', correct: false },
                ],
                explanation: "**First match wins, and evaluation stops there.** Rule 3 never sees Bob's GETs, so its count only grows from his POSTs. This is the classic ACL bug: a deny that looks right but sits below a broader allow. Some systems do let deny override allow (AWS IAM does), so check which model yours uses.",
            },
            changes: {
                update: [{
                    id: 'acl',
                    rules: [
                        { principal: 'alice', method: '*', path: '/docs', effect: 'allow' },
                        { principal: 'bob', method: 'GET', path: '/docs', effect: 'allow' },
                        { principal: 'bob', method: '*', path: '*', effect: 'deny' },
                    ],
                }],
            },
        },
        {
            title: 'Fix it by moving the rule',
            body: 'Same three rules, different order: the deny moves to the top.',
            highlight: ['acl:0', 'bob'],
            predict: {
                question: 'With the deny rule first, what happens to Alice?',
                options: [
                    { text: 'Still works: the deny only matches Bob, so she falls through to her allow', correct: true },
                    { text: 'Blocked: a deny at the top blocks everyone', correct: false },
                ],
                explanation: "**A rule only applies to requests it matches.** Alice doesn't match `bob`, so evaluation moves on to her allow. Bob is now fully blocked, and that's a real access revocation done by editing one list. Notice this list lives on the resource: to see who can reach `/docs`, you read one place. To see everything Bob can reach, you'd have to check every resource's list. That trade-off is what pushes larger systems towards roles (RBAC).",
            },
            changes: {
                update: [{
                    id: 'acl',
                    rules: [
                        { principal: 'bob', method: '*', path: '*', effect: 'deny' },
                        { principal: 'alice', method: '*', path: '/docs', effect: 'allow' },
                        { principal: 'bob', method: 'GET', path: '/docs', effect: 'allow' },
                    ],
                }],
            },
        },
        {
            title: 'Your turn',
            body: 'Click the ACL node to edit its rules yourself: reorder them, change the default to `allow`, or rate-limit Alice with a `limit` rule. Traffic responds right away.\n\nAsk the tutor anything about what you see.',
        },
    ],
    follow_ups: [
        'How is an ACL different from RBAC?',
        'Where do real systems keep their ACLs?',
        'Why does AWS IAM let deny override allow?',
    ],
};
