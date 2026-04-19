use crate::node::create_default_node;
use crate::types::*;

// ═══════════════════════════════════════════════════════════════════════════════
// Simulation Operations (Deferred Command Pattern)
// ═══════════════════════════════════════════════════════════════════════════════

/// Operations queued from the JS thread and applied at the start of each tick.
/// This deferred pattern avoids borrow conflicts between the WASM API surface
/// (which holds `&self`) and the mutable simulation state.
#[derive(Clone)]
pub enum SimOp {
    AddEdge(String, String, String, String, f32), // source, target, source_handle, target_handle, delay_ms
    ClearEdges,
    SetNodeStreams(String, Vec<TrafficStream>),
    SetNodeCapacity(String, f32),
    SetNodeDelay(String, f32),
    SetNodeRequestRate(String, f32),
    SetNodeCacheHitRate(String, f32),
    SetNodeEndpoints(String, Vec<Endpoint>),
    SetNodeDependencies(String, Vec<Dependency>),
    SetNodeReplicas(String, u32),
    RemoveNode(String),
}

// ═══════════════════════════════════════════════════════════════════════════════
// Operation Processing
// ═══════════════════════════════════════════════════════════════════════════════

use crate::engine::SimulationInner;

impl SimulationInner {
    /// Applies all queued operations to the simulation state.
    /// Called once at the beginning of each tick.
    pub fn apply_ops(&mut self, ops: Vec<SimOp>) {
        for op in ops {
            match op {
                SimOp::ClearEdges => {
                    self.edges.clear();
                    self.nodes.clear();
                    self.packets.clear();
                    self.stats = GlobalStats::default();
                    self.latency_window.clear();
                    self.node_registry.clear();
                    self.id_to_index.clear();
                }

                SimOp::RemoveNode(id) => {
                    let idx_to_remove_opt = self.id_to_index.get(&id).copied();

                    if let Some(idx_to_remove) = idx_to_remove_opt {
                        self.id_to_index.remove(&id);
                        self.nodes.swap_remove(idx_to_remove);
                        self.edges.swap_remove(idx_to_remove);
                        self.node_registry.swap_remove(idx_to_remove);

                        // Update index for the element that was swapped in
                        if idx_to_remove < self.nodes.len() {
                            let swapped_id = self.nodes[idx_to_remove].id.clone();
                            self.id_to_index.insert(swapped_id, idx_to_remove);
                        }

                        // Invalidate all packet indices to force re-lookup
                        for pkt in &mut self.packets {
                            pkt.target_index = -1;
                            pkt.source_index = -1;
                        }
                        for node in &mut self.nodes {
                            for (_, pkt) in &mut node.work_queue {
                                pkt.target_index = -1;
                                pkt.source_index = -1;
                            }
                        }
                        for (_, pkt) in &mut self.outbound_buffer {
                            pkt.target_index = -1;
                            pkt.source_index = -1;
                        }
                    }
                }

                SimOp::AddEdge(s, t, s_h, t_h, delay_ms) => {
                    let delay = self.server_delay;

                    // Ensure source node exists
                    let s_idx = if let Some(&idx) = self.id_to_index.get(&s) {
                        idx
                    } else {
                        let idx = self.nodes.len();
                        self.nodes.push(create_default_node(&s, delay));
                        self.edges.push(Vec::new());
                        self.node_registry.push(s.clone());
                        self.id_to_index.insert(s.clone(), idx);
                        idx
                    };

                    // Ensure target node exists
                    if !self.id_to_index.contains_key(&t) {
                        let idx = self.nodes.len();
                        self.nodes.push(create_default_node(&t, delay));
                        self.edges.push(Vec::new());
                        self.node_registry.push(t.clone());
                        self.id_to_index.insert(t.clone(), idx);
                    }

                    let conn = EdgeConn {
                        target_id: t,
                        source_handle: s_h,
                        target_handle: t_h,
                        delay_ms,
                    };
                    self.edges[s_idx].push(conn);
                }

                SimOp::SetNodeStreams(id, streams) => {
                    if let Some(&idx) = self.id_to_index.get(&id) {
                        if let Some(node) = self.nodes.get_mut(idx) {
                            node.streams = streams;
                        }
                    }
                }

                SimOp::SetNodeEndpoints(id, eps) => {
                    if let Some(&idx) = self.id_to_index.get(&id) {
                        if let Some(node) = self.nodes.get_mut(idx) {
                            node.endpoints = eps;
                        }
                    }
                }

                SimOp::SetNodeDependencies(id, deps) => {
                    if let Some(&idx) = self.id_to_index.get(&id) {
                        if let Some(node) = self.nodes.get_mut(idx) {
                            node.dependencies = deps;
                        }
                    }
                }

                SimOp::SetNodeCapacity(id, cap) => {
                    if let Some(&idx) = self.id_to_index.get(&id) {
                        if let Some(node) = self.nodes.get_mut(idx) {
                            node.buffer_capacity = cap;
                        }
                    }
                }

                SimOp::SetNodeDelay(id, delay) => {
                    self.apply_delay_change(&id, delay);
                }

                SimOp::SetNodeRequestRate(_id, _rate) => {
                    // Deprecated: Rate is now per-stream
                }

                SimOp::SetNodeCacheHitRate(id, rate) => {
                    if let Some(&idx) = self.id_to_index.get(&id) {
                        if let Some(node) = self.nodes.get_mut(idx) {
                            node.cache_hit_rate = rate;
                        }
                    }
                }

                SimOp::SetNodeReplicas(id, replicas) => {
                    let tick = self.tick_count;
                    if let Some(&idx) = self.id_to_index.get(&id) {
                        if let Some(node) = self.nodes.get_mut(idx) {
                            node.replicas = replicas;
                            node.replica_usage = vec![tick as f64; replicas as usize];
                        }
                    }
                }

            }
        }
    }

