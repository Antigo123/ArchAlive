use crate::types::*;
use std::collections::VecDeque;

// ═══════════════════════════════════════════════════════════════════════════════
// Node Type Inference
// ═══════════════════════════════════════════════════════════════════════════════

/// Infers the `NodeType` from the node's string ID by substring matching.
pub fn infer_type(id: &str) -> NodeType {
    if id.contains("client") {
        NodeType::Client
    } else if id.contains("server") {
        NodeType::Server
    } else if id.contains("load_balancer") {
        NodeType::LoadBalancer
    } else if id.contains("message_queue") {
        NodeType::MessageQueue
    } else if id.contains("database") {
        NodeType::Database
    } else if id.contains("cache") {
        NodeType::Cache
    } else if id.contains("api_gateway") {
        NodeType::ApiGateway
    } else if id.contains("topic") {
        NodeType::Topic
    } else {
        NodeType::Server
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Node Specs (Capacity, Speed, Delay)
// ═══════════════════════════════════════════════════════════════════════════════

/// Returns `(buffer_capacity, processing_speed, processing_delay)` for a node
/// based on its ID substring.
pub fn get_node_specs(id: &str, global_server_delay: f32) -> (f32, f32, f32) {
    if id.contains("server") {
        (5.0, 0.05, global_server_delay)
    } else if id.contains("load_balancer") {
        (999.0, 999.0, 0.0)
    } else if id.contains("message_queue") {
        (100.0, 5.0, 0.0)
    } else if id.contains("database") {
        (20.0, 0.1, global_server_delay * 2.0)
    } else if id.contains("cache") {
        (100.0, 999.0, 0.0)
    } else if id.contains("api_gateway") {
        (999.0, 999.0, 0.0)
    } else if id.contains("topic") {
        (999.0, 999.0, 0.0)
    } else {
        (999.0, 999.0, 0.0)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Node Factory
// ═══════════════════════════════════════════════════════════════════════════════

/// Creates a new `NodeData` with sensible defaults derived from the node ID.
/// Eliminates the ~40-line construction block that was duplicated for source/target
/// in the `AddEdge` operation.
pub fn create_default_node(id: &str, server_delay: f32) -> NodeData {
    let node_type = infer_type(id);
    let (cap, spd, del) = get_node_specs(id, server_delay);

    let streams = if matches!(node_type, NodeType::Client) {
        vec![TrafficStream {
            id: "stream-default".to_string(),
            label: "Read Traffic".to_string(),
            is_write: false,
            weight: 1,
            method: "GET".to_string(),
            path: "/".to_string(),
            rate: 5.0,
            accumulator: 0.0,
            retries: 0,
        }]
    } else {
        Vec::new()
    };

    NodeData {
        id: id.to_string(),
        node_type,
        buffer_capacity: cap,
        current_load: 0,
        incoming_load: 0.0,
        processing_speed: spd,
        rr_index: 0,
        processing_delay: del,
        work_queue: VecDeque::new(),
        streams,
        cache_hit_rate: 0.8,
        endpoints: Vec::new(),
        dependencies: Vec::new(),
        replicas: 1,
        replica_usage: Vec::new(),
        route_queues: std::collections::HashMap::new(),
        route_accumulators: std::collections::HashMap::new(),
        total_processed: 0,
    }
}
