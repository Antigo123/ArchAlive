use crate::types::*;
use std::collections::HashMap;
use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

// ═══════════════════════════════════════════════════════════════════════════════
// Simulation Core State
// ═══════════════════════════════════════════════════════════════════════════════

pub struct SimulationInner {
    pub nodes: Vec<NodeData>,
    pub edges: Vec<Vec<EdgeConn>>,   // source_index -> [connections]
    pub packets: Vec<Packet>,
    pub tick_count: u64,
    pub server_delay: f32,
    pub next_packet_id: u64,
    pub stats: GlobalStats,
    pub latency_window: VecDeque<u64>,
    pub outbound_buffer: Vec<(String, Packet)>,
    pub node_registry: Vec<String>,
    pub id_to_index: HashMap<String, usize>,
    pub packet_buffer: Vec<f32>,
    pub node_status_buffer: Vec<f32>,
}

/// Convert an edge's latency_ms to packet speed (progress units per tick).
/// delay_ms is ADDITIVE on top of the default transit time (~2222ms at 0.0075 speed).
/// 0ms → unchanged default. Positive values slow packets down further.
fn edge_speed(delay_ms: f32) -> f32 {
    const DEFAULT_TRANSIT_MS: f32 = 1000.0 / (0.0075 * 60.0); // ≈ 2222ms
    let total_ms = DEFAULT_TRANSIT_MS + delay_ms.max(0.0);
    1000.0 / (total_ms * 60.0)
}

