import { Smartphone, Server, Database, Zap, Scale, Network, Container, Radio } from 'lucide-react';

export const NODE_TYPES_CONFIG = [
    { type: 'client', label: 'Client', icon: Smartphone, color: 'text-blue-600' },
    { type: 'server', label: 'Server', icon: Server, color: 'text-green-600' },
    { type: 'database', label: 'Database', icon: Database, color: 'text-amber-600' },
    { type: 'cache', label: 'Cache', icon: Zap, color: 'text-purple-600' },
    { type: 'load_balancer', label: 'Load Balancer', icon: Scale, color: 'text-indigo-600' },
    { type: 'api_gateway', label: 'API Gateway', icon: Network, color: 'text-indigo-600' },
    { type: 'message_queue', label: 'Message Queue', icon: Container, color: 'text-orange-600' },
    { type: 'topic', label: 'Topic (Fan Out)', icon: Radio, color: 'text-pink-600' },
];

export interface Endpoint {
    id: string;
    method: string;
    path: string;
    delay?: number;
    forward_to?: any[];
    rate?: number;
}

export interface Stream {
    id: string;
    label: string;
    is_write?: boolean;
    weight?: number;
    method: string;
    path: string;
    rate?: number;
}

export interface NodeDependency {
    id: string;
    label: string;
    method?: string;
    path?: string;
}

export interface NodeData {
    label?: string;
    request_rate?: number;
    buffer_capacity?: number;
    processing_delay?: number;
    endpoints?: Endpoint[];
    streams?: Stream[];
    dependencies?: NodeDependency[];
    cache_hit_rate?: number;
    replicas?: number;
    [key: string]: any;
}
