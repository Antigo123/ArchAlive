import type { Puzzle } from './types';

export const PUZZLES: Puzzle[] = [
    // ============================================
    // CHAPTER 1: COMPONENTS
    // ============================================

    // Tutorial 1: Client & Server - Interactive Tutorial
    {
        id: 'tutorial-01',
        title: 'Tutorial 1: Hello World',
        description: 'Build your first system! Create a Client and Server, then connect them.',
        difficulty: 'Easy',
        initialState: {
            nodes: [],  // Empty canvas - user builds from scratch!
            edges: [],
            viewport: { x: 300, y: 220, zoom: 0.65 }
        },
        winConditions: [
            {
                metric: 'total_processed',
                operator: '>=',
                value: 10,
                description: 'Process 10 requests',
                holdDurationSeconds: 1
            }
        ],
        permissions: {
            allowedNodes: ['client', 'server'],
            editableFields: ['client.streams', 'server.endpoints']
        },
        tutorialSteps: [
            {
                id: 'step-1',
                title: 'Step 1: Add a Client',
                hint: 'Drag a Client node from the sidebar onto the canvas (on mobile, tap + Components)',
                condition: 'node_added',
                conditionParams: { nodeType: 'client' }
            },
            {
                id: 'step-2',
                title: 'Step 2: Add a Server',
                hint: '👈 Now drag a Server node to the right of the Client',
                condition: 'node_added',
                conditionParams: { nodeType: 'server' }
            },
            {
                id: 'step-3',
                title: 'Step 3: Connect Them',
                hint: '🔗 Drag from the Client\'s right handle to the Server\'s left handle',
                condition: 'edge_added'
            },
            {
                id: 'step-4',
                title: 'Step 4: Watch the Magic!',
                hint: '✨ Traffic is flowing! Wait for 10 requests to complete.',
                condition: 'traffic_flowing'
            }
        ]
    },

    // Tutorial 2: Database - Interactive Tutorial
    {
        id: 'tutorial-02',
        title: 'Tutorial 2: Data Persistence',
        description: 'Build a profile service: a client sends save requests, a server receives them and forwards them to a database. Learn how to wire server logic.',
        difficulty: 'Easy',
        initialState: {
            nodes: [],
            edges: [],
            viewport: { x: 250, y: 200, zoom: 0.8 }
        },
        winConditions: [
            {
                metric: 'node_type_processed',
                nodeType: 'database',
                operator: '>=',
                value: 10,
                description: 'Save 10 profile requests to the database',
                holdDurationSeconds: 1
            }
        ],
        permissions: {
            allowedNodes: ['client', 'server', 'database'],
            editableFields: ['client.streams', 'server.endpoints', 'server.dependencies']
        },
        tutorialSteps: [
            {
                id: 'step-1',
                title: 'Add the Components',
                hint: 'Add a Client, a Server, and a Database to the canvas — drag from the sidebar, or tap + Components on mobile.',
                condition: 'all_nodes_added',
                conditionParams: { nodeTypes: ['client', 'server', 'database'] }
            },
            {
                id: 'step-2',
                title: 'Set Up the Client Request',
                hint: 'Click the Client to open its inspector. Change the stream method to POST and the path to /profile. This defines what requests the client will send.',
                condition: 'url_configured',
                conditionParams: { path: '/profile', method: 'POST', nodeType: 'client' }
            },
            {
                id: 'step-3',
                title: 'Connect Client to Server',
                hint: 'Drag from the Client\'s right handle to the Server\'s left handle. The client will now send its POST /profile requests to the server.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'client', targetType: 'server' }
            },
            {
                id: 'step-4',
                title: 'Add a Server Endpoint',
                hint: 'Click the Server to open its inspector. Click "Add Input" to create an endpoint - the server needs an input to accept incoming requests.',
                condition: 'endpoint_added',
                conditionParams: { nodeType: 'server', count: 1 }
            },
            {
                id: 'step-5',
                title: 'Add an Output to the Server',
                hint: 'Still in the Server inspector, click "Add Output". This creates a slot the server can forward requests through - you\'ll connect it to the Database next.',
                condition: 'dependency_added',
                conditionParams: { nodeType: 'server' }
            },
            {
                id: 'step-6',
                title: 'Delete the Return Reply Connection',
                hint: 'Click the Server to open its inspector. In the logic diagram, click the orange line going to "Return Reply" to select it - a toolbar appears at the bottom with a 🗑️ delete button. Click it (or press Delete) to remove it.',
                condition: 'return_removed'
            },
            {
                id: 'step-7',
                title: 'Connect Input to Output',
                hint: 'Now drag a new connection from the Input node to the Output node. This tells the server to forward requests to the database instead of replying immediately.',
                condition: 'forwarding_configured'
            },
            {
                id: 'step-8',
                title: 'Connect Server to Database',
                hint: 'Back on the canvas, drag from the Server\'s output handle to the Database.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'server', targetType: 'database' },
                highlight: { selector: '.react-flow__node-server', arrow: 'right' }
            },
            {
                id: 'step-9',
                title: 'Watch the Data Flow',
                hint: 'Requests now travel Client → Server → Database. Watch the packets move along both connections!',
                condition: 'traffic_flowing'
            }
        ]
    },

    // Tutorial 3: Cache - Interactive Tutorial
    {
        id: 'tutorial-03',
        title: 'Tutorial 3: Speed It Up!',
        description: 'Your system is live but slow - every request waits on the database. Check the latency in the Metrics panel, then add a Cache to serve most reads instantly.',
        difficulty: 'Medium',
        initialState: {
            nodes: [
                {
                    id: 'tut3-client',
                    type: 'client',
                    position: { x: 50, y: 300 },
                    data: {
                        label: 'Client',
                        streams: [{ id: 'tut3-s1', label: 'Get Product', is_write: false, weight: 1, method: 'GET', path: '/product', rate: 3 }]
                    }
                },
                {
                    id: 'tut3-server',
                    type: 'server',
                    position: { x: 400, y: 300 },
                    data: {
                        label: 'Server',
                        processing_delay: 5,
                        buffer_capacity: 50,
                        endpoints: [{
                            id: 'tut3-ep1',
                            method: 'GET',
                            path: '/product',
                            forward_to: [{ target_id: 'tut3-dep-db', delay: 5 }],
                            strategy: 'round_robin',
                            error_rate: 0,
                            rate: 0
                        }],
                        dependencies: [{
                            id: 'tut3-dep-db',
                            label: 'Database',
                            method: 'GET',
                            path: '/product'
                        }]
                    }
                },
                {
                    id: 'tut3-database',
                    type: 'database',
                    position: { x: 1000, y: 300 },
                    data: {
                        label: 'Database',
                        processing_delay: 20,
                        buffer_capacity: 100
                    }
                }
            ],
            edges: [
                {
                    id: 'tut3-e-cs',
                    source: 'tut3-client',
                    target: 'tut3-server',
                    sourceHandle: 'tut3-s1'
                },
                {
                    id: 'tut3-e-sd',
                    source: 'tut3-server',
                    target: 'tut3-database',
                    sourceHandle: 'tut3-dep-db'
                }
            ],
            viewport: { x: 80, y: 100, zoom: 0.85 }
        },
        winConditions: [
            {
                metric: 'avg_latency',
                operator: '<',
                value: 8,
                description: 'Average response time under 8s',
                holdDurationSeconds: 3
            },
            {
                metric: 'total_dropped',
                operator: '<=',
                value: 0,
                description: 'Keep availability at 100% - no dropped requests',
                holdDurationSeconds: 3
            }
        ],
        permissions: {
            allowedNodes: ['cache'],
            editableFields: ['cache.cache_hit_rate']
        },
        tutorialSteps: [
            {
                id: 'step-1',
                title: 'Notice the Latency',
                hint: 'The system is already running. Open the Metrics panel (top right) and note the latency - every request waits on the database. Add a Cache node to fix this.',
                condition: 'node_added',
                conditionParams: { nodeType: 'cache' }
            },
            {
                id: 'step-2',
                title: 'Reroute Through the Cache',
                hint: 'Delete the Server→Database connection (click to select then press Delete, or right-click it and choose Delete). Then drag from the Server\'s output handle to the Cache.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'server', targetType: 'cache' },
                highlight: { selector: '__none__', arrow: null }
            },
            {
                id: 'step-3',
                title: 'Connect Cache to Database',
                hint: 'Drag from the Cache\'s output to the Database. Cache misses (20%) will fall through here.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'cache', targetType: 'database' },
                highlight: { selector: '__none__', arrow: null }
            },
            {
                id: 'step-4',
                title: 'Watch the Improvement',
                hint: '80% of reads now serve instantly from cache. Watch the latency drop in the Metrics panel!',
                condition: 'traffic_flowing'
            }
        ]
    },

    // Tutorial 4: Load Balancer - Interactive Tutorial
    {
        id: 'tutorial-04',
        title: 'Tutorial 4: Scale It Out!',
        description: 'Your server is overwhelmed - 10 req/s arriving but it can only handle 5. Add a Load Balancer and two servers to share the load.',
        difficulty: 'Medium',
        initialState: {
            nodes: [
                {
                    id: 'tut4-client',
                    type: 'client',
                    position: { x: 50, y: 300 },
                    data: {
                        label: 'Client',
                        streams: [{ id: 'tut4-s1', label: 'API Request', is_write: false, weight: 1, method: 'GET', path: '/api', rate: 10 }]
                    }
                },
                {
                    id: 'tut4-server',
                    type: 'server',
                    position: { x: 800, y: 300 },
                    data: {
                        label: 'Server',
                        processing_delay: 12,
                        buffer_capacity: 40,
                        endpoints: [{
                            id: 'tut4-ep1',
                            method: 'GET',
                            path: '/api',
                            forward_to: [{ target_id: '__return__', delay: 12 }],
                            strategy: 'round_robin',
                            error_rate: 0,
                            rate: 5
                        }],
                        dependencies: []
                    }
                }
            ],
            edges: [
                {
                    id: 'tut4-e-cs',
                    source: 'tut4-client',
                    target: 'tut4-server',
                    sourceHandle: 'tut4-s1'
                }
            ],
            viewport: { x: 80, y: 150, zoom: 0.85 }
        },
        winConditions: [
            {
                metric: 'node_type_processed',
                nodeType: 'load_balancer',
                operator: '>=',
                value: 30,
                description: 'Route 30 requests through the load balancer',
                holdDurationSeconds: 2
            }
        ],
        permissions: {
            allowedNodes: ['server', 'load_balancer'],
            editableFields: ['server.endpoints']
        },
        tutorialSteps: [
            {
                id: 'step-1',
                title: 'The Server Is Overwhelmed',
                hint: 'The client sends 10 req/s but the server can only handle 5. Watch the dropped packets - it\'s struggling. We need to spread the load across multiple servers.',
                condition: 'drops_observed'
            },
            {
                id: 'step-2',
                title: 'Add a Load Balancer',
                hint: '⚖️ Add a Load Balancer to the canvas (drag from the sidebar, or tap + Components on mobile) — place it between the Client and where the new servers will go.',
                condition: 'node_added',
                conditionParams: { nodeType: 'load_balancer' }
            },
            {
                id: 'step-3',
                title: 'Add One More Server',
                hint: '🖥️ Drag one more Server onto the canvas. Together with the existing one, they can handle the full 10 req/s - 5 each.',
                condition: 'node_added',
                conditionParams: { nodeType: 'server', count: 2 }
            },
            {
                id: 'step-4',
                title: 'Configure the New Server',
                hint: 'Click the new Server and update its endpoint to method GET and path /api.',
                condition: 'url_configured',
                conditionParams: { path: '/api', method: 'GET', nodeType: 'server', count: 2 }
            },
            {
                id: 'step-5',
                title: 'Connect Client to Load Balancer',
                hint: 'Delete the old Client→Server connection (click it, then press Delete or right-click → Delete). Then drag from the Client to the Load Balancer.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'client', targetType: 'load_balancer' }
            },
            {
                id: 'step-6',
                title: 'Connect Load Balancer to Both New Servers',
                hint: 'Drag from the Load Balancer to each of your two new Servers. You need two connections.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'load_balancer', targetType: 'server', count: 2 }
            },
            {
                id: 'step-7',
                title: 'Watch the Traffic Balance',
                hint: '✨ Traffic is now split evenly - 5 req/s to each server. No more drops!',
                condition: 'traffic_flowing'
            }
        ]
    },

    // Tutorial 5: API Gateway - Interactive Tutorial
    {
        id: 'tutorial-05',
        title: 'Tutorial 5: API Gateway',
        description: 'An API Gateway is a single entry point for all client traffic. It inspects each request\'s path and method, then routes it to the right backend service - so clients never need to know which service handles what.',
        difficulty: 'Medium',
        initialState: {
            nodes: [
                {
                    id: 'tut5-client',
                    type: 'client',
                    position: { x: 50, y: 250 },
                    data: {
                        label: 'Mobile App',
                        streams: [
                            { id: 'tut5-s-auth', label: 'Login', is_write: true, weight: 1, method: 'POST', path: '/api/v1/auth/login', rate: 2 },
                            { id: 'tut5-s-products', label: 'Browse Catalog', is_write: false, weight: 3, method: 'GET', path: '/api/v1/products', rate: 5 },
                            { id: 'tut5-s-orders', label: 'Order History', is_write: false, weight: 2, method: 'GET', path: '/api/v1/orders', rate: 3 }
                        ]
                    }
                },
                {
                    id: 'tut5-gateway',
                    type: 'api_gateway',
                    position: { x: 450, y: 250 },
                    data: {
                        label: 'API Gateway',
                        processing_delay: 3,
                        buffer_capacity: 150,
                        endpoints: [
                            {
                                id: 'tut5-ep-auth',
                                method: 'POST',
                                path: '/api/v1/auth/login',
                                forward_to: [{ target_id: 'tut5-dep-auth', delay: 3 }],
                                strategy: 'round_robin',
                                error_rate: 0,
                                rate: 2
                            },
                            {
                                id: 'tut5-ep-products',
                                method: 'GET',
                                path: '/api/v1/products',
                                forward_to: [{ target_id: 'tut5-dep-products', delay: 3 }],
                                strategy: 'round_robin',
                                error_rate: 0,
                                rate: 5
                            },
                            {
                                id: 'tut5-ep-orders',
                                method: 'GET',
                                path: '/api/v1/orders',
                                forward_to: [{ target_id: 'tut5-dep-orders', delay: 3 }],
                                strategy: 'round_robin',
                                error_rate: 0,
                                rate: 3
                            }
                        ],
                        dependencies: [
                            { id: 'tut5-dep-auth', label: 'Auth Service', method: 'POST', path: '/api/v1/auth/login' },
                            { id: 'tut5-dep-products', label: 'Product Service', method: 'GET', path: '/api/v1/products' },
                            { id: 'tut5-dep-orders', label: 'Order Service', method: 'GET', path: '/api/v1/orders' }
                        ]
                    }
                }
            ],
            edges: [],
            viewport: { x: 50, y: 80, zoom: 0.75 }
        },
        winConditions: [
            {
                metric: 'total_processed',
                operator: '>=',
                value: 20,
                description: 'Successfully route 20 requests through the gateway to the correct backend services',
                holdDurationSeconds: 2
            }
        ],
        permissions: {
            allowedNodes: ['server'],
            editableFields: ['server.endpoints']
        },
        tutorialSteps: [
            {
                id: 'step-1',
                title: 'Connect the App to the Gateway',
                hint: 'The API Gateway is a single entry point - all traffic flows into it regardless of request type. Drag an edge from each stream on the Mobile App to the gateway\'s input handle on the left. Connect all three streams.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'client', targetType: 'api_gateway', count: 3 },
                highlight: { selector: '[data-id="tut5-client"]', arrow: 'right' }
            },
            {
                id: 'step-2',
                title: 'Requests Are Dropping',
                hint: 'Traffic is reaching the gateway, but there are no backend services wired up yet. The gateway\'s routing table shows three routes - Auth, Products, and Orders - but each output is unconnected, so every request is dropped.',
                condition: 'drops_observed'
            },
            {
                id: 'step-3',
                title: 'Add Three Backend Services',
                hint: 'Drag three Servers onto the canvas - one for each route the gateway needs to forward to.',
                condition: 'node_added',
                conditionParams: { nodeType: 'server', count: 3 }
            },
            {
                id: 'step-4',
                title: 'Wire Up the Gateway Outputs',
                hint: 'Drag from each output handle on the gateway to a server. The connection automatically sets the server\'s endpoint to match the route - no manual configuration needed. Connect all three outputs.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'api_gateway', targetType: 'server', count: 3 },
                highlight: { selector: '[data-id="tut5-gateway"]', arrow: 'right' }
            },
            {
                id: 'step-5',
                title: 'Gateway Routing in Action',
                hint: 'Every request arrives at one front door and gets routed to the right service based on its path. The client never needs to know which service handles what - that\'s the API gateway pattern.',
                condition: 'traffic_flowing'
            }
        ]
    },

    // Tutorial 6: Message Queue - Burst Traffic Demo
    {
        id: 'tutorial-06',
        title: 'Tutorial 6: Handle the Bursts!',
        description: 'Build a system with a Message Queue and see first-hand how it buffers sudden traffic bursts - keeping requests alive even when your server is overwhelmed.',
        difficulty: 'Medium',
        initialState: {
            nodes: [],
            edges: [],
            viewport: { x: 150, y: 150, zoom: 1.0 }
        },
        winConditions: [],
        permissions: {
            allowedNodes: ['client', 'message_queue', 'server'],
            editableFields: ['client.streams', 'server.endpoints']
        },
        tutorialSteps: [
            {
                id: 'step-1',
                title: 'Build the System',
                hint: 'Drag a Client, a Message Queue, and a Server onto the canvas.',
                condition: 'all_nodes_added',
                conditionParams: { nodeTypes: ['client', 'message_queue', 'server'] }
            },
            {
                id: 'step-4',
                title: 'Connect Client → Queue → Server',
                hint: 'Wire them up: Client output → Queue input, then Queue output → Server input.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'message_queue', targetType: 'server' }
            },
            {
                id: 'step-5',
                title: 'Watch Normal Traffic',
                hint: 'The system is running smoothly at a low rate. Packets flow from the client, through the queue, and into the server. Notice the queue stays nearly empty.',
                condition: 'traffic_flowing'
            },
            {
                id: 'step-6',
                title: 'Trigger a Burst',
                hint: 'Click the Client and raise the stream rate to 15 req/s to simulate a sudden spike.',
                condition: 'field_configured',
                conditionParams: { field: 'streams.0.rate', value: 15, nodeType: 'client' }
            },
            {
                id: 'step-7',
                title: 'Watch the Queue Fill Up',
                hint: 'The server can\'t keep pace with 15 req/s - the queue is absorbing the overflow. Once the queue hits its limit, new requests start dropping. This is the burst in action.',
                condition: 'drops_observed'
            },
            {
                id: 'step-8',
                title: 'Ease Off the Throttle',
                hint: 'Set the client rate back to 3 req/s. The burst is over - watch the queue drain as the server catches up on the backlog.',
                condition: 'field_configured',
                conditionParams: { field: 'streams.0.rate', value: 3, nodeType: 'client' }
            },
            {
                id: 'step-9',
                title: 'System Recovered',
                hint: 'The queue has drained and traffic is flowing smoothly again. The queue bought the server time to work through the spike - without it, every burst request would have been dropped immediately.',
                condition: 'traffic_flowing'
            }
        ]
    },

    // Tutorial 7: Topics - Interactive Tutorial
    {
        id: 'tutorial-07',
        title: 'Tutorial 7: Broadcast Events!',
        description: 'Learn to use Topics (Pub/Sub) to broadcast one event to multiple subscriber backends.',
        difficulty: 'Hard',
        initialState: {
            nodes: [],  // Empty canvas!
            edges: [],
            viewport: { x: 50, y: 100, zoom: 0.8 }
        },
        winConditions: [
            {
                metric: 'total_processed',
                operator: '>=',
                value: 20,
                description: 'Broadcast events to 2+ services (20 total)',
                holdDurationSeconds: 2
            }
        ],
        permissions: {
            allowedNodes: ['client', 'server', 'topic'],
            editableFields: ['client.streams', 'server.endpoints', 'server.dependencies']
        },
        tutorialSteps: [
            {
                id: 'step-1',
                title: 'Build the System',
                hint: 'Drag a Client, a Topic, and two Servers onto the canvas.',
                condition: 'node_added',
                conditionParams: { count: 4 }
            },
            {
                id: 'step-2',
                title: 'Configure the Publisher',
                hint: 'Click the Client and set the stream method to POST and path to /notify.',
                condition: 'url_configured',
                conditionParams: { path: '/notify', method: 'POST', nodeType: 'client' }
            },
            {
                id: 'step-3',
                title: 'Configure Both Subscribers',
                hint: 'Click each Server and add an endpoint with method POST and path /notify. Both servers need the same endpoint.',
                condition: 'url_configured',
                conditionParams: { path: '/notify', method: 'POST', nodeType: 'server', count: 2 }
            },
            {
                id: 'step-4',
                title: 'Connect Client to Topic',
                hint: 'Drag from the Client\'s output handle to the Topic input.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'client', targetType: 'topic' }
            },
            {
                id: 'step-5',
                title: 'Connect Topic to Both Servers',
                hint: 'Drag from the Topic output to each Server. The Topic will fan every incoming event out to all connected servers.',
                condition: 'edge_added',
                conditionParams: { sourceType: 'topic', targetType: 'server', count: 2 }
            },
            {
                id: 'step-6',
                title: 'Watch the Broadcast',
                hint: 'Every event published by the Client is delivered to both Servers simultaneously - one publish, two deliveries. That is the Pub/Sub pattern.',
                condition: 'traffic_flowing'
            }
        ]
    },

    // ============================================
    // TEMPLATES: E-COMMERCE ARCHITECTURE
    // ============================================

    // E-Commerce Platform - Full microservices architecture
    {
        id: 'template-ecommerce',
        title: 'Template: E-Commerce Platform',
        description: 'A production-ready e-commerce architecture with API Gateway, microservices (Product, Cart, Order, Payment), Redis cache, PostgreSQL databases, and async order processing.',
        difficulty: 'Hard',
        initialState: {
            nodes: [
                // === CLIENTS ===
                {
                    id: 'client_web',
                    type: 'client',
                    position: { x: 0, y: 0 },
                    data: {
                        label: 'Web Browsers',
                        streams: [
                            {
                                id: 'stream_browse',
                                label: 'Browse Products',
                                is_write: false,
                                weight: 5,
                                method: 'GET',
                                path: '/products',
                                rate: 15
                            },
                            {
                                id: 'stream_cart',
                                label: 'Add to Cart',
                                is_write: true,
                                weight: 1,
                                method: 'POST',
                                path: '/cart',
                                rate: 3
                            }
                        ]
                    }
                },
                {
                    id: 'client_mobile',
                    type: 'client',
                    position: { x: 0, y: 600 },
                    data: {
                        label: 'Mobile App',
                        streams: [
                            {
                                id: 'stream_browse',
                                label: 'Browse Products',
                                is_write: false,
                                weight: 3,
                                method: 'GET',
                                path: '/products',
                                rate: 10
                            },
                            {
                                id: 'stream_checkout',
                                label: 'Checkout',
                                is_write: true,
                                weight: 1,
                                method: 'POST',
                                path: '/orders',
                                rate: 2
                            }
                        ]
                    }
                },

                // === API GATEWAY ===
                {
                    id: 'api_gateway',
                    type: 'api_gateway',
                    position: { x: 450, y: 300 },
                    data: {
                        label: 'API Gateway',
                        buffer_capacity: 200,
                        processing_delay: 5,
                        endpoints: [
                            { id: 'ep_products', method: 'GET', path: '/products', delay: 5, forward_to: [{ target_id: 'dep_products', delay: 5 }], strategy: 'round_robin' },
                            { id: 'ep_cart', method: 'POST', path: '/cart', delay: 5, forward_to: [{ target_id: 'dep_cart', delay: 5 }], strategy: 'round_robin' },
                            { id: 'ep_orders', method: 'POST', path: '/orders', delay: 5, forward_to: [{ target_id: 'dep_orders', delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_products', label: 'Product Svc', method: 'GET',  path: '/products' },
                            { id: 'dep_cart',     label: 'Cart Svc',    method: 'POST', path: '/cart'     },
                            { id: 'dep_orders',   label: 'Order Svc',   method: 'POST', path: '/orders'   }
                        ]
                    }
                },

                // === LOAD BALANCERS ===
                {
                    id: 'lb_products',
                    type: 'load_balancer',
                    position: { x: 900, y: 50 },
                    data: {
                        label: 'Product LB',
                        buffer_capacity: 200,
                        processing_delay: 1
                    }
                },
                {
                    id: 'lb_cart',
                    type: 'load_balancer',
                    position: { x: 900, y: 620 },
                    data: {
                        label: 'Cart LB',
                        buffer_capacity: 100,
                        processing_delay: 1
                    }
                },

                // === MICROSERVICES ===
                // Product Service (x2 replicas behind LB)
                {
                    id: 'svc_product_1',
                    type: 'server',
                    position: { x: 1350, y: -50 },
                    data: {
                        label: 'Product Svc 1',
                        buffer_capacity: 80,
                        processing_delay: 5,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_get', method: 'GET', path: '/products', delay: 5, forward_to: [{ target_id: 'dep_cache', delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_cache', label: 'Cache', method: 'GET', path: '/products' }
                        ]
                    }
                },
                {
                    id: 'svc_product_2',
                    type: 'server',
                    position: { x: 1350, y: 250 },
                    data: {
                        label: 'Product Svc 2',
                        buffer_capacity: 80,
                        processing_delay: 5,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_get', method: 'GET', path: '/products', delay: 5, forward_to: [{ target_id: 'dep_cache', delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_cache', label: 'Cache', method: 'GET', path: '/products' }
                        ]
                    }
                },

                // Cart Service (x2 replicas behind LB)
                {
                    id: 'svc_cart',
                    type: 'server',
                    position: { x: 1350, y: 540 },
                    data: {
                        label: 'Cart Svc 1',
                        buffer_capacity: 80,
                        processing_delay: 10,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_cart', method: 'POST', path: '/cart', delay: 10, forward_to: [{ target_id: 'dep_db', delay: 10 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_db', label: 'Cart DB', method: 'POST', path: '/cart' }
                        ]
                    }
                },
                {
                    id: 'svc_cart_2',
                    type: 'server',
                    position: { x: 1350, y: 800 },
                    data: {
                        label: 'Cart Svc 2',
                        buffer_capacity: 80,
                        processing_delay: 10,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_cart', method: 'POST', path: '/cart', delay: 10, forward_to: [{ target_id: 'dep_db', delay: 10 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_db', label: 'Cart DB', method: 'POST', path: '/cart' }
                        ]
                    }
                },

                // Order Service
                {
                    id: 'svc_order',
                    type: 'server',
                    position: { x: 950, y: 800 },
                    data: {
                        label: 'Order Service',
                        buffer_capacity: 60,
                        processing_delay: 15,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_order', method: 'POST', path: '/orders', delay: 15, forward_to: [{ target_id: 'dep_mq', delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_mq', label: 'Order Queue', method: 'POST', path: '/pay' }
                        ]
                    }
                },

                // Payment Service
                {
                    id: 'svc_payment',
                    type: 'server',
                    position: { x: 1800, y: 750 },
                    data: {
                        label: 'Payment Service',
                        buffer_capacity: 40,
                        processing_delay: 35,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_pay', method: 'POST', path: '/pay', delay: 35, forward_to: [{ target_id: 'dep_db', delay: 35 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_db', label: 'Order DB', method: 'POST', path: '/payments' }
                        ]
                    }
                },

                // === CACHE ===
                {
                    id: 'cache_redis',
                    type: 'cache',
                    position: { x: 1800, y: 50 },
                    data: {
                        label: 'Redis Cache',
                        buffer_capacity: 1000,
                        processing_delay: 1,
                        cache_hit_rate: 0.85
                    }
                },

                // === DATABASES ===
                {
                    id: 'db_products',
                    type: 'database',
                    position: { x: 2250, y: 50 },
                    data: {
                        label: 'Product DB',
                        buffer_capacity: 150,
                        processing_delay: 15,
                        replicas: 2
                    }
                },
                {
                    id: 'db_cart',
                    type: 'database',
                    position: { x: 1800, y: 580 },
                    data: {
                        label: 'Cart DB',
                        buffer_capacity: 300,
                        processing_delay: 8,
                        replicas: 1
                    }
                },
                {
                    id: 'db_orders',
                    type: 'database',
                    position: { x: 2250, y: 750 },
                    data: {
                        label: 'Orders DB',
                        buffer_capacity: 100,
                        processing_delay: 20,
                        replicas: 2
                    }
                },

                // === MESSAGE QUEUE ===
                {
                    id: 'mq_orders',
                    type: 'message_queue',
                    position: { x: 1350, y: 1100 },
                    data: {
                        label: 'Order Queue',
                        buffer_capacity: 1000,
                        processing_delay: 1
                    }
                }
            ],
            edges: [
                // Clients → API Gateway
                { id: 'e_web_gw_products', source: 'client_web', sourceHandle: 'stream_browse', target: 'api_gateway' },
                { id: 'e_web_gw_cart', source: 'client_web', sourceHandle: 'stream_cart', target: 'api_gateway' },
                { id: 'e_mobile_gw_products', source: 'client_mobile', sourceHandle: 'stream_browse', target: 'api_gateway' },
                { id: 'e_mobile_gw_orders', source: 'client_mobile', sourceHandle: 'stream_checkout', target: 'api_gateway' },

                // API Gateway → Services (using dependency handles as source)
                { id: 'e_gw_lb_products', source: 'api_gateway', sourceHandle: 'dep_products', target: 'lb_products' },
                { id: 'e_gw_lb_cart', source: 'api_gateway', sourceHandle: 'dep_cart', target: 'lb_cart' },
                { id: 'e_gw_order', source: 'api_gateway', sourceHandle: 'dep_orders', target: 'svc_order', targetHandle: 'ep_order' },

                // Load Balancer → Product Services
                { id: 'e_lb_prod1', source: 'lb_products', target: 'svc_product_1', targetHandle: 'ep_get' },
                { id: 'e_lb_prod2', source: 'lb_products', target: 'svc_product_2', targetHandle: 'ep_get' },

                // Cart Load Balancer → Cart Services
                { id: 'e_lb_cart1', source: 'lb_cart', target: 'svc_cart', targetHandle: 'ep_cart' },
                { id: 'e_lb_cart2', source: 'lb_cart', target: 'svc_cart_2', targetHandle: 'ep_cart' },

                // Product Services → Cache (using dependency handles)
                { id: 'e_prod1_cache', source: 'svc_product_1', sourceHandle: 'dep_cache', target: 'cache_redis' },
                { id: 'e_prod2_cache', source: 'svc_product_2', sourceHandle: 'dep_cache', target: 'cache_redis' },

                // Cache → Product DB
                { id: 'e_cache_db', source: 'cache_redis', target: 'db_products' },

                // Cart Services → Cart DB
                { id: 'e_cart1_db', source: 'svc_cart', sourceHandle: 'dep_db', target: 'db_cart' },
                { id: 'e_cart2_db', source: 'svc_cart_2', sourceHandle: 'dep_db', target: 'db_cart' },

                // Order Service → Message Queue
                { id: 'e_order_mq', source: 'svc_order', sourceHandle: 'dep_mq', target: 'mq_orders' },

                // Message Queue → Payment Service (async)
                { id: 'e_mq_payment', source: 'mq_orders', target: 'svc_payment', targetHandle: 'ep_pay' },

                // Payment Service → Orders DB
                { id: 'e_payment_db', source: 'svc_payment', sourceHandle: 'dep_db', target: 'db_orders' }
            ],
            viewport: { x: 80, y: 220, zoom: 0.35 }
        }
    },

    // ============================================
    // TEMPLATE: URL SHORTENER
    // ============================================
    {
        id: 'template-urlshortener',
        title: 'Template: URL Shortener',
        description: 'A high-throughput URL shortening service with Redis caching, PostgreSQL storage, and async analytics processing.',
        difficulty: 'Medium',
        initialState: {
            nodes: [
                // === TIER 1: CLIENTS (x: 0) ===
                {
                    id: 'client_api',
                    type: 'client',
                    position: { x: 0, y: 200 },
                    data: {
                        label: 'API Clients',
                        streams: [
                            { id: 'stream_create', label: 'Create Short URL', is_write: true, weight: 1, method: 'POST', path: '/shorten', rate: 3 },
                            { id: 'stream_redirect', label: 'Redirect', is_write: false, weight: 10, method: 'GET', path: '/r/:id', rate: 15 }
                        ]
                    }
                },

                // === TIER 2: API GATEWAY ===
                {
                    id: 'api_gw',
                    type: 'api_gateway',
                    position: { x: 550, y: 200 },
                    data: {
                        label: 'API Gateway',
                        buffer_capacity: 500,
                        processing_delay: 2,
                        endpoints: [
                            { id: 'ep_create',   method: 'POST', path: '/shorten', delay: 2, forward_to: [{ target_id: 'dep_url_create',   delay: 1 }], strategy: 'round_robin' },
                            { id: 'ep_redirect', method: 'GET',  path: '/r/:id',   delay: 1, forward_to: [{ target_id: 'dep_url_redirect', delay: 1 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_url_create',   label: 'URL Service', method: 'POST', path: '/shorten' },
                            { id: 'dep_url_redirect', label: 'URL Service', method: 'GET',  path: '/r/:id'   }
                        ]
                    }
                },

                // === TIER 3: URL SERVICE ===
                {
                    id: 'svc_api',
                    type: 'server',
                    position: { x: 1150, y: 200 },
                    data: {
                        label: 'URL Service',
                        buffer_capacity: 200,
                        processing_delay: 5,
                        replicas: 4,
                        endpoints: [
                            // Create: call KGS (which then writes to DB) + write-through cache
                            { id: 'ep_create',   method: 'POST', path: '/shorten', delay: 15, forward_to: [{ target_id: 'dep_kgs', delay: 5 }, { target_id: 'dep_cache_write', delay: 1 }], strategy: 'fan_out' },
                            // Redirect: read from cache (miss → DB), fire-and-forget analytics
                            { id: 'ep_redirect', method: 'GET',  path: '/r/:id',   delay: 3,  forward_to: [{ target_id: 'dep_cache', delay: 3 }, { target_id: 'dep_analytics', delay: 1 }], strategy: 'fan_out' }
                        ],
                        dependencies: [
                            { id: 'dep_cache',       label: 'URL Cache',      method: 'GET',  path: '/r/:id'  },
                            { id: 'dep_cache_write', label: 'URL Cache',      method: 'POST', path: '/r/:id'  },
                            { id: 'dep_kgs',         label: 'Key Gen Service', method: 'GET',  path: '/key'    },
                            { id: 'dep_analytics',   label: 'Analytics Queue', method: 'POST', path: '/clicks' }
                        ]
                    }
                },

                // === TIER 4: CACHE, KGS & QUEUE ===
                {
                    id: 'cache_redis',
                    type: 'cache',
                    position: { x: 1750, y: -50 },
                    data: {
                        label: 'Redis Cache',
                        buffer_capacity: 5000,
                        processing_delay: 1,
                        cache_hit_rate: 0.95
                    }
                },
                {
                    id: 'mq_analytics',
                    type: 'message_queue',
                    position: { x: 1750, y: 600 },
                    data: {
                        label: 'Analytics Queue',
                        buffer_capacity: 10000,
                        processing_delay: 1
                    }
                },

                // === TIER 5: DATABASES & ANALYTICS ===
                {
                    id: 'db_urls',
                    type: 'database',
                    position: { x: 2350, y: 100 },
                    data: {
                        label: 'URL Database',
                        buffer_capacity: 200,
                        processing_delay: 8,
                        replicas: 2
                    }
                },
                {
                    id: 'svc_analytics',
                    type: 'server',
                    position: { x: 2350, y: 550 },
                    data: {
                        label: 'Analytics Service',
                        buffer_capacity: 200,
                        processing_delay: 20,
                        replicas: 4,
                        endpoints: [
                            { id: 'ep_track', method: 'POST', path: '/clicks', delay: 20, forward_to: [{ target_id: 'dep_db', delay: 20 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_db', label: 'Analytics DB', method: 'POST', path: '/analytics/clicks' }
                        ]
                    }
                },
                {
                    id: 'svc_kgs',
                    type: 'server',
                    position: { x: 1750, y: 270 },
                    data: {
                        label: 'Key Gen Service',
                        buffer_capacity: 100,
                        processing_delay: 2,
                        replicas: 1,
                        endpoints: [
                            // Generate key, then persist the new {key → url} mapping to DB
                            { id: 'ep_get_key', method: 'GET', path: '/key', delay: 2, forward_to: [{ target_id: 'dep_db', delay: 15 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_db', label: 'URL Database', method: 'POST', path: '/urls' }
                        ]
                    }
                },
                {
                    id: 'db_analytics',
                    type: 'database',
                    position: { x: 2950, y: 550 },
                    data: {
                        label: 'Analytics DB',
                        buffer_capacity: 100,
                        processing_delay: 15,
                        replicas: 1
                    }
                }
            ],
            edges: [
                // Client → API Gateway
                { id: 'e_client_gw_create',   source: 'client_api', sourceHandle: 'stream_create',   target: 'api_gw' },
                { id: 'e_client_gw_redirect',  source: 'client_api', sourceHandle: 'stream_redirect', target: 'api_gw' },

                // API Gateway → URL Service (explicit per-endpoint routing)
                { id: 'e_gw_create',   source: 'api_gw', sourceHandle: 'dep_url_create',   target: 'svc_api', targetHandle: 'ep_create'   },
                { id: 'e_gw_redirect', source: 'api_gw', sourceHandle: 'dep_url_redirect', target: 'svc_api', targetHandle: 'ep_redirect' },

                // URL Service → Cache (reads on redirect)
                { id: 'e_api_cache',       source: 'svc_api', sourceHandle: 'dep_cache',       target: 'cache_redis' },
                // URL Service → Cache (write-through on create)
                { id: 'e_api_cache_write', source: 'svc_api', sourceHandle: 'dep_cache_write', target: 'cache_redis' },

                // Cache → Database (cache miss fallback)
                { id: 'e_cache_db', source: 'cache_redis', target: 'db_urls' },

                // URL Service → Key Gen Service (KGS then writes to URL DB)
                { id: 'e_api_kgs', source: 'svc_api', sourceHandle: 'dep_kgs', target: 'svc_kgs', targetHandle: 'ep_get_key' },

                // Key Gen Service → URL Database
                { id: 'e_kgs_db', source: 'svc_kgs', sourceHandle: 'dep_db', target: 'db_urls' },

                // URL Service → Analytics Queue (fire-and-forget on every redirect)
                { id: 'e_api_analytics', source: 'svc_api', sourceHandle: 'dep_analytics', target: 'mq_analytics' },

                // Analytics Queue → Analytics Service
                { id: 'e_mq_analytics', source: 'mq_analytics', target: 'svc_analytics', targetHandle: 'ep_track' },

                // Analytics Service → Analytics DB
                { id: 'e_analytics_db', source: 'svc_analytics', sourceHandle: 'dep_db', target: 'db_analytics' }
            ],
            viewport: { x: 80, y: 240, zoom: 0.38 }
        }
    },

    // ============================================
    // TEMPLATE: SOCIAL MEDIA FEED
    // ============================================
    {
        id: 'template-socialmedia',
        title: 'Template: Social Media Feed',
        description: 'A production-ready social media feed architecture with CDN, microservices (Feed, Post, User, Notification), Redis caching, fan-out on write, and real-time notifications.',
        difficulty: 'Hard',
        initialState: {
            nodes: [
                // === TIER 1: CLIENTS (x: 0) ===
                {
                    id: 'client_users',
                    type: 'client',
                    position: { x: 0, y: 300 },
                    data: {
                        label: 'Mobile & Web',
                        streams: [
                            { id: 'stream_feed', label: 'View Feed', is_write: false, weight: 10, method: 'GET', path: '/feed', rate: 30 },
                            { id: 'stream_post', label: 'Create Post', is_write: true, weight: 1, method: 'POST', path: '/posts', rate: 5 },
                            { id: 'stream_like', label: 'Like Post', is_write: true, weight: 3, method: 'POST', path: '/likes', rate: 8 },
                            { id: 'stream_profile', label: 'View Profile', is_write: false, weight: 2, method: 'GET', path: '/users/:id', rate: 8 }
                        ]
                    }
                },

                // === TIER 2: CDN (x: 350) ===
                {
                    id: 'cdn_static',
                    type: 'cache',
                    position: { x: 500, y: 50 },
                    data: {
                        label: 'CDN Edge',
                        buffer_capacity: 5000,
                        processing_delay: 2,
                        cache_hit_rate: 0.70
                    }
                },

                // === TIER 3: LOAD BALANCER (x: 650) ===
                {
                    id: 'lb_main',
                    type: 'load_balancer',
                    position: { x: 1000, y: 300 },
                    data: {
                        label: 'Load Balancer',
                        buffer_capacity: 1000,
                        processing_delay: 1
                    }
                },

                // === TIER 4: API GATEWAY (x: 950) ===
                {
                    id: 'api_gateway',
                    type: 'api_gateway',
                    position: { x: 1500, y: 300 },
                    data: {
                        label: 'API Gateway',
                        buffer_capacity: 500,
                        processing_delay: 3,
                        endpoints: [
                            { id: 'ep_feed',  method: 'GET',  path: '/feed',       delay: 3, forward_to: [{ target_id: 'dep_feed',  delay: 3 }], strategy: 'round_robin' },
                            { id: 'ep_posts', method: 'POST', path: '/posts',       delay: 3, forward_to: [{ target_id: 'dep_post',  delay: 3 }], strategy: 'round_robin' },
                            { id: 'ep_likes', method: 'POST', path: '/likes',       delay: 3, forward_to: [{ target_id: 'dep_likes', delay: 3 }], strategy: 'round_robin' },
                            { id: 'ep_users', method: 'GET',  path: '/users/:id',   delay: 3, forward_to: [{ target_id: 'dep_user',  delay: 3 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_feed',  label: 'Feed Service', method: 'GET',  path: '/feed'       },
                            { id: 'dep_post',  label: 'Post Service', method: 'POST', path: '/posts'      },
                            { id: 'dep_likes', label: 'Post Service', method: 'POST', path: '/likes'      },
                            { id: 'dep_user',  label: 'User Service', method: 'GET',  path: '/users/:id'  }
                        ]
                    }
                },

                // === TIER 5: MICROSERVICES ===
                {
                    id: 'lb_feed',
                    type: 'load_balancer',
                    position: { x: 1600, y: -100 },
                    data: {
                        label: 'Feed LB',
                        buffer_capacity: 500,
                        processing_delay: 1
                    }
                },

                // Feed Service (x2 replicas for read-heavy traffic)
                {
                    id: 'svc_feed_1',
                    type: 'server',
                    position: { x: 2000, y: -250 },
                    data: {
                        label: 'Feed Service 1',
                        buffer_capacity: 150,
                        processing_delay: 8,
                        replicas: 3,
                        endpoints: [
                            { id: 'ep_get_feed', method: 'GET', path: '/feed', delay: 8, forward_to: [{ target_id: 'dep_cache', delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_cache', label: 'Feed Cache', method: 'GET', path: '/feed' }
                        ]
                    }
                },
                {
                    id: 'svc_feed_2',
                    type: 'server',
                    position: { x: 2000, y: 50 },
                    data: {
                        label: 'Feed Service 2',
                        buffer_capacity: 150,
                        processing_delay: 8,
                        replicas: 3,
                        endpoints: [
                            { id: 'ep_get_feed', method: 'GET', path: '/feed', delay: 8, forward_to: [{ target_id: 'dep_cache', delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_cache', label: 'Feed Cache', method: 'GET', path: '/feed' }
                        ]
                    }
                },

                // Post Service
                {
                    id: 'svc_post',
                    type: 'server',
                    position: { x: 2000, y: 430 },
                    data: {
                        label: 'Post Service',
                        buffer_capacity: 100,
                        processing_delay: 12,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_create_post', method: 'POST', path: '/posts', delay: 12, forward_to: [{ target_id: 'dep_db', delay: 5 }, { target_id: 'dep_queue', delay: 2 }], strategy: 'fan_out' },
                            { id: 'ep_like',        method: 'POST', path: '/likes', delay: 8,  forward_to: [{ target_id: 'dep_likes_db', delay: 2 }],                                 strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_db',       label: 'Posts DB',     method: 'POST', path: '/posts'  },
                            { id: 'dep_likes_db', label: 'Posts DB',     method: 'POST', path: '/likes'  },
                            { id: 'dep_queue',    label: 'Fanout Queue', method: 'POST', path: '/fanout' }
                        ]
                    }
                },

                // User Service
                {
                    id: 'svc_user',
                    type: 'server',
                    position: { x: 2000, y: 800 },
                    data: {
                        label: 'User Service',
                        buffer_capacity: 80,
                        processing_delay: 10,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_get_user', method: 'GET', path: '/users/:id', delay: 10, forward_to: [{ target_id: 'dep_db', delay: 10 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_db', label: 'Users DB', method: 'GET', path: '/users/:id' }
                        ]
                    }
                },

                // === TIER 6: CACHE & QUEUE (x: 1700) ===
                {
                    id: 'cache_feed',
                    type: 'cache',
                    position: { x: 2950, y: -200 },
                    data: {
                        label: 'Redis Feed Cache',
                        buffer_capacity: 10000,
                        processing_delay: 1,
                        cache_hit_rate: 0.95
                    }
                },
                {
                    id: 'mq_fanout',
                    type: 'message_queue',
                    position: { x: 2600, y: 430 },
                    data: {
                        label: 'Fanout Queue',
                        buffer_capacity: 5000,
                        processing_delay: 1
                    }
                },

                // === TIER 7: DATABASES & WORKERS (x: 2100) ===
                {
                    id: 'db_posts',
                    type: 'database',
                    position: { x: 3600, y: -200 },
                    data: {
                        label: 'Posts DB',
                        buffer_capacity: 300,
                        processing_delay: 4,
                        replicas: 1
                    }
                },
                {
                    id: 'db_users',
                    type: 'database',
                    position: { x: 2600, y: 800 },
                    data: {
                        label: 'Users DB',
                        buffer_capacity: 200,
                        processing_delay: 10,
                        replicas: 2
                    }
                },

                // Fanout Worker — updates followers' feed caches AND sends push notifications
                {
                    id: 'svc_notification',
                    type: 'server',
                    position: { x: 3600, y: 430 },
                    data: {
                        label: 'Fanout Worker',
                        buffer_capacity: 200,
                        processing_delay: 25,
                        replicas: 4,
                        endpoints: [
                            { id: 'ep_notify', method: 'POST', path: '/fanout', delay: 25, forward_to: [{ target_id: 'dep_cache', delay: 5 }, { target_id: 'dep_push', delay: 10 }], strategy: 'fan_out' }
                        ],
                        dependencies: [
                            { id: 'dep_cache', label: 'Feed Cache',  method: 'POST', path: '/feed' },
                            { id: 'dep_push',  label: 'Push Topic',  method: 'POST', path: '/push' }
                        ]
                    }
                },

                // Push Notification Topic
                {
                    id: 'topic_push',
                    type: 'topic',
                    position: { x: 4200, y: 430 },
                    data: {
                        label: 'Push Notifications',
                        buffer_capacity: 10000,
                        processing_delay: 1
                    }
                }
            ],
            edges: [
                // Client → CDN (reads only — feed and profile are cacheable)
                { id: 'e_client_cdn_feed', source: 'client_users', sourceHandle: 'stream_feed', target: 'cdn_static' },
                { id: 'e_client_cdn_profile', source: 'client_users', sourceHandle: 'stream_profile', target: 'cdn_static' },

                // Client → Load Balancer directly (writes bypass CDN)
                { id: 'e_client_lb_post', source: 'client_users', sourceHandle: 'stream_post', target: 'lb_main' },
                { id: 'e_client_lb_like', source: 'client_users', sourceHandle: 'stream_like', target: 'lb_main' },

                // CDN → Load Balancer
                { id: 'e_cdn_lb', source: 'cdn_static', target: 'lb_main' },

                // Load Balancer → API Gateway (all endpoints)
                { id: 'e_lb_gw', source: 'lb_main', target: 'api_gateway' },

                // API Gateway → Services
                { id: 'e_gw_lb_feed', source: 'api_gateway', sourceHandle: 'dep_feed', target: 'lb_feed' },

                // Feed LB → Feed Services
                { id: 'e_lb_feed1', source: 'lb_feed', target: 'svc_feed_1', targetHandle: 'ep_get_feed' },
                { id: 'e_lb_feed2', source: 'lb_feed', target: 'svc_feed_2', targetHandle: 'ep_get_feed' },
                { id: 'e_gw_post', source: 'api_gateway', sourceHandle: 'dep_post', target: 'svc_post', targetHandle: 'ep_create_post' },
                { id: 'e_gw_like', source: 'api_gateway', sourceHandle: 'dep_likes', target: 'svc_post', targetHandle: 'ep_like' },
                { id: 'e_gw_user', source: 'api_gateway', sourceHandle: 'dep_user', target: 'svc_user', targetHandle: 'ep_get_user' },

                // Feed Services → Cache
                { id: 'e_feed1_cache', source: 'svc_feed_1', sourceHandle: 'dep_cache', target: 'cache_feed' },
                { id: 'e_feed2_cache', source: 'svc_feed_2', sourceHandle: 'dep_cache', target: 'cache_feed' },

                // Cache → Posts DB (cache miss)
                { id: 'e_cache_db', source: 'cache_feed', target: 'db_posts' },

                // Post Service → Posts DB (new post)
                { id: 'e_post_db', source: 'svc_post', sourceHandle: 'dep_db', target: 'db_posts' },

                // Post Service → Posts DB (like counter)
                { id: 'e_like_db', source: 'svc_post', sourceHandle: 'dep_likes_db', target: 'db_posts' },

                // Post Service → Fanout Queue (async)
                { id: 'e_post_queue', source: 'svc_post', sourceHandle: 'dep_queue', target: 'mq_fanout' },

                // Fanout Queue → Fanout Worker
                { id: 'e_queue_notif', source: 'mq_fanout', target: 'svc_notification', targetHandle: 'ep_notify' },

                // Fanout Worker → Feed Cache (update followers' feeds)
                { id: 'e_fanout_cache', source: 'svc_notification', sourceHandle: 'dep_cache', target: 'cache_feed' },

                // Fanout Worker → Push Topic (send notifications)
                { id: 'e_notif_push', source: 'svc_notification', sourceHandle: 'dep_push', target: 'topic_push' },

                // User Service → Users DB
                { id: 'e_user_db', source: 'svc_user', sourceHandle: 'dep_db', target: 'db_users' }
            ],
            viewport: { x: 50, y: 250, zoom: 0.25 }
        }
    },

    // ============================================
    // TEMPLATE: RIDE-SHARING PLATFORM
    // ============================================
    {
        id: 'template-rideshare',
        title: 'Template: Ride-Sharing Platform',
        description: 'A production-grade ride-sharing architecture: GPS location ingestion, surge pricing, a matching engine, async payment processing via a queue, fan-out trip events, and push notifications to riders and drivers.',
        difficulty: 'Hard',
        initialState: {
            nodes: [
                // ── TIER 1: CLIENTS ──────────────────────────────────────── x=0
                {
                    id: 'client_riders',
                    type: 'client',
                    position: { x: 0, y: 0 },
                    data: {
                        label: 'Rider App',
                        streams: [
                            { id: 's_estimate',  label: 'Price Estimate',  is_write: false, weight: 5,  method: 'GET',   path: '/estimate',              rate: 15  },
                            { id: 's_request',   label: 'Request Ride',    is_write: true,  weight: 1,  method: 'POST',  path: '/rides',                 rate: 3   },
                            { id: 's_track',     label: 'Track Ride',      is_write: false, weight: 10, method: 'GET',   path: '/rides/:id',             rate: 15  },
                            { id: 's_review',    label: 'Post Review',     is_write: true,  weight: 1,  method: 'POST',  path: '/reviews',               rate: 2   },
                        ]
                    }
                },
                {
                    id: 'client_drivers',
                    type: 'client',
                    position: { x: 0, y: 950 },
                    data: {
                        label: 'Driver App',
                        streams: [
                            { id: 's_location',  label: 'GPS Ping',        is_write: true,  weight: 30, method: 'POST',  path: '/driver/location',       rate: 20  },
                            { id: 's_accept',    label: 'Accept Ride',     is_write: true,  weight: 1,  method: 'POST',  path: '/rides/:id/accept',      rate: 3   },
                            { id: 's_complete',  label: 'Complete Trip',   is_write: true,  weight: 1,  method: 'PATCH', path: '/rides/:id/complete',    rate: 2   },
                        ]
                    }
                },

                // ── TIER 2: CDN / WAF ─────────────────────────────────── x=450
                {
                    id: 'cdn_edge',
                    type: 'cache',
                    position: { x: 450, y: 270 },
                    data: {
                        label: 'CDN / WAF',
                        buffer_capacity: 20000,
                        processing_delay: 1,
                        cache_hit_rate: 0.25
                    }
                },

                // ── TIER 3: API GATEWAY ───────────────────────────────── x=850
                {
                    id: 'api_gw',
                    type: 'api_gateway',
                    position: { x: 850, y: 190 },
                    data: {
                        label: 'API Gateway',
                        buffer_capacity: 2000,
                        processing_delay: 3,
                        endpoints: [
                            { id: 'ep_estimate',  method: 'GET',   path: '/estimate',           delay: 3, forward_to: [{ target_id: 'dep_pricing',         delay: 2 }],  strategy: 'round_robin' },
                            { id: 'ep_rides',     method: 'POST',  path: '/rides',              delay: 3, forward_to: [{ target_id: 'dep_rider',            delay: 2 }],  strategy: 'round_robin' },
                            { id: 'ep_track',     method: 'GET',   path: '/rides/:id',          delay: 2, forward_to: [{ target_id: 'dep_trip_get',         delay: 2 }],  strategy: 'round_robin' },
                            { id: 'ep_review',    method: 'POST',  path: '/reviews',            delay: 3, forward_to: [{ target_id: 'dep_trip_review',      delay: 2 }],  strategy: 'round_robin' },
                            { id: 'ep_location',  method: 'POST',  path: '/driver/location',    delay: 2, forward_to: [{ target_id: 'dep_driver_location',  delay: 1 }],  strategy: 'round_robin' },
                            { id: 'ep_accept',    method: 'POST',  path: '/rides/:id/accept',   delay: 3, forward_to: [{ target_id: 'dep_driver_accept',    delay: 2 }],  strategy: 'round_robin' },
                            { id: 'ep_complete',  method: 'PATCH', path: '/rides/:id/complete', delay: 3, forward_to: [{ target_id: 'dep_trip_complete',    delay: 2 }],  strategy: 'round_robin' },
                        ],
                        dependencies: [
                            { id: 'dep_pricing',         label: 'Pricing Svc',  method: 'GET',   path: '/estimate'            },
                            { id: 'dep_rider',           label: 'Rider Svc',    method: 'POST',  path: '/rides'               },
                            { id: 'dep_trip_get',        label: 'Trip Svc',     method: 'GET',   path: '/rides/:id'           },
                            { id: 'dep_trip_complete',   label: 'Trip Svc',     method: 'PATCH', path: '/rides/:id/complete'  },
                            { id: 'dep_trip_review',     label: 'Trip Svc',     method: 'POST',  path: '/reviews'             },
                            { id: 'dep_driver_location', label: 'Driver Svc',   method: 'POST',  path: '/driver/location'     },
                            { id: 'dep_driver_accept',   label: 'Driver Svc',   method: 'POST',  path: '/rides/:id/accept'    },
                        ]
                    }
                },

                // ── TIER 5: MICROSERVICES ─────────────────────────────── x=1750
                {
                    id: 'svc_pricing',
                    type: 'server',
                    position: { x: 1300, y: -120 },
                    data: {
                        label: 'Pricing Service',
                        buffer_capacity: 300,
                        processing_delay: 8,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_estimate', method: 'GET', path: '/estimate', delay: 8, forward_to: [{ target_id: 'dep_loc_cache', delay: 3 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_loc_cache', label: 'Location Cache', method: 'GET', path: '/drivers/nearby' }
                        ]
                    }
                },
                {
                    id: 'svc_rider',
                    type: 'server',
                    position: { x: 1300, y: 120 },
                    data: {
                        label: 'Rider Service',
                        buffer_capacity: 200,
                        processing_delay: 10,
                        replicas: 3,
                        endpoints: [
                            { id: 'ep_request', method: 'POST', path: '/rides', delay: 10, forward_to: [
                                { target_id: 'dep_users_db',    delay: 8  },
                                { target_id: 'dep_pricing_int', delay: 5  },
                                { target_id: 'dep_matching',    delay: 8  },
                                { target_id: 'dep_trips_db',    delay: 10 }
                            ], strategy: 'fan_out' }
                        ],
                        dependencies: [
                            { id: 'dep_users_db',    label: 'Users DB',        method: 'GET',  path: '/users/:id'  },
                            { id: 'dep_pricing_int', label: 'Pricing Svc',     method: 'GET',  path: '/estimate'   },
                            { id: 'dep_matching',    label: 'Matching Engine', method: 'POST', path: '/match'      },
                            { id: 'dep_trips_db',    label: 'Trips DB',        method: 'POST', path: '/trips'      }
                        ]
                    }
                },
                {
                    id: 'svc_driver',
                    type: 'server',
                    position: { x: 1300, y: 500 },
                    data: {
                        label: 'Driver Service',
                        buffer_capacity: 500,
                        processing_delay: 3,
                        replicas: 5,
                        endpoints: [
                            { id: 'ep_location', method: 'POST', path: '/driver/location',  delay: 3, forward_to: [{ target_id: 'dep_loc_queue', delay: 1 }], strategy: 'round_robin' },
                            { id: 'ep_accept',   method: 'POST', path: '/rides/:id/accept', delay: 5, forward_to: [{ target_id: 'dep_trips_db',  delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_loc_queue', label: 'Location Queue', method: 'POST', path: '/process'  },
                            { id: 'dep_trips_db',  label: 'Trips DB',       method: 'PUT',  path: '/trips/:id' }
                        ]
                    }
                },
                {
                    id: 'svc_trip',
                    type: 'server',
                    position: { x: 1300, y: 900 },
                    data: {
                        label: 'Trip Service',
                        buffer_capacity: 300,
                        processing_delay: 12,
                        replicas: 3,
                        endpoints: [
                            { id: 'ep_get_trip',  method: 'GET',   path: '/rides/:id',          delay: 5,  forward_to: [{ target_id: 'dep_trip_cache', delay: 3 }], strategy: 'round_robin' },
                            { id: 'ep_complete',  method: 'PATCH', path: '/rides/:id/complete', delay: 15, forward_to: [
                                { target_id: 'dep_trips_db',  delay: 10 },
                                { target_id: 'dep_events',    delay: 2  },
                                { target_id: 'dep_payment',   delay: 5  }
                            ], strategy: 'fan_out' },
                            { id: 'ep_review',    method: 'POST',  path: '/reviews',            delay: 8,  forward_to: [{ target_id: 'dep_trips_db', delay: 8 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_trip_cache', label: 'Trip Cache',   method: 'GET',  path: '/cache/trips/:id'    },
                            { id: 'dep_trips_db',   label: 'Trips DB',     method: 'PUT',  path: '/trips/:id'          },
                            { id: 'dep_events',     label: 'Trip Events',  method: 'POST', path: '/events'             },
                            { id: 'dep_payment',    label: 'Payment Svc',  method: 'POST', path: '/payments/charge'    }
                        ]
                    }
                },
                {
                    id: 'svc_payment',
                    type: 'server',
                    position: { x: 1300, y: 1350 },
                    data: {
                        label: 'Payment Service',
                        buffer_capacity: 150,
                        processing_delay: 60,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_charge', method: 'POST', path: '/payments/charge', delay: 60, forward_to: [{ target_id: 'dep_payment_mq', delay: 2 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_payment_mq', label: 'Payment Queue', method: 'POST', path: '/process' }
                        ]
                    }
                },

                // ── TIER 6: CACHES, QUEUES & TOPICS ──────────────────── x=2300
                {
                    id: 'cache_location',
                    type: 'cache',
                    position: { x: 1850, y: -120 },
                    data: {
                        label: 'Location Cache',
                        buffer_capacity: 100000,
                        processing_delay: 1,
                        cache_hit_rate: 0.88
                    }
                },
                {
                    id: 'cache_trips',
                    type: 'cache',
                    position: { x: 1850, y: 270 },
                    data: {
                        label: 'Trip Cache',
                        buffer_capacity: 50000,
                        processing_delay: 1,
                        cache_hit_rate: 0.92
                    }
                },
                {
                    id: 'mq_location',
                    type: 'message_queue',
                    position: { x: 1850, y: 550 },
                    data: {
                        label: 'Location Queue',
                        buffer_capacity: 200000,
                        processing_delay: 1
                    }
                },
                {
                    id: 'topic_trips',
                    type: 'topic',
                    position: { x: 1850, y: 950 },
                    data: {
                        label: 'Trip Events',
                        buffer_capacity: 50000,
                        processing_delay: 1
                    }
                },
                {
                    id: 'mq_payment',
                    type: 'message_queue',
                    position: { x: 1850, y: 1350 },
                    data: {
                        label: 'Payment Queue',
                        buffer_capacity: 10000,
                        processing_delay: 1
                    }
                },

                // ── TIER 7: WORKERS & SECONDARY SERVICES ─────────────── x=2850
                {
                    id: 'worker_matching',
                    type: 'server',
                    position: { x: 2400, y: 120 },
                    data: {
                        label: 'Matching Engine',
                        buffer_capacity: 300,
                        processing_delay: 25,
                        replicas: 3,
                        endpoints: [
                            { id: 'ep_match', method: 'POST', path: '/match', delay: 25, forward_to: [
                                { target_id: 'dep_loc_cache', delay: 3  },
                                { target_id: 'dep_trips_db',  delay: 10 }
                            ], strategy: 'fan_out' }
                        ],
                        dependencies: [
                            { id: 'dep_loc_cache', label: 'Location Cache', method: 'GET', path: '/drivers/nearby' },
                            { id: 'dep_trips_db',  label: 'Trips DB',       method: 'PUT', path: '/trips/:id'      }
                        ]
                    }
                },
                {
                    id: 'worker_location',
                    type: 'server',
                    position: { x: 2400, y: 550 },
                    data: {
                        label: 'Location Worker',
                        buffer_capacity: 2000,
                        processing_delay: 4,
                        replicas: 6,
                        endpoints: [
                            { id: 'ep_process', method: 'POST', path: '/process', delay: 4, forward_to: [
                                { target_id: 'dep_loc_cache', delay: 2 },
                                { target_id: 'dep_loc_db',    delay: 8 }
                            ], strategy: 'fan_out' }
                        ],
                        dependencies: [
                            { id: 'dep_loc_cache', label: 'Location Cache', method: 'PUT',  path: '/cache/location' },
                            { id: 'dep_loc_db',    label: 'Location DB',    method: 'POST', path: '/locations'      }
                        ]
                    }
                },
                {
                    id: 'svc_notification',
                    type: 'server',
                    position: { x: 2400, y: 950 },
                    data: {
                        label: 'Notification Service',
                        buffer_capacity: 1000,
                        processing_delay: 12,
                        replicas: 3,
                        endpoints: [
                            { id: 'ep_notify', method: 'POST', path: '/events', delay: 12, forward_to: [{ target_id: 'dep_push', delay: 5 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_push', label: 'Push Topic', method: 'POST', path: '/push' }
                        ]
                    }
                },
                {
                    id: 'worker_payment',
                    type: 'server',
                    position: { x: 2400, y: 1350 },
                    data: {
                        label: 'Payment Processor',
                        buffer_capacity: 200,
                        processing_delay: 150,
                        replicas: 2,
                        endpoints: [
                            { id: 'ep_process', method: 'POST', path: '/process', delay: 150, forward_to: [{ target_id: 'dep_payments_db', delay: 20 }], strategy: 'round_robin' }
                        ],
                        dependencies: [
                            { id: 'dep_payments_db', label: 'Payments DB', method: 'POST', path: '/payments' }
                        ]
                    }
                },

                // ── TIER 8: DATABASES & FINAL SINKS ──────────────────── x=3400
                {
                    id: 'db_users',
                    type: 'database',
                    position: { x: 2950, y: -120 },
                    data: {
                        label: 'Users DB',
                        buffer_capacity: 400,
                        processing_delay: 10,
                        replicas: 2
                    }
                },
                {
                    id: 'db_trips',
                    type: 'database',
                    position: { x: 2950, y: 200 },
                    data: {
                        label: 'Trips DB',
                        buffer_capacity: 600,
                        processing_delay: 4,
                        replicas: 1
                    }
                },
                {
                    id: 'db_location',
                    type: 'database',
                    position: { x: 2950, y: 550 },
                    data: {
                        label: 'Location DB',
                        buffer_capacity: 2000,
                        processing_delay: 5,
                        replicas: 1
                    }
                },
                {
                    id: 'topic_push',
                    type: 'topic',
                    position: { x: 2950, y: 950 },
                    data: {
                        label: 'Push Notifications',
                        buffer_capacity: 500000,
                        processing_delay: 1
                    }
                },
                {
                    id: 'db_payments',
                    type: 'database',
                    position: { x: 2950, y: 1350 },
                    data: {
                        label: 'Payments DB',
                        buffer_capacity: 300,
                        processing_delay: 20,
                        replicas: 3
                    }
                }
            ],
            edges: [
                // ── Clients → CDN (reads only — estimate and track are cacheable) ────
                { id: 'e_r_estimate',  source: 'client_riders',  sourceHandle: 's_estimate',  target: 'cdn_edge' },
                { id: 'e_r_track',     source: 'client_riders',  sourceHandle: 's_track',     target: 'cdn_edge' },

                // ── Clients → API Gateway directly (writes bypass CDN) ───────────────
                { id: 'e_r_request',   source: 'client_riders',  sourceHandle: 's_request',   target: 'api_gw' },
                { id: 'e_r_review',    source: 'client_riders',  sourceHandle: 's_review',    target: 'api_gw' },
                { id: 'e_d_location',  source: 'client_drivers', sourceHandle: 's_location',  target: 'api_gw' },
                { id: 'e_d_accept',    source: 'client_drivers', sourceHandle: 's_accept',    target: 'api_gw' },
                { id: 'e_d_complete',  source: 'client_drivers', sourceHandle: 's_complete',  target: 'api_gw' },

                // ── CDN → API Gateway ───────────────────────────────────────────────
                { id: 'e_cdn_gw', source: 'cdn_edge', target: 'api_gw' },

                // ── API Gateway → Microservices ─────────────────────────────────────
                { id: 'e_gw_pricing',   source: 'api_gw', sourceHandle: 'dep_pricing',         target: 'svc_pricing', targetHandle: 'ep_estimate' },
                { id: 'e_gw_rider',     source: 'api_gw', sourceHandle: 'dep_rider',            target: 'svc_rider',   targetHandle: 'ep_request'  },
                { id: 'e_gw_trip_get',  source: 'api_gw', sourceHandle: 'dep_trip_get',         target: 'svc_trip',    targetHandle: 'ep_get_trip' },
                { id: 'e_gw_trip_rev',  source: 'api_gw', sourceHandle: 'dep_trip_review',      target: 'svc_trip',    targetHandle: 'ep_review'   },
                { id: 'e_gw_trip_comp', source: 'api_gw', sourceHandle: 'dep_trip_complete',    target: 'svc_trip',    targetHandle: 'ep_complete' },
                { id: 'e_gw_drv_loc',   source: 'api_gw', sourceHandle: 'dep_driver_location',  target: 'svc_driver',  targetHandle: 'ep_location' },
                { id: 'e_gw_drv_acc',   source: 'api_gw', sourceHandle: 'dep_driver_accept',    target: 'svc_driver',  targetHandle: 'ep_accept'   },

                // ── Pricing Service ─────────────────────────────────────────────────
                { id: 'e_pricing_loc',  source: 'svc_pricing', sourceHandle: 'dep_loc_cache', target: 'cache_location' },

                // ── Rider Service ───────────────────────────────────────────────────
                { id: 'e_rider_usersdb', source: 'svc_rider', sourceHandle: 'dep_users_db',    target: 'db_users'                                      },
                { id: 'e_rider_pricing', source: 'svc_rider', sourceHandle: 'dep_pricing_int', target: 'svc_pricing',     targetHandle: 'ep_estimate' },
                { id: 'e_rider_match',   source: 'svc_rider', sourceHandle: 'dep_matching',    target: 'worker_matching', targetHandle: 'ep_match'    },
                { id: 'e_rider_tripsdb', source: 'svc_rider', sourceHandle: 'dep_trips_db',    target: 'db_trips'                                      },

                // ── Driver Service ──────────────────────────────────────────────────
                { id: 'e_driver_locq',    source: 'svc_driver', sourceHandle: 'dep_loc_queue', target: 'mq_location' },
                { id: 'e_driver_tripsdb', source: 'svc_driver', sourceHandle: 'dep_trips_db',  target: 'db_trips'    },

                // ── Trip Service ────────────────────────────────────────────────────
                { id: 'e_trip_cache',    source: 'svc_trip', sourceHandle: 'dep_trip_cache', target: 'cache_trips'  },
                { id: 'e_trip_tripsdb',  source: 'svc_trip', sourceHandle: 'dep_trips_db',   target: 'db_trips'     },
                { id: 'e_trip_events',   source: 'svc_trip', sourceHandle: 'dep_events',     target: 'topic_trips'  },
                { id: 'e_trip_payment',  source: 'svc_trip', sourceHandle: 'dep_payment',    target: 'svc_payment', targetHandle: 'ep_charge' },

                // ── Trip Cache miss → Trips DB ──────────────────────────────────────
                { id: 'e_tripcache_db', source: 'cache_trips', target: 'db_trips' },

                // ── Location Queue → Location Worker ────────────────────────────────
                { id: 'e_locq_worker', source: 'mq_location', target: 'worker_location', targetHandle: 'ep_process' },

                // ── Location Worker → Cache & DB ────────────────────────────────────
                { id: 'e_locw_cache', source: 'worker_location', sourceHandle: 'dep_loc_cache', target: 'cache_location' },
                { id: 'e_locw_db',    source: 'worker_location', sourceHandle: 'dep_loc_db',    target: 'db_location'    },

                // ── Matching Engine → Cache & DB ─────────────────────────────────────
                { id: 'e_match_cache',    source: 'worker_matching', sourceHandle: 'dep_loc_cache', target: 'cache_location' },
                { id: 'e_match_tripsdb',  source: 'worker_matching', sourceHandle: 'dep_trips_db',  target: 'db_trips'       },

                // ── Location Cache miss → Location DB ────────────────────────────────
                { id: 'e_loccache_db', source: 'cache_location', target: 'db_location' },

                // ── Trip Events (fan-out) → Notification Service ─────────────────────
                { id: 'e_events_notif', source: 'topic_trips', target: 'svc_notification', targetHandle: 'ep_notify' },

                // ── Notification Service → Push Topic ────────────────────────────────
                { id: 'e_notif_push', source: 'svc_notification', sourceHandle: 'dep_push', target: 'topic_push' },

                // ── Payment Service → Payment Queue ──────────────────────────────────
                { id: 'e_payment_mq', source: 'svc_payment', sourceHandle: 'dep_payment_mq', target: 'mq_payment' },

                // ── Payment Queue → Payment Processor ───────────────────────────────
                { id: 'e_payq_proc', source: 'mq_payment', target: 'worker_payment', targetHandle: 'ep_process' },

                // ── Payment Processor → Payments DB ─────────────────────────────────
                { id: 'e_payproc_db', source: 'worker_payment', sourceHandle: 'dep_payments_db', target: 'db_payments' }
            ],
            viewport: { x: 60, y: 250, zoom: 0.22 }
        }
    }
];

export const TEMPLATES  = PUZZLES.filter(p => p.id.startsWith('template-'));
export const TUTORIALS  = PUZZLES.filter(p => !p.id.startsWith('template-'));