    /// Applies a processing delay change to a node, rescheduling all in-flight work.
    /// Respects per-route delays: packets with a `route_target` use their route's
    /// specific delay from the endpoint's forward_to configuration.
    fn apply_delay_change(&mut self, id: &str, delay: f32) {
        let tick = self.tick_count;
        if let Some(&idx) = self.id_to_index.get(id) {
            if let Some(node) = self.nodes.get_mut(idx) {
                node.processing_delay = delay;

                if node.work_queue.is_empty() {
                    return;
                }

                let packets: Vec<Packet> = node.work_queue.drain(..).map(|(_, p)| p).collect();

                if matches!(node.node_type, NodeType::Server)
                    || matches!(node.node_type, NodeType::Database)
    
                {
                    // Reset replica lanes to "now"
                    let r_count = node.replicas.max(1) as usize;
                    if node.replica_usage.len() != r_count {
                        node.replica_usage = vec![tick as f64; r_count];
                    } else {
                        node.replica_usage.fill(tick as f64);
                    }

                    for pkt in packets {
                        // Determine the correct delay for this packet
                        let pkt_delay = if !pkt.route_target.is_empty() {
                            // Look up the route-specific delay from endpoint config
                            let mut found_delay = delay;
                            for ep in &node.endpoints {
                                if ep.method == pkt.method && ep.path == pkt.path {
                                    if let Some(route) = ep.forward_to.iter()
                                        .find(|r| r.target_id == pkt.route_target)
                                    {
                                        if route.delay > 0.0 {
                                            found_delay = route.delay;
                                        }
                                        break;
                                    }
                                }
                            }
                            found_delay
                        } else {
                            delay
                        };

                        let mut best_lane_idx = 0;
                        let mut min_finish = f64::MAX;
                        for (i, finish_time) in node.replica_usage.iter().enumerate() {
                            if *finish_time < min_finish {
                                min_finish = *finish_time;
                                best_lane_idx = i;
                            }
                        }
                        let start_time = f64::max(tick as f64, min_finish);
                        let finish_at = start_time + (pkt_delay as f64);
                        node.replica_usage[best_lane_idx] = finish_at;
                        node.work_queue.push_back((finish_at.ceil() as u64, pkt));
                    }
                } else if matches!(node.node_type, NodeType::ApiGateway) {
                    for pkt in packets {
                        let last_finish =
                            node.work_queue.back().map(|(t, _)| *t as f64).unwrap_or(tick as f64);
                        let start_time = f64::max(tick as f64, last_finish);
                        let finish_at = start_time + (delay as f64);
                        node.work_queue.push_back((finish_at.ceil() as u64, pkt));
                    }
                } else {
                    for pkt in packets {
                        let finish_at = (tick as f64) + (delay as f64);
                        node.work_queue.push_back((finish_at.ceil() as u64, pkt));
                    }
                }

                node.current_load = node.work_queue.len() as u32;
            }
        }
    }
}