impl SimulationInner {
    pub fn new() -> Self {
        SimulationInner {
            nodes: Vec::new(),
            edges: Vec::new(),
            packets: Vec::new(),
            tick_count: 0,
            server_delay: 30.0,
            next_packet_id: 0,
            stats: GlobalStats::default(),
            latency_window: VecDeque::with_capacity(300),
            outbound_buffer: Vec::with_capacity(100),
            node_registry: Vec::new(),
            id_to_index: HashMap::new(),
            packet_buffer: Vec::new(),
            node_status_buffer: Vec::new(),
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Tick Orchestrator
    // ═══════════════════════════════════════════════════════════════════════════

    /// Advances the simulation by one tick.
    /// Each phase is a discrete, named method for clarity and testability.
    pub fn tick(&mut self) -> JsValue {
        self.tick_count += 1;
        let tick_current = self.tick_count;

        self.outbound_buffer.clear();
        self.drain_completed_work(tick_current);
        self.process_message_queues(tick_current);
        self.process_topics(tick_current);
        self.route_outbound_packets(tick_current);
        self.move_packets_and_handle_arrivals(tick_current);
        self.generate_client_traffic(tick_current);
        self.export_state(tick_current)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 1: Drain Completed Work
    // ═══════════════════════════════════════════════════════════════════════════

    /// Drains completed work items from node work queues into the outbound buffer.
    /// For Server nodes, also drains per-route queues using token-bucket rate limiting.
    fn drain_completed_work(&mut self, tick_current: u64) {
        for node in self.nodes.iter_mut() {
            // MessageQueue and Topic are handled in separate passes
            if matches!(node.node_type, NodeType::MessageQueue)
                || matches!(node.node_type, NodeType::Topic)
            {
                node.current_load = node.work_queue.len() as u32;
                continue;
            }

            // Drain delay-based work queue (used for __return__ routes and non-endpoint nodes)
            if !node.work_queue.is_empty() {
                while let Some(&(finish_tick, _)) = node.work_queue.front() {
                    if tick_current >= finish_tick {
                        if let Some((_, pkt)) = node.work_queue.pop_front() {
                            self.outbound_buffer.push((node.id.clone(), pkt));
                        }
                    } else {
                        break;
                    }
                }
            }

            // Drain per-route queues with token-bucket rate limiting (Server only)
            if matches!(node.node_type, NodeType::Server)
                && !node.route_queues.is_empty()
            {
                // Build a map of route_id -> rate (RPS) from endpoint config
                let mut route_rates: Vec<(String, f32)> = Vec::new();
                for ep in &node.endpoints {
                    for route in &ep.forward_to {
                        let rate = if route.delay > 0.0 {
                            60.0 / route.delay // delay (ticks) → RPS
                        } else {
                            f32::MAX // delay=0 means unlimited throughput
                        };
                        route_rates.push((route.target_id.clone(), rate));
                    }
                }

                // Advance accumulators and release packets
                for (route_id, rate) in &route_rates {
                    if let Some(queue) = node.route_queues.get_mut(route_id) {
                        if queue.is_empty() {
                            continue;
                        }

                        if rate.is_infinite() || *rate >= f32::MAX / 2.0 {
                            // Unlimited throughput — drain entire queue this tick
                            while let Some(pkt) = queue.pop_front() {
                                self.outbound_buffer.push((node.id.clone(), pkt));
                            }
                            continue;
                        }

                        let acc = node.route_accumulators
                            .entry(route_id.clone())
                            .or_insert(0.0);
                        *acc += rate / 60.0; // Per-tick fraction of RPS
                        if *acc > 2.0 { *acc = 2.0; } // Cap to prevent burst after idle

                        while *acc >= 1.0 && !queue.is_empty() {
                            if let Some(pkt) = queue.pop_front() {
                                self.outbound_buffer.push((node.id.clone(), pkt));
                            }
                            *acc -= 1.0;
                        }
                    }
                }
            }

            // Update load: work_queue + all route queues
            let route_queue_total: usize = node.route_queues.values().map(|q| q.len()).sum();
            node.current_load = (node.work_queue.len() + route_queue_total) as u32;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 3: Message Queue Processing
    // ═══════════════════════════════════════════════════════════════════════════

    fn process_message_queues(&mut self, _tick_current: u64) {
        // Each entry: (mq_node_idx, chosen_target_id, new_rr_index)
        let mut mq_moves: Vec<(usize, String, usize)> = Vec::new();

        for (node_idx, node) in self.nodes.iter().enumerate() {
            if matches!(node.node_type, NodeType::MessageQueue) {
                if node.work_queue.front().is_some() {
                    let targets = &self.edges[node_idx];
                    let n = targets.len();
                    if n == 0 {
                        continue;
                    }

                    // Scan all targets starting from rr_index, skip full ones.
                    // This prevents starvation when the designated target is saturated.
                    let mut chosen: Option<(String, usize)> = None;
                    for i in 0..n {
                        let candidate_id = &targets[(node.rr_index + i) % n].target_id;
                        if let Some(&target_idx) = self.id_to_index.get(candidate_id) {
                            let t = &self.nodes[target_idx];
                            if (t.current_load as f32) + t.incoming_load < t.buffer_capacity {
                                // Advance past the chosen target so the next packet
                                // starts from the one after it (preserving round-robin fairness).
                                chosen = Some((candidate_id.clone(), node.rr_index + i + 1));
                                break;
                            }
                        }
                    }

                    if let Some((target_id, next_rr)) = chosen {
                        mq_moves.push((node_idx, target_id, next_rr));
                    }
                }
            }
        }

        for (mq_idx, target_id, next_rr) in mq_moves {
            let mq = &mut self.nodes[mq_idx];
            let mq_id = mq.id.clone();
            mq.rr_index = next_rr;
            if let Some((_, mut pkt)) = mq.work_queue.pop_front() {
                // Override the packet's route target to the chosen node
                pkt.route_target = target_id;
                self.outbound_buffer.push((mq_id, pkt));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 4: Topic Fan-out Processing
    // ═══════════════════════════════════════════════════════════════════════════

    fn process_topics(&mut self, _tick_current: u64) {
        let mut topic_indices: Vec<usize> = Vec::new();

        for (node_idx, node) in self.nodes.iter().enumerate() {
            if matches!(node.node_type, NodeType::Topic) && !node.work_queue.is_empty() {
                // Only dequeue if at least one subscriber has capacity (backpressure)
                let has_room = self.edges[node_idx].iter().any(|t| {
                    self.id_to_index.get(&t.target_id)
                        .map(|&idx| {
                            let n = &self.nodes[idx];
                            (n.current_load as f32) + n.incoming_load < n.buffer_capacity
                        })
                        .unwrap_or(false)
                });
                if has_room {
                    topic_indices.push(node_idx);
                }
            }
        }

        // Push one raw packet per topic to outbound_buffer.
        // route_outbound_packets sees is_topic=true and calls route_fan_out,
        // which correctly fans the packet out to all subscribers exactly once.
        for topic_idx in topic_indices {
            let topic = &mut self.nodes[topic_idx];
            let topic_id = topic.id.clone();
            if let Some((_, pkt)) = topic.work_queue.pop_front() {
                self.outbound_buffer.push((topic_id, pkt));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 5: Route Outbound Packets
    // ═══════════════════════════════════════════════════════════════════════════

    /// Routes packets from the outbound buffer to their next hop.
    /// Handles replies, endpoint matching, fan-out, round-robin, and implicit returns.
    fn route_outbound_packets(&mut self, tick_current: u64) {
        // We need to drain outbound_buffer into a temporary to avoid borrow conflicts
        let buffer: Vec<(String, Packet)> = self.outbound_buffer.drain(..).collect();

        for (node_id, mut pkt) in buffer {
            if matches!(pkt.p_type, PacketType::Reply) {
                self.route_reply_packet(&node_id, &mut pkt, tick_current);
                self.packets.push(pkt);
                continue;
            }

            let node_idx = if pkt.target_index >= 0 {
                pkt.target_index as usize
            } else {
                if let Some(&idx) = self.id_to_index.get(&node_id) {
                    idx
                } else {
                    self.packets.push(pkt);
                    continue;
                }
            };

            if node_idx >= self.edges.len() {
                self.packets.push(pkt);
                continue;
            }

            // ── Per-route targeted routing (from per-route delay scheduling) ──
            if !pkt.route_target.is_empty() {
                let target_handle = pkt.route_target.clone();
                pkt.route_target.clear(); // Consume route_target to prevent affecting downstream routing

                // Handle __return__ route: convert to reply
                if target_handle == "__return__" {
                    if !pkt.trace.is_empty() {
                        pkt.p_type = PacketType::Reply;
                        let (next_target, saved_handle) = pkt.trace.pop().unwrap();
                        let current_node_id = node_id.clone();
                        pkt.source_id = current_node_id.clone();
                        pkt.source_index = node_idx as i32;
                        pkt.target_id = next_target.clone();
                        pkt.progress = 0.0;

                        if let Some(&t_idx) = self.id_to_index.get(&next_target) {
                            let reply_delay_ms = {
                                let edges_from_target = &self.edges[t_idx];
                                if let Some(reverse_edge) = edges_from_target.iter().find(|e| {
                                    e.target_id == current_node_id
                                        && e.target_handle == saved_handle
                                }) {
                                    pkt.source_handle = reverse_edge.target_handle.clone();
                                    pkt.target_handle = reverse_edge.source_handle.clone();
                                    reverse_edge.delay_ms
                                } else {
                                    0.0
                                }
                            };
                            self.nodes[t_idx].incoming_load += 1.0;
                            pkt.target_index = t_idx as i32;

                            pkt.speed = edge_speed(reply_delay_ms);
                        } else {
                            pkt.target_index = -1;
                        }
                    } else {
                        // No trace to return to - drop
                        self.stats.total_dropped += 1;
                        pkt.dropped = true;
                        pkt.speed = 0.0;
                        pkt.ttl = 20;
                        pkt.error_code = 404;
                    }
                    self.packets.push(pkt);
                    continue;
                }

                // Check error rate from matching endpoint
                {
                    let node = &self.nodes[node_idx];
                    if !node.endpoints.is_empty() {
                        if let Some(ep) = node.endpoints.iter()
                            .find(|e| e.method == pkt.method && e.path == pkt.path)
                        {
                            if ep.error_rate > 0.0 {
                                let pseudo_rand = ((pkt.id + tick_current) % 100) as f32 / 100.0;
                                if pseudo_rand < ep.error_rate {
                                    self.stats.total_dropped += 1;
                                    pkt.dropped = true;
                                    pkt.speed = 0.0;
                                    pkt.ttl = 20;
                                    pkt.error_code = 500;
                                    self.packets.push(pkt);
                                    continue;
                                }
                            }
                        }
                    }
                }

                // Find edges matching the target handle and route directly.
                // Two cases:
                //   - Server dependency routing: route_target == dep ID == edge source_handle
                //   - Message queue routing:     route_target == node ID == edge target_id
                let targets = &self.edges[node_idx];
                let matching_targets: Vec<EdgeConn> = targets.iter()
                    .filter(|t| t.source_handle == target_handle || t.target_id == target_handle)
                    .cloned()
                    .collect();

                if !matching_targets.is_empty() {
                    self.route_round_robin(
                        &node_id,
                        node_idx,
                        pkt,
                        &matching_targets,
                        tick_current,
                    );
                } else {
                    // No matching edge found - drop
                    self.stats.total_dropped += 1;
                    pkt.dropped = true;
                    pkt.speed = 0.0;
                    pkt.ttl = 20;
                    pkt.error_code = 404;
                    self.packets.push(pkt);
                }
                continue;
            }

            // ── Legacy routing (non-route-targeted packets) ──
            let targets = &self.edges[node_idx];

            if !targets.is_empty() {
                // Endpoint logic
                let (valid_targets, endpoint_strategy, endpoint_error_rate, is_topic) = {
                    let node = &self.nodes[node_idx];
                    let mut vt = Vec::new();
                    let mut strat = "round_robin".to_string();
                    let mut err_rate = 0.0;

                    if (matches!(node.node_type, NodeType::Server)
                        || matches!(node.node_type, NodeType::ApiGateway))
                        && !node.endpoints.is_empty()
                    {
                        let matching_eps: Vec<&Endpoint> = node
                            .endpoints
                            .iter()
                            .filter(|e| e.method == pkt.method && e.path == pkt.path)
                            .collect();

                        if !matching_eps.is_empty() {
                            strat = matching_eps[0].strategy.clone();
                            err_rate = matching_eps[0].error_rate;

                            for ep in matching_eps {
                                let ep_is_return = ep.forward_to.iter().any(|r| r.target_id == "__return__");
                                if !ep_is_return && !ep.forward_to.is_empty() {
                                    for t in targets {
                                        if ep.forward_to.iter().any(|r| r.target_id == t.source_handle)
                                        {
                                            vt.push(t.clone());
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        vt.extend(targets.iter().cloned());
                    }

                    (vt, strat, err_rate, matches!(node.node_type, NodeType::Topic))
                };

                // Check return route
                let is_return_route = {
                    let node = &self.nodes[node_idx];
                    if (matches!(node.node_type, NodeType::Server)
                        || matches!(node.node_type, NodeType::ApiGateway))
                        && !node.endpoints.is_empty()
                    {
                        node.endpoints
                            .iter()
                            .filter(|e| e.method == pkt.method && e.path == pkt.path)
                            .any(|ep| ep.forward_to.iter().any(|r| r.target_id == "__return__"))
                    } else {
                        false
                    }
                };

                // Handle Error Rate
                if endpoint_error_rate > 0.0 {
                    let pseudo_rand = ((pkt.id + tick_current) % 100) as f32 / 100.0;
                    if pseudo_rand < endpoint_error_rate {
                        self.stats.total_dropped += 1;
                        pkt.dropped = true;
                        pkt.speed = 0.0;
                        pkt.ttl = 20;
                        pkt.error_code = 500;
                        self.packets.push(pkt);
                        continue;
                    }
                }

                // Handle __return__ route
                if is_return_route && !pkt.trace.is_empty() {
                    pkt.p_type = PacketType::Reply;
                    let (next_target, saved_handle) = pkt.trace.pop().unwrap();
                    let current_node_id = node_id.clone();
                    pkt.source_id = current_node_id.clone();
                    pkt.source_index = node_idx as i32;
                    pkt.target_id = next_target.clone();
                    pkt.progress = 0.0;

                    let original_target_handle = saved_handle;
                    if let Some(&t_idx) = self.id_to_index.get(&next_target) {
                        let edges_from_target = &self.edges[t_idx];
                        if let Some(reverse_edge) = edges_from_target.iter().find(|e| {
                            e.target_id == current_node_id
                                && e.target_handle == original_target_handle
                        }) {
                            pkt.source_handle = reverse_edge.target_handle.clone();
                            pkt.target_handle = reverse_edge.source_handle.clone();
                        }

                        self.nodes[t_idx].incoming_load += 1.0;
                        pkt.target_index = t_idx as i32;
                    } else {
                        pkt.target_index = -1;
                    }
                    self.packets.push(pkt);
                    continue;
                }

                if !valid_targets.is_empty() {
                    let is_fan_out = is_topic || endpoint_strategy == "fan_out";

                    if is_fan_out {
                        self.route_fan_out(
                            &node_id,
                            node_idx,
                            &pkt,
                            &valid_targets,
                            tick_current,
                        );
                        continue;
                    } else {
                        self.route_round_robin(
                            &node_id,
                            node_idx,
                            pkt,
                            &valid_targets,
                            tick_current,
                        );
                        continue;
                    }
                }
            }

            // Cache miss with no downstream target: drop instead of silently replying
            if matches!(self.nodes[node_idx].node_type, NodeType::Cache) && !pkt.is_write {
                self.stats.total_dropped += 1;
                pkt.dropped = true;
                pkt.speed = 0.0;
                pkt.ttl = 20;
                pkt.error_code = 503;
                self.packets.push(pkt);
                continue;
            }

            // Implicit Return or Drop
            self.handle_implicit_return(node_id, node_idx, pkt, tick_current);
        }
    }

    /// Routes a reply packet back along its trace path.
    fn route_reply_packet(&mut self, node_id: &str, pkt: &mut Packet, _tick_current: u64) {
        let mut reply_delay_ms = 0.0f32;

        if let Some(&src_idx) = self.id_to_index.get(node_id) {
            pkt.source_id = node_id.to_string();
            pkt.source_index = src_idx as i32;

            let original_target_handle = pkt.target_handle.clone();
            if let Some(&t_target_idx) = self.id_to_index.get(&pkt.target_id) {
                let edges_from_target = &self.edges[t_target_idx];
                if let Some(reverse_edge) = edges_from_target.iter().find(|e| {
                    e.target_id == node_id && e.target_handle == original_target_handle
                }) {
                    pkt.source_handle = reverse_edge.target_handle.clone();
                    pkt.target_handle = reverse_edge.source_handle.clone();
                    reply_delay_ms = reverse_edge.delay_ms;
                }
            }
        }

        if let Some(&idx) = self.id_to_index.get(&pkt.target_id) {
            let next_node = &mut self.nodes[idx];
            next_node.incoming_load += 1.0;
            pkt.target_index = idx as i32;

            pkt.speed = edge_speed(reply_delay_ms);
        } else {
            pkt.target_index = -1;
        }
    }

    /// Fan-out routing: sends a copy of the packet to ALL valid targets.
    fn route_fan_out(
        &mut self,
        node_id: &str,
        node_idx: usize,
        pkt: &Packet,
        valid_targets: &[EdgeConn],
        _tick_current: u64,
    ) {
        for next_conn in valid_targets {
            let mut new_pkt = pkt.clone();
            let next_hop = next_conn.target_id.clone();
            new_pkt.source_handle = next_conn.source_handle.clone();
            new_pkt.target_handle = next_conn.target_handle.clone();

            let is_client_target = self
                .id_to_index
                .get(&next_hop)
                .map(|&idx| matches!(self.nodes[idx].node_type, NodeType::Client))
                .unwrap_or(false);

            if is_client_target {
                new_pkt.p_type = PacketType::Reply;
                new_pkt.trace.clear();
                new_pkt.target_id = next_hop;
                new_pkt.source_id = node_id.to_string();
                new_pkt.source_index = node_idx as i32;
                new_pkt.progress = 0.0;
            } else {
                if new_pkt.trace.len() > 100 {
                    continue;
                }
                new_pkt
                    .trace
                    .push((node_id.to_string(), new_pkt.target_handle.clone()));
                new_pkt.source_id = node_id.to_string();
                new_pkt.source_index = node_idx as i32;
                new_pkt.target_id = next_hop.clone();
                new_pkt.progress = 0.0;
            }

            if let Some(&idx) = self.id_to_index.get(&new_pkt.target_id) {
                self.nodes[idx].incoming_load += 1.0;
                new_pkt.target_index = idx as i32;

                new_pkt.speed = edge_speed(next_conn.delay_ms);
            } else {
                new_pkt.target_index = -1;
            }

            self.packets.push(new_pkt);
        }
    }

    /// Round-robin routing: picks the next target in rotation.
    fn route_round_robin(
        &mut self,
        node_id: &str,
        node_idx: usize,
        mut pkt: Packet,
        valid_targets: &[EdgeConn],
        _tick_current: u64,
    ) {
        let next_conn = {
            let n = &mut self.nodes[node_idx];
            let idx = n.rr_index;
            if !matches!(n.node_type, NodeType::MessageQueue) {
                n.rr_index += 1;
            }
            valid_targets[idx % valid_targets.len()].clone()
        };

        let next_hop = next_conn.target_id.clone();
        pkt.source_handle = next_conn.source_handle.clone();

        // Apply transformation if this is a service call (dependency)
        if let Some(dep) = self.nodes[node_idx]
            .dependencies
            .iter()
            .find(|d| d.id == next_conn.source_handle)
        {
            pkt.method = dep.method.clone();
            pkt.path = dep.path.clone();
            // Derive is_write from the dependency's method so cache hit/miss logic
            // uses the call semantics rather than the original client stream's flag.
            pkt.is_write = matches!(dep.method.to_uppercase().as_str(), "POST" | "PUT" | "DELETE" | "PATCH");
        }

        pkt.target_handle = next_conn.target_handle.clone();

        let is_client_target = self
            .id_to_index
            .get(&next_hop)
            .map(|&idx| matches!(self.nodes[idx].node_type, NodeType::Client))
            .unwrap_or(false);

        if is_client_target {
            pkt.p_type = PacketType::Reply;
            pkt.trace.clear();
            pkt.target_id = next_hop;
            pkt.source_id = node_id.to_string();
            pkt.source_index = node_idx as i32;
            pkt.progress = 0.0;
        } else {
            if pkt.trace.len() > 100 {
                self.stats.total_dropped += 1;
                pkt.dropped = true;
                pkt.speed = 0.0;
                pkt.ttl = 100;
                pkt.error_code = 508; // Loop Detected
                self.packets.push(pkt);
                return;
            }

            pkt.trace
                .push((node_id.to_string(), pkt.target_handle.clone()));
            pkt.source_id = node_id.to_string();
            pkt.source_index = node_idx as i32;
            pkt.target_id = next_hop.clone();
            pkt.progress = 0.0;
        }

        if let Some(&idx) = self.id_to_index.get(&pkt.target_id) {
            self.nodes[idx].incoming_load += 1.0;
            pkt.target_index = idx as i32;

            pkt.speed = edge_speed(next_conn.delay_ms);
        } else {
            pkt.target_index = -1;
        }

        self.packets.push(pkt);
    }

    /// Handles packets that have no forward route: either returns via trace or drops.
    fn handle_implicit_return(
        &mut self,
        node_id: String,
        _node_idx: usize,
        mut pkt: Packet,
        _tick_current: u64,
    ) {
        let (is_lb_or_gw, node_idx_opt) = {
            if let Some(&idx) = self.id_to_index.get(&node_id) {
                (
                    matches!(self.nodes[idx].node_type, NodeType::LoadBalancer) || matches!(self.nodes[idx].node_type, NodeType::ApiGateway),
                    Some(idx),
                )
            } else {
                (false, None)
            }
        };

        if !pkt.trace.is_empty() && !is_lb_or_gw {
            pkt.p_type = PacketType::Reply;
            let (next_target, saved_handle) = pkt.trace.pop().unwrap();
            let current_node_id = node_id.clone();
            pkt.source_id = current_node_id.clone();
            if let Some(idx) = node_idx_opt {
                pkt.source_index = idx as i32;
            }

            pkt.target_id = next_target.clone();
            pkt.progress = 0.0;

            let original_target_handle = saved_handle;
            let reply_delay_ms = if let Some(&t_idx) = self.id_to_index.get(&next_target) {
                let d = {
                    let edges_from_target = &self.edges[t_idx];
                    let reverse_edge = edges_from_target.iter().find(|e| {
                        e.target_id == current_node_id && e.target_handle == original_target_handle
                    }).or_else(|| edges_from_target.iter().find(|e| {
                        e.target_id == current_node_id && e.source_handle == original_target_handle
                    }));
                    reverse_edge.map(|reverse_edge| {
                        pkt.source_handle = reverse_edge.target_handle.clone();
                        pkt.target_handle = reverse_edge.source_handle.clone();
                        reverse_edge.delay_ms
                    }).unwrap_or(0.0)
                };
                self.nodes[t_idx].incoming_load += 1.0;
                pkt.target_index = t_idx as i32;
                d
            } else {
                pkt.target_index = -1;
                0.0
            };

            pkt.speed = edge_speed(reply_delay_ms);

            self.packets.push(pkt);
        } else {
            self.stats.total_dropped += 1;
            pkt.dropped = true;
            pkt.speed = 0.0;
            pkt.ttl = 20;
            pkt.error_code = 404;
            self.packets.push(pkt);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 6: Move Packets & Handle Arrivals
    // ═══════════════════════════════════════════════════════════════════════════

    /// Moves packets in-flight and processes arrivals.
    /// Uses field destructuring so the `retain_mut` closure can access
    /// `nodes`, `stats`, etc. without conflicting with the `packets` borrow.
    fn move_packets_and_handle_arrivals(&mut self, tick_current: u64) {
        let mut new_packets: Vec<Packet> = Vec::new();

        // Destructure fields so the closure captures individual borrows, not &mut self
        let nodes = &mut self.nodes;
        let stats = &mut self.stats;
        let id_to_index = &self.id_to_index;
        let edges = &self.edges;
        let latency_window = &mut self.latency_window;
        let next_packet_id = &mut self.next_packet_id;

        self.packets.retain_mut(|packet| {
            if packet.dropped {
                if packet.ttl > 1 {
                    packet.ttl -= 1;
                    return true;
                }
                return false;
            }

            packet.progress += packet.speed;
            if packet.progress < 1.0 {
                return true;
            }

            // Packet arrived
            let target_id = packet.target_id.clone();

            let mut t_idx = packet.target_index;
            if t_idx < 0 {
                if let Some(&idx) = id_to_index.get(&target_id) {
                    t_idx = idx as i32;
                    packet.target_index = t_idx;
                }
            }

            if t_idx < 0 {
                packet.dropped = true;
                packet.speed = 0.0;
                packet.ttl = 20;
                packet.error_code = 502;
                stats.total_dropped += 1;
                return true;
            }

            let node = &mut nodes[t_idx as usize];
            node.incoming_load = (node.incoming_load - 1.0).max(0.0);

            let is_reply = matches!(packet.p_type, PacketType::Reply);

            // Buffer overflow check (requests only — load balancers are pass-through, no capacity limit)
            let is_pass_through = matches!(node.node_type, NodeType::LoadBalancer);
            if !is_reply && !is_pass_through && (node.current_load + 1) as f32 > node.buffer_capacity {
                if packet.retry_count < packet.max_retries {
                    let mut retry_pkt = packet.clone();
                    retry_pkt.retry_count += 1;
                    retry_pkt.dropped = false;
                    retry_pkt.error_code = 0;
                    retry_pkt.source_index = packet.source_index;
                    retry_pkt.target_index = -1;
                    retry_pkt.progress = 0.0;
                    retry_pkt.trace =
                        vec![(retry_pkt.source_id.clone(), retry_pkt.target_handle.clone())];
                    retry_pkt.id = *next_packet_id;
                    *next_packet_id += 1;
                    retry_pkt.target_id = packet.target_id.clone();
                    retry_pkt.progress = 0.0;
                    retry_pkt.target_index = -1;

                    new_packets.push(retry_pkt);

                    packet.dropped = true;
                    packet.speed = 0.0;
                    packet.ttl = 20;
                    packet.error_code = 503;
                    stats.total_dropped += 1;
                    return true;
                }

                packet.dropped = true;
                packet.speed = 0.0;
                packet.ttl = 20;
                packet.error_code = 503;
                stats.total_dropped += 1;
                return true;
            }

            // ── Reply Arrival ──
            if is_reply {
                if matches!(node.node_type, NodeType::Client) {
                    stats.total_processed += 1;
                    let latency = tick_current - packet.start_tick;
                    if latency_window.len() >= 300 {
                        latency_window.pop_front();
                    }
                    latency_window.push_back(latency);
                    let sum: u64 = latency_window.iter().sum();
                    stats.avg_latency = sum as f64 / latency_window.len() as f64;
                    return false; // Consumed
                } else {
                    if let Some((next_target, saved_handle)) = packet.trace.pop() {
                        let current_node_id = target_id.clone();
                        packet.source_id = current_node_id.clone();
                        packet.source_index = packet.target_index;
                        packet.target_id = next_target.clone();
                        packet.target_index = -1;

                        if let Some(&idx) = id_to_index.get(&packet.target_id) {
                            packet.target_index = idx as i32;
                            nodes[idx].incoming_load += 1.0;

                            let original_target_handle = saved_handle;
                            let edges_from_target = &edges[idx];
                            // Primary: match by target_handle (server→server paths).
                            // Fallback: match by source_handle for client streams that share
                            // a common target_handle (e.g. multiple streams → single gateway input).
                            let reverse_edge = edges_from_target.iter().find(|e| {
                                e.target_id == current_node_id
                                    && e.target_handle == original_target_handle
                            }).or_else(|| edges_from_target.iter().find(|e| {
                                e.target_id == current_node_id
                                    && e.source_handle == original_target_handle
                            }));
                            if let Some(reverse_edge) = reverse_edge {
                                packet.source_handle = reverse_edge.target_handle.clone();
                                packet.target_handle = reverse_edge.source_handle.clone();
                            }
                        } else {
                            packet.target_index = -1;
                        }

                        packet.progress = 0.0;
                        return true; // Keep flying
                    }
                    return false; // End of trace
                }
            }

            // ── Request Arrival ──
            node.current_load += 1;

            if matches!(node.node_type, NodeType::Server) {
                // No endpoints configured - use default processing delay
                if node.endpoints.is_empty() {
                    let replicas = node.replicas.max(1) as usize;
                    if node.replica_usage.len() != replicas {
                        node.replica_usage = vec![tick_current as f64; replicas];
                    }
                    let mut best_lane_idx = 0;
                    let mut min_finish = f64::MAX;
                    for (i, ft) in node.replica_usage.iter().enumerate() {
                        if *ft < min_finish { min_finish = *ft; best_lane_idx = i; }
                    }
                    let start_time = f64::max(tick_current as f64, min_finish);
                    let finish_at = start_time + (node.processing_delay as f64);
                    node.replica_usage[best_lane_idx] = finish_at;
                    node.work_queue.push_back((finish_at.ceil() as u64, packet.clone()));
                    return false;
                }

                // Find matching endpoints (by handle+method+path, fallback to method+path)
                let matching_eps: Vec<&Endpoint> = node.endpoints.iter()
                    .filter(|ep| ep.id == packet.target_handle && ep.method == packet.method && ep.path == packet.path)
                    .collect();
                let final_eps = if matching_eps.is_empty() {
                    node.endpoints.iter()
                        .filter(|ep| ep.method == packet.method && ep.path == packet.path)
                        .collect::<Vec<_>>()
                } else {
                    matching_eps
                };

                if final_eps.is_empty() {
                    packet.dropped = true;
                    packet.ttl = 20;
                    packet.error_code = 404;
                    stats.total_dropped += 1;
                    return true;
                }

                let ep = final_eps[0];

                // Drop if input has no path to any output and no return
                if ep.forward_to.is_empty() {
                    packet.dropped = true;
                    packet.ttl = 20;
                    packet.error_code = 404;
                    stats.total_dropped += 1;
                    return true;
                }

                // Push packet copies into per-route queues (rate-limited by accumulators in drain phase)
                // This now uniformly handles both forward routes and __return__
                for route in &ep.forward_to {
                    let mut route_pkt = packet.clone();
                    route_pkt.route_target = route.target_id.clone();
                    node.route_queues
                        .entry(route.target_id.clone())
                        .or_insert_with(VecDeque::new)
                        .push_back(route_pkt);
                }

                return false;
            } else if matches!(node.node_type, NodeType::LoadBalancer) {
                node.total_processed += 1;
                node.work_queue.push_back((tick_current, packet.clone()));
                return false;
            } else if matches!(node.node_type, NodeType::ApiGateway) {
                let mut gw_match = false;

                if node.endpoints.is_empty() {
                    gw_match = true;
                } else {
                    for ep in &node.endpoints {
                        if ep.method == packet.method && ep.path == packet.path {
                            gw_match = true;
                            break;
                        }
                    }
                }

                if gw_match {
                    node.work_queue.push_back((tick_current, packet.clone()));
                    return false;
                } else {
                    packet.dropped = true;
                    packet.ttl = 20;
                    packet.error_code = 404;
                    stats.total_dropped += 1;
                    return true;
                }
            } else if matches!(node.node_type, NodeType::Database) {
                let replicas = node.replicas.max(1) as usize;
                if node.replica_usage.len() != replicas {
                    node.replica_usage = vec![tick_current as f64; replicas];
                }
                let mut best_lane_idx = 0;
                let mut min_finish = f64::MAX;
                for (i, finish_time) in node.replica_usage.iter().enumerate() {
                    if *finish_time < min_finish {
                        min_finish = *finish_time;
                        best_lane_idx = i;
                    }
                }
                let start_time = f64::max(tick_current as f64, min_finish);
                let finish_at = start_time + (node.processing_delay as f64);
                node.replica_usage[best_lane_idx] = finish_at;
                node.work_queue.push_back((finish_at.ceil() as u64, packet.clone()));
                node.total_processed += 1;
                return false;
            } else if matches!(node.node_type, NodeType::Cache) {
                if packet.is_write {
                    node.work_queue.push_back((tick_current, packet.clone()));
                    return false;
                } else {
                    let mut rand_byte = [0u8; 1];
                    let _ = getrandom::getrandom(&mut rand_byte);
                    let is_hit = (rand_byte[0] as f32 / 255.0) < node.cache_hit_rate;
                    if is_hit {
                        stats.total_processed += 1;
                        let latency = tick_current - packet.start_tick;
                        if latency_window.len() >= 300 {
                            latency_window.pop_front();
                        }
                        latency_window.push_back(latency);
                        let sum: u64 = latency_window.iter().sum();
                        stats.avg_latency = sum as f64 / latency_window.len() as f64;

                        packet.p_type = PacketType::Reply;
                        packet.progress = 0.0;
                        if let Some((prev_hop, _saved_handle)) = packet.trace.pop() {
                            packet.source_id = node.id.clone();
                            packet.target_id = prev_hop;

                            let last_finish =
                                node.work_queue.back().map(|(t, _)| *t as f64).unwrap_or(tick_current as f64);
                            let start_time = f64::max(tick_current as f64, last_finish);
                            let finish_at = start_time + (node.processing_delay as f64);
                            node.work_queue.push_back((finish_at.ceil() as u64, packet.clone()));
                            return false;
                        } else {
                            packet.dropped = true;
                            packet.ttl = 20;
                            packet.error_code = 404;
                            return true;
                        }
                    } else {
                        // Cache MISS
                        node.work_queue.push_back((tick_current, packet.clone()));
                        return false;
                    }
                }
            } else if matches!(node.node_type, NodeType::MessageQueue) {
                node.work_queue.push_back((tick_current, packet.clone()));
                return false;
            } else if matches!(node.node_type, NodeType::Topic) {
                node.work_queue.push_back((tick_current, packet.clone()));
                return false;
            }

            true
        });

        self.packets.append(&mut new_packets);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 7: Generate Client Traffic
    // ═══════════════════════════════════════════════════════════════════════════

    fn generate_client_traffic(&mut self, tick_current: u64) {
        let mut pending_traffic = Vec::new();

        for (node_idx, node) in self.nodes.iter_mut().enumerate() {
            if matches!(node.node_type, NodeType::Client) {
                for stream in &mut node.streams {
                    let effective_rate = stream.rate.min(60.0);
                    stream.accumulator += effective_rate / 60.0;
                    let fire_count = stream.accumulator.floor() as u32;
                    if fire_count > 0 {
                        stream.accumulator -= fire_count as f32;
                        pending_traffic.push((node_idx, node.id.clone(), stream.clone(), fire_count));
                    }
                }
            }
        }

        for (node_idx, source_id, stream, count) in pending_traffic {
            for _ in 0..count {
                self.next_packet_id += 1;
                let pid = self.next_packet_id;
                self.stats.total_generated += 1;

                let mut pkt = Packet {
                    id: pid,
                    source_id: source_id.clone(),
                    target_id: String::new(),
                    progress: 0.0,
                    speed: 0.0075,
                    dropped: false,
                    ttl: 64,
                    start_tick: tick_current,
                    p_type: PacketType::Request,
                    is_write: stream.is_write,
                    method: stream.method.clone(),
                    path: stream.path.clone(),
                    source_handle: String::new(),
                    target_handle: String::new(),
                    trace: Vec::new(),
                    source_index: *self.id_to_index.get(&source_id).unwrap_or(&0) as i32,
                    target_index: -1,
                    error_code: 0,
                    retry_count: 0,
                    max_retries: stream.retries,
                    route_target: String::new(),
                };

                let mut valid_edges: Vec<&EdgeConn> = self.edges[node_idx]
                    .iter()
                    .filter(|e| e.source_handle == stream.id)
                    .collect();

                // Fall back to the generic "right" handle so a single client→gateway
                // edge can carry all streams (gateway routes by method+path internally).
                if valid_edges.is_empty() {
                    valid_edges = self.edges[node_idx]
                        .iter()
                        .filter(|e| e.source_handle == "right")
                        .collect();
                }

                if !valid_edges.is_empty() {
                    let edge_idx = tick_current as usize % valid_edges.len();
                    let conn = valid_edges[edge_idx];

                    pkt.target_id = conn.target_id.clone();
                    if let Some(&t_idx) = self.id_to_index.get(&pkt.target_id) {
                        pkt.target_index = t_idx as i32;
                        self.nodes[t_idx].incoming_load += 1.0;

                        pkt.speed = edge_speed(conn.delay_ms);
                    }

                    pkt.source_handle = conn.source_handle.clone();
                    pkt.target_handle = conn.target_handle.clone();
                    // Store source_handle (stream ID) so replies can find the correct
                    // return edge even when multiple streams share the same target handle.
                    pkt.trace.push((source_id.clone(), pkt.source_handle.clone()));

                    self.packets.push(pkt);
                } else {
                    self.stats.total_dropped += 1;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 8: Export State (Zero-Copy Buffers for JS)
    // ═══════════════════════════════════════════════════════════════════════════

    fn export_state(&mut self, tick_current: u64) -> JsValue {
        self.packet_buffer.clear();
        self.packet_buffer.reserve(self.packets.len() * 9);

        for p in self.packets.iter() {
            let eff_s_idx = if p.source_index >= 0 {
                p.source_index
            } else {
                self.id_to_index
                    .get(&p.source_id)
                    .map(|&idx| idx as i32)
                    .unwrap_or(-1)
            };
            let eff_t_idx = if p.target_index >= 0 {
                p.target_index
            } else {
                self.id_to_index
                    .get(&p.target_id)
                    .map(|&idx| idx as i32)
                    .unwrap_or(-1)
            };

            let s_idx = eff_s_idx as f32;
            let t_idx = eff_t_idx as f32;

            let p_type = if matches!(p.p_type, PacketType::Request) {
                if p.is_write {
                    2.0
                } else {
                    0.0
                }
            } else {
                1.0
            };
            let loaded = if p.dropped { p.ttl as f32 } else { 0.0 };

            let get_handle_val = |n_idx: i32, handle_id: &str| -> f32 {
                if n_idx >= 0 && (n_idx as usize) < self.nodes.len() {
                    let node = &self.nodes[n_idx as usize];
                    if let Some(idx) = node.streams.iter().position(|x| x.id == handle_id) {
                        return (idx + 1) as f32;
                    }
                    if let Some(idx) = node.dependencies.iter().position(|x| x.id == handle_id) {
                        return (idx + 1) as f32;
                    }
                    if let Some(idx) = node.endpoints.iter().position(|x| x.id == handle_id) {
                        return -((idx + 1) as f32);
                    }
                }
                0.0
            };

            let s_val = get_handle_val(eff_s_idx, &p.source_handle);
            let t_val = get_handle_val(eff_t_idx, &p.target_handle);

            let is_req = matches!(p.p_type, PacketType::Request);

            let mut final_s = s_val;
            if final_s == 0.0 && eff_s_idx >= 0 && (eff_s_idx as usize) < self.nodes.len() {
                let node = &self.nodes[eff_s_idx as usize];
                if !matches!(node.node_type, NodeType::Client) {
                    final_s = if is_req { 1.0 } else { -1.0 };
                }
            }

            let mut final_t = t_val;
            if final_t == 0.0 && eff_t_idx >= 0 && (eff_t_idx as usize) < self.nodes.len() {
                let node = &self.nodes[eff_t_idx as usize];
                if matches!(node.node_type, NodeType::Client) {
                    final_t = 1.0;
                } else {
                    final_t = if is_req { -1.0 } else { 1.0 };
                }
            }

            self.packet_buffer.push(s_idx);
            self.packet_buffer.push(t_idx);
            self.packet_buffer.push(p.progress);
            self.packet_buffer.push(p_type);
            self.packet_buffer.push(loaded);
            self.packet_buffer.push(final_s);
            self.packet_buffer.push(final_t);
            self.packet_buffer.push(p.error_code as f32);
            self.packet_buffer.push(p.retry_count as f32);
        }

        // Node status buffer (5 floats per node)
        self.node_status_buffer.clear();
        self.node_status_buffer.reserve(self.nodes.len() * 5);
        for n in self.nodes.iter() {
            self.node_status_buffer.push(n.current_load as f32);
            self.node_status_buffer.push(n.buffer_capacity);
            self.node_status_buffer.push(n.processing_delay as f32);
            self.node_status_buffer.push(n.replicas as f32);
            self.node_status_buffer.push(n.total_processed as f32);
        }

        let node_statuses: Vec<NodeStatus> = Vec::new();

        #[cfg(target_arch = "wasm32")]
        {
            let state = SimState {
                packets: Vec::new(),
                curr_tick: tick_current,
                node_statuses,
                stats: self.stats.clone(),
            };
            return serde_wasm_bindgen::to_value(&state).unwrap_or(JsValue::NULL);
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            let _ = node_statuses;
            return JsValue::NULL;
        }
    }
}
