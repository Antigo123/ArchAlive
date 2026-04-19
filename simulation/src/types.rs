use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;

// ═══════════════════════════════════════════════════════════════════════════════
// Console Logging (WASM only)
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(target_arch = "wasm32")]
#[allow(unused_imports)]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    #[allow(dead_code)]
    pub fn log(s: &str);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum NodeType {
    Client,
    Server,
    LoadBalancer,
    Database,
    MessageQueue,
    Cache,
    ApiGateway,
    Topic,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum PacketType {
    Request,
    Reply,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Serde Default Functions
// ═══════════════════════════════════════════════════════════════════════════════

pub fn default_method() -> String {
    "GET".to_string()
}
pub fn default_path() -> String {
    "/".to_string()
}
pub fn default_stream_rate() -> f32 {
    5.0
}
pub fn default_route_delay() -> f32 {
    30.0
}
pub fn default_strategy() -> String {
    "round_robin".to_string()
}
pub fn default_packet_type() -> PacketType {
    PacketType::Request
}
pub fn default_index() -> i32 {
    -1
}

#[allow(dead_code)]
pub fn default_period() -> u32 {
    30
}

// ═══════════════════════════════════════════════════════════════════════════════
// Data Models
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Dependency {
    pub id: String,
    pub label: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default = "default_path")]
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Route {
    pub target_id: String,
    #[serde(default = "default_route_delay")]
    pub delay: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Endpoint {
    pub id: String,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub delay: f32,
    #[serde(default)]
    pub forward_to: Vec<Route>,
    #[serde(default = "default_strategy")]
    pub strategy: String,
    #[serde(default)]
    pub error_rate: f32,
    #[serde(default)]
    pub rate: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrafficStream {
    pub id: String,
    pub label: String,
    pub is_write: bool,
    pub weight: u32,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default = "default_path")]
    pub path: String,
    #[serde(default = "default_stream_rate")]
    pub rate: f32,
    #[serde(skip)]
    pub accumulator: f32,
    #[serde(default)]
    pub retries: u32,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct GlobalStats {
    pub total_generated: u64,
    pub total_processed: u64,
    pub total_dropped: u64,
    pub avg_latency: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NodeData {
    pub id: String,
    pub node_type: NodeType,
    pub buffer_capacity: f32,
    pub current_load: u32,
    #[serde(default)]
    pub incoming_load: f32,
    pub processing_speed: f32,
    pub rr_index: usize,
    #[serde(default)]
    pub processing_delay: f32,
    #[serde(default)]
    pub streams: Vec<TrafficStream>,
    #[serde(default)]
    pub cache_hit_rate: f32,
    #[serde(default)]
    pub endpoints: Vec<Endpoint>,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    #[serde(default, skip)]
    pub work_queue: VecDeque<(u64, Packet)>,
    #[serde(default)]
    pub replicas: u32,
    #[serde(default, skip)]
    pub replica_usage: Vec<f64>,
    #[serde(default, skip)]
    pub route_queues: HashMap<String, VecDeque<Packet>>,
    #[serde(default, skip)]
    pub route_accumulators: HashMap<String, f32>,
    #[serde(default, skip)]
    pub total_processed: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Packet {
    pub id: u64,
    pub source_id: String,
    pub target_id: String,
    pub progress: f32,
    pub speed: f32,
    pub dropped: bool,
    #[serde(default)]
    pub ttl: u32,
    #[serde(default)]
    pub start_tick: u64,
    #[serde(default = "default_packet_type")]
    pub p_type: PacketType,
    #[serde(default)]
    pub is_write: bool,
    #[serde(default)]
    pub method: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub source_handle: String,
    #[serde(default)]
    pub target_handle: String,
    #[serde(default, skip)]
    pub trace: Vec<(String, String)>,
    #[serde(default = "default_index")]
    pub source_index: i32,
    #[serde(default = "default_index")]
    pub target_index: i32,
    #[serde(default)]
    pub error_code: u16,
    #[serde(default)]
    pub retry_count: u32,
    #[serde(default)]
    pub max_retries: u32,
    #[serde(default)]
    pub route_target: String,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Wire Types (JS ↔ WASM)
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize)]
pub struct NodeStatus {
    pub id: String,
    pub load: f32,
    pub capacity: f32,
    #[serde(default)]
    pub delay: f32,
    #[serde(default)]
    pub rate: f32,
    #[serde(default)]
    pub replicas: u32,
}

#[derive(Serialize, Deserialize)]
pub struct SimState {
    pub packets: Vec<Packet>,
    pub curr_tick: u64,
    pub node_statuses: Vec<NodeStatus>,
    pub stats: GlobalStats,
}

#[derive(Clone, Debug)]
pub struct EdgeConn {
    pub target_id: String,
    pub source_handle: String,
    pub target_handle: String,
    pub delay_ms: f32, // 0 = default visual speed (~2s transit), >0 = explicit latency
}
