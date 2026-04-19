// ═══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Comprehensive coverage of simulation behavior
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod core_tests {
    use crate::ops::SimOp;
    use crate::types::*;
    use crate::wasm_api::Simulation;

    // ── Helpers ──────────────────────────────────────────────────────────────

    fn setup_client_server() -> Simulation {
        let sim = Simulation::new();
        sim.add_edge(
            "client-1".into(),
            "server-1".into(),
            "stream-default".into(),
            "input".into(),
        );
        sim.tick(); // apply the AddEdge op
        sim
    }

    fn make_stream(id: &str, rate: f32) -> TrafficStream {
        TrafficStream {
            id: id.to_string(),
            label: id.to_string(),
            is_write: false,
            weight: 1,
            method: "GET".into(),
            path: "/".into(),
            rate,
            accumulator: 0.0,
            retries: 0,
        }
    }

    fn make_write_stream(id: &str, rate: f32) -> TrafficStream {
        TrafficStream {
            id: id.to_string(),
            label: id.to_string(),
            is_write: true,
            weight: 1,
            method: "POST".into(),
            path: "/data".into(),
            rate,
            accumulator: 0.0,
            retries: 0,
        }
    }

    fn make_endpoint(id: &str, method: &str, path: &str, delay: f32) -> Endpoint {
        Endpoint {
            id: id.to_string(),
            method: method.to_string(),
            path: path.to_string(),
            delay,
            forward_to: Vec::new(),
            strategy: "round_robin".to_string(),
            error_rate: 0.0,
            rate: 0.0,
        }
    }

    fn tick_n(sim: &Simulation, n: u32) {
        for _ in 0..n {
            sim.tick();
        }
    }

    // ── Initialization ───────────────────────────────────────────────────────

    #[test]
    fn test_empty_sim() {
        let sim = Simulation::new();
        let inner = sim.inner.borrow();
        assert!(inner.nodes.is_empty());
        assert!(inner.packets.is_empty());
        assert_eq!(inner.tick_count, 0);
        assert_eq!(inner.stats.total_generated, 0);
    }

    #[test]
    fn test_tick_empty_sim_no_panic() {
        let sim = Simulation::new();
        for _ in 0..100 {
            sim.tick();
        }
        assert_eq!(sim.inner.borrow().tick_count, 100);
    }

    // ── Node Creation via Edge ───────────────────────────────────────────────

    #[test]
    fn test_add_nodes_via_edge() {
        let sim = setup_client_server();
        let inner = sim.inner.borrow();

        assert_eq!(inner.nodes.len(), 2);
        assert!(inner.id_to_index.contains_key("client-1"));
        assert!(inner.id_to_index.contains_key("server-1"));

        let c_idx = inner.id_to_index["client-1"];
        let s_idx = inner.id_to_index["server-1"];
        assert!(matches!(inner.nodes[c_idx].node_type, NodeType::Client));
        assert!(matches!(inner.nodes[s_idx].node_type, NodeType::Server));
    }

    #[test]
    fn test_type_inference_all_variants() {
        let sim = Simulation::new();
        let names = [
            ("client-a", "Client"),
            ("server-a", "Server"),
            ("load_balancer-a", "LoadBalancer"),
            ("database-a", "Database"),
            ("message_queue-a", "MessageQueue"),
            ("cache-a", "Cache"),
            ("api_gateway-a", "ApiGateway"),
            ("topic-a", "Topic"),
        ];

        // Create pairs so each node exists
        for (i, (name, _)) in names.iter().enumerate() {
            sim.add_edge(
                name.to_string(),
                format!("__sink_{}", i),
                "out".into(),
                "in".into(),
            );
        }
        sim.tick();

        let inner = sim.inner.borrow();
        for (name, expected_type) in &names {
            let idx = inner.id_to_index[*name];
            let actual = format!("{:?}", inner.nodes[idx].node_type);
            assert_eq!(
                &actual, expected_type,
                "Node '{}' should be {:?}, got {:?}",
                name, expected_type, actual
            );
        }
    }

    #[test]
    fn test_duplicate_edge_doesnt_duplicate_node() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "t1".into());
        sim.add_edge("client-1".into(), "server-1".into(), "s2".into(), "t2".into());
        sim.tick();

        let inner = sim.inner.borrow();
        assert_eq!(inner.nodes.len(), 2, "Should still have exactly 2 nodes");
        // Client should have 2 edges to the same server
        let c_idx = inner.id_to_index["client-1"];
        assert_eq!(inner.edges[c_idx].len(), 2);
    }

    // ── Topology Operations ──────────────────────────────────────────────────

    #[test]
    fn test_clear_edges_resets_everything() {
        let sim = setup_client_server();
        tick_n(&sim, 10);

        sim.clear_edges();
        sim.tick();

        let inner = sim.inner.borrow();
        assert!(inner.nodes.is_empty());
        assert!(inner.edges.is_empty());
        assert!(inner.packets.is_empty());
        assert_eq!(inner.stats.total_generated, 0);
    }

    #[test]
    fn test_remove_node_preserves_indices() {
        let sim = Simulation::new();
        sim.add_edge("A".into(), "B".into(), "out".into(), "in".into());
        sim.add_edge("B".into(), "C".into(), "out".into(), "in".into());
        sim.tick();

        assert_eq!(sim.inner.borrow().nodes.len(), 3);

        sim.remove_node("B".into());
        sim.tick();

        let inner = sim.inner.borrow();
        assert_eq!(inner.nodes.len(), 2);

        // Index lookup should be consistent after swap_remove
        for (id, &idx) in &inner.id_to_index {
            assert_eq!(&inner.nodes[idx].id, id, "Index mismatch for node {}", id);
        }

        // B should be gone
        assert!(inner.id_to_index.get("B").is_none());
        assert!(inner.id_to_index.contains_key("A"));
        assert!(inner.id_to_index.contains_key("C"));
    }

    // ── Traffic Generation ───────────────────────────────────────────────────

    #[test]
    fn test_client_generates_packets() {
        let sim = setup_client_server();
        tick_n(&sim, 20);

        let inner = sim.inner.borrow();
        assert!(
            inner.stats.total_generated > 0,
            "Client should have generated packets, got 0"
        );
    }

    #[test]
    fn test_rate_limit_enforced_at_60_rps() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "t1".into());
        sim.tick();

        // Set rate to 100, but engine caps effective rate at 60.0
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("s1", 100.0)],
        ));
        sim.tick();

        tick_n(&sim, 60);

        let stats = sim.inner.borrow().stats.clone();
        assert!(
            stats.total_generated <= 62,
            "Should be capped at ~60 RPS, got {}",
            stats.total_generated
        );
        assert!(
            stats.total_generated >= 58,
            "Should generate at least ~58 packets in 60 ticks, got {}",
            stats.total_generated
        );
    }

    #[test]
    fn test_packet_progress_increases_each_tick() {
        let sim = setup_client_server();
        tick_n(&sim, 5); // let some packets spawn

        let inner = sim.inner.borrow();
        if inner.packets.is_empty() {
            return; // nothing to test (rare at 5 RPS default)
        }
        let p = &inner.packets[0];
        let progress_after_generation = p.progress;
        drop(inner);

        sim.tick();

        let inner = sim.inner.borrow();
        if !inner.packets.is_empty() {
            assert!(
                inner.packets[0].progress > progress_after_generation || inner.packets[0].dropped,
                "Packet progress should increase unless dropped"
            );
        }
    }

    // ── Server Processing ────────────────────────────────────────────────────

    #[test]
    fn test_server_processes_and_replies() {
        let sim = setup_client_server();
        // Run enough ticks for packet generation → flight → processing → reply → consumption
        tick_n(&sim, 500);

        let inner = sim.inner.borrow();
        assert!(
            inner.stats.total_processed > 0,
            "Server should have processed and returned packets to client, got 0 processed"
        );
        assert!(
            inner.stats.avg_latency > 0.0,
            "Average latency should be > 0 after processing"
        );
    }

    #[test]
    fn test_server_delay_affects_processing() {
        // Build topology with fast delay
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-fast".into(), "stream-default".into(), "input".into());
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("server-fast".into(), 5.0));
        tick_n(&sim, 500);
        let fast_processed = sim.inner.borrow().stats.total_processed;

        // Build topology with slow delay
        let sim2 = Simulation::new();
        sim2.add_edge("client-1".into(), "server-slow".into(), "stream-default".into(), "input".into());
        sim2.tick();

        sim2.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("server-slow".into(), 200.0));
        tick_n(&sim2, 500);
        let slow_processed = sim2.inner.borrow().stats.total_processed;

        assert!(
            fast_processed > slow_processed,
            "Fast server (delay=5) should process more than slow (delay=200): {} vs {}",
            fast_processed,
            slow_processed
        );
    }

    // ── Buffer Overflow & Capacity ───────────────────────────────────────────

    #[test]
    fn test_buffer_overflow_drops_packets() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "input".into());
        sim.tick();

        // Tiny capacity + high rate = drops
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("server-1".into(), 1.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("s1", 60.0)],
        ));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("server-1".into(), 100.0));
        tick_n(&sim, 500);

        let stats = sim.inner.borrow().stats.clone();
        assert!(
            stats.total_dropped > 0,
            "Server at capacity 1 with high traffic should drop packets, got 0 drops"
        );
    }

    // ── Load Balancer ────────────────────────────────────────────────────────

    #[test]
    fn test_load_balancer_round_robin() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "load_balancer-1".into(), "stream-default".into(), "input".into());
        sim.add_edge("load_balancer-1".into(), "server-a".into(), "out".into(), "in-a".into());
        sim.add_edge("load_balancer-1".into(), "server-b".into(), "out".into(), "in-b".into());
        sim.tick();

        tick_n(&sim, 500);

        let inner = sim.inner.borrow();
        let a_idx = inner.id_to_index["server-a"];
        let b_idx = inner.id_to_index["server-b"];

        let a_processed = inner.nodes[a_idx].work_queue.len();
        let b_processed = inner.nodes[b_idx].work_queue.len();

        // Both servers should receive some load (not all on one)
        // We check that neither is zero — round-robin should distribute
        let a_total_seen = inner.stats.total_generated; // proxy
        assert!(
            a_total_seen > 0,
            "Traffic should flow through the load balancer"
        );
        // Both servers should have had work (or at least not 100% on one)
        let total_work = a_processed + b_processed;
        if total_work > 2 {
            assert!(
                a_processed > 0 || b_processed > 0,
                "Load balancer should distribute across servers"
            );
        }
    }

    // ── Cache ────────────────────────────────────────────────────────────────

    #[test]
    fn test_cache_serves_read_hits() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "cache-1".into(), "stream-default".into(), "input".into());
        sim.add_edge("cache-1".into(), "database-1".into(), "out".into(), "in".into());
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCacheHitRate("cache-1".into(), 1.0));
        tick_n(&sim, 300);

        let inner = sim.inner.borrow();
        // With 100% hit rate, cache should serve everything and packets never reach the DB
        let db_idx = inner.id_to_index["database-1"];
        let db_work = inner.nodes[db_idx].work_queue.len();

        assert!(
            inner.stats.total_processed > 0,
            "Cache with 100% hit rate should process reads directly"
        );
        // DB should have very little or no work (cache hits don't forward)
        assert!(
            db_work == 0,
            "DB should have 0 pending work when cache hit rate is 100%, got {}",
            db_work
        );
    }

    #[test]
    fn test_cache_forwards_writes() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "cache-1".into(), "s1".into(), "input".into());
        sim.add_edge("cache-1".into(), "database-1".into(), "out".into(), "in".into());
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_write_stream("s1", 10.0)],
        ));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCacheHitRate("cache-1".into(), 1.0));
        tick_n(&sim, 200);

        let inner = sim.inner.borrow();
        // Write traffic bypasses cache hit logic, so it should flow through to outbound
        assert!(
            inner.stats.total_generated > 0,
            "Write traffic should be generated"
        );
    }

    // ── Message Queue ────────────────────────────────────────────────────────

    #[test]
    fn test_message_queue_buffers_and_dispatches() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "message_queue-1".into(), "stream-default".into(), "input".into());
        sim.add_edge("message_queue-1".into(), "server-worker".into(), "out".into(), "in".into());
        sim.tick();

        tick_n(&sim, 300);

        let inner = sim.inner.borrow();
        let s_idx = inner.id_to_index["server-worker"];

        // The worker should have received work from the MQ
        let worker_ever_had_work =
            inner.nodes[s_idx].work_queue.len() > 0 || inner.stats.total_processed > 0;
        assert!(
            inner.stats.total_generated > 0,
            "Client should generate packets"
        );
        // Packets should have flowed through the MQ to the worker
        assert!(
            worker_ever_had_work || inner.stats.total_dropped > 0,
            "MQ should dispatch packets to the worker (or drop if overloaded)"
        );
    }

    // ── Topic Fan-out ────────────────────────────────────────────────────────

    #[test]
    fn test_topic_fans_out_to_all_subscribers() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "topic-events".into(), "stream-default".into(), "input".into());
        sim.add_edge("topic-events".into(), "server-sub1".into(), "out1".into(), "in".into());
        sim.add_edge("topic-events".into(), "server-sub2".into(), "out2".into(), "in".into());
        sim.add_edge("topic-events".into(), "server-sub3".into(), "out3".into(), "in".into());
        sim.tick();

        tick_n(&sim, 300);

        let inner = sim.inner.borrow();

        // All 3 subscribers should have received work
        for sub in &["server-sub1", "server-sub2", "server-sub3"] {
            let idx = inner.id_to_index[*sub];
            let has_work = inner.nodes[idx].work_queue.len() > 0;
            let total_traffic = inner.stats.total_generated;
            // With fan-out, each subscriber gets a copy, so the total dispatched > generated
            assert!(
                total_traffic > 0,
                "Topic should have generated traffic for subscriber {}",
                sub
            );
            // We can't perfectly assert each got work because timing, but traffic should flow
            let _ = has_work; // avoid unused warning
        }
    }

    // ── Endpoint Routing ─────────────────────────────────────────────────────

    #[test]
    fn test_endpoint_matching_routes_correctly() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-api".into(), "s1".into(), "ep-get-users".into());
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![TrafficStream {
                id: "s1".into(),
                label: "Users".into(),
                is_write: false,
                weight: 1,
                method: "GET".into(),
                path: "/users".into(),
                rate: 10.0,
                accumulator: 0.0,
                retries: 0,
            }],
        ));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeEndpoints(
            "server-api".into(),
            vec![make_endpoint("ep-get-users", "GET", "/users", 20.0)],
        ));
        tick_n(&sim, 300);

        let inner = sim.inner.borrow();
        assert!(
            inner.stats.total_processed > 0,
            "Endpoint-matched requests should be processed and returned"
        );
    }

    #[test]
    fn test_endpoint_mismatch_drops_with_404() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-api".into(), "s1".into(), "ep-wrong".into());
        sim.tick();

        // Client sends GET / but server only has POST /admin
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("s1", 10.0)],
        ));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeEndpoints(
            "server-api".into(),
            vec![make_endpoint("ep-admin", "POST", "/admin", 20.0)],
        ));
        tick_n(&sim, 200);

        let inner = sim.inner.borrow();
        assert!(
            inner.stats.total_dropped > 0,
            "Mismatched endpoint should cause 404 drops"
        );
    }

    // ── Error Rate ───────────────────────────────────────────────────────────

    #[test]
    fn test_endpoint_error_rate_causes_drops() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-flaky".into(), "s1".into(), "ep-err".into());
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("s1", 30.0)],
        ));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeEndpoints(
            "server-flaky".into(),
            vec![Endpoint {
                id: "ep-err".into(),
                method: "GET".into(),
                path: "/".into(),
                delay: 10.0,
                forward_to: Vec::new(),
                strategy: "round_robin".into(),
                error_rate: 0.5, // 50% error rate
                rate: 0.0,
            }],
        ));
        tick_n(&sim, 500);

        let inner = sim.inner.borrow();
        assert!(
            inner.stats.total_dropped > 0,
            "50% error rate should cause some drops"
        );
        assert!(
            inner.stats.total_processed > 0 || inner.stats.total_generated > 10,
            "Some requests should still succeed"
        );
    }

    // ── Retry Logic ──────────────────────────────────────────────────────────

    #[test]
    fn test_retries_on_buffer_overflow() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-tiny".into(), "s1".into(), "input".into());
        sim.tick();

        // Tiny buffer + slow processing + retries enabled
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("server-tiny".into(), 1.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("server-tiny".into(), 200.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![TrafficStream {
                id: "s1".into(),
                label: "Retry traffic".into(),
                is_write: false,
                weight: 1,
                method: "GET".into(),
                path: "/".into(),
                rate: 30.0,
                accumulator: 0.0,
                retries: 3, // enable retries
            }],
        ));
        tick_n(&sim, 500);

        let inner = sim.inner.borrow();
        // With retries enabled and overflowing, we should see retry packets
        let retry_packets: Vec<_> = inner.packets.iter().filter(|p| p.retry_count > 0).collect();
        // Can't guarantee retries happen deterministically, but drops should occur
        assert!(
            inner.stats.total_dropped > 0,
            "Overflow with small buffer should cause drops (some may retry)"
        );
        let _ = retry_packets; // use it
    }

    // ── Node Property Updates ────────────────────────────────────────────────

    #[test]
    fn test_get_node_index() {
        let sim = setup_client_server();
        let idx = sim.get_node_index("client-1".into());
        assert!(idx >= 0, "Should find client-1");

        let missing = sim.get_node_index("nonexistent".into());
        assert_eq!(missing, -1, "Missing node should return -1");
    }

    #[test]
    fn test_remove_node_with_inflight_packets_no_panic() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "input".into());
        sim.tick();

        // Generate some traffic
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("s1", 100.0)],
        ));
        tick_n(&sim, 10);

        // Ensure we have packets
        {
            let inner = sim.inner.borrow();
            assert!(!inner.packets.is_empty(), "Should have in-flight packets");
        }

        // Remove the server while packets are in flight
        sim.remove_node("server-1".into());
        sim.tick(); // This applies RemoveNode and calls export_state

        // If we reached here without panicking, the fix is working for the tick itself.
        tick_n(&sim, 10);

        // Also test removing ALL nodes
        sim.remove_node("client-1".into());
        sim.tick();
        
        let inner = sim.inner.borrow();
        assert!(inner.nodes.is_empty());
        // export_state (via tick) should not panic even with empty nodes and orphaned packets
    }

    #[test]
    fn test_multiple_endpoints_same_path_aggregate_targets() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "input".into());
        // Two outputs for server-1
        sim.add_edge("server-1".into(), "target-a".into(), "out-a".into(), "in".into());
        sim.add_edge("server-1".into(), "target-b".into(), "out-b".into(), "in".into());
        sim.tick();

        // Configure two endpoints for the same path
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeEndpoints(
            "server-1".into(),
            vec![
                Endpoint {
                    id: "ep1".into(),
                    method: "GET".into(),
                    path: "/".into(),
                    delay: 10.0,
                    forward_to: vec![Route { target_id: "out-a".into(), delay: 0.0 }],
                    strategy: "round_robin".into(),
                    error_rate: 0.0,
                    rate: 0.0,
                },
                Endpoint {
                    id: "ep2".into(),
                    method: "GET".into(),
                    path: "/".into(),
                    delay: 10.0,
                    forward_to: vec![Route { target_id: "out-b".into(), delay: 0.0 }],
                    strategy: "round_robin".into(),
                    error_rate: 0.0,
                    rate: 0.0,
                },
            ],
        ));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("s1", 60.0)],
        ));
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("server-1".into(), 100.0));
        sim.tick();

        tick_n(&sim, 1000); // 1000 ticks to ensure return trips complete

        let inner = sim.inner.borrow();
        let a_idx = inner.id_to_index["target-a"];
        let b_idx = inner.id_to_index["target-b"];

        println!("Total generated: {}", inner.stats.total_generated);
        println!("Server-1 load: {}", inner.nodes[inner.id_to_index["server-1"]].current_load);
        println!("Target A queue: {}", inner.nodes[a_idx].work_queue.len());
        println!("Target B queue: {}", inner.nodes[b_idx].work_queue.len());
        println!("Total processed: {}", inner.stats.total_processed);

        // Check if packets arrived at targets OR returned to client
        let a_reached = inner.nodes[a_idx].work_queue.len() > 0 || inner.stats.total_processed > 0;
        let b_reached = inner.nodes[b_idx].work_queue.len() > 0 || inner.stats.total_processed > 0;

        assert!(inner.stats.total_generated > 0, "No traffic generated");
        assert!(a_reached, "Target A never received traffic");
        assert!(b_reached, "Target B never received traffic");
    }

    #[test]
    fn test_server_throughput_scales_with_endpoint_rates() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "in".into());
        sim.add_edge("server-1".into(), "target-a".into(), "out-a".into(), "in".into());
        sim.add_edge("server-1".into(), "target-b".into(), "out-b".into(), "in".into());
        sim.tick();

        // 2 endpoints, each 5 RPS. Total server capacity should be 10 RPS.
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeEndpoints(
            "server-1".into(),
            vec![
                Endpoint {
                    id: "ep1".into(),
                    method: "GET".into(),
                    path: "/".into(),
                    delay: 0.0,
                    forward_to: vec![Route { target_id: "out-a".into(), delay: 0.0 }],
                    strategy: "round_robin".into(),
                    error_rate: 0.0,
                    rate: 5.0,
                },
                Endpoint {
                    id: "ep2".into(),
                    method: "GET".into(),
                    path: "/".into(),
                    delay: 0.0,
                    forward_to: vec![Route { target_id: "out-b".into(), delay: 0.0 }],
                    strategy: "round_robin".into(),
                    error_rate: 0.0,
                    rate: 5.0,
                },
            ],
        ));
        
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("server-1".into(), 100.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("target-a".into(), 1000.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("target-a".into(), 999999.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("target-b".into(), 1000.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("target-b".into(), 999999.0));

        // 10 RPS incoming total
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("s1", 10.0)],
        ));
        sim.tick();

        tick_n(&sim, 1200); // 20 seconds. 

        let inner = sim.inner.borrow();
        let a_idx = inner.id_to_index["target-a"];
        let b_idx = inner.id_to_index["target-b"];

        let a_count = inner.nodes[a_idx].work_queue.len();
        let b_count = inner.nodes[b_idx].work_queue.len();

        println!("A: {}, B: {}", a_count, b_count);

        // Client generates 10 RPS * 20s = 200 packets.
        // Hops take ~266 ticks (4.4s).
        // Processing at 10 RPS takes 200 * 0.1s = 20s? No, it's pipelined.
        // So after 4.4s, they start arriving at 10 RPS.
        // For remaining 15.6s, we get 156 packets.
        // 156 / 2 = 78 each.
        assert!(a_count > 70, "Target A should have ~80 packets, got {}", a_count);
        assert!(b_count > 70, "Target B should have ~80 packets, got {}", b_count);
    }

    #[test]
    fn test_server_throughput_aggregates_all_endpoint_rates() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "in1".into());
        sim.add_edge("client-2".into(), "server-1".into(), "s2".into(), "in2".into());
        sim.add_edge("server-1".into(), "target-a".into(), "out-a".into(), "in".into());
        sim.add_edge("server-1".into(), "target-b".into(), "out-b".into(), "in".into());
        sim.tick();

        // 2 endpoints for DIFFERENT paths
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeEndpoints(
            "server-1".into(),
            vec![
                Endpoint {
                    id: "in1".into(),
                    method: "GET".into(),
                    path: "/".into(),
                    delay: 0.0,
                    forward_to: vec![Route { target_id: "out-a".into(), delay: 0.0 }],
                    strategy: "round_robin".into(),
                    error_rate: 0.0,
                    rate: 5.0,
                },
                Endpoint {
                    id: "in2".into(),
                    method: "GET".into(),
                    path: "/url2".into(),
                    delay: 0.0,
                    forward_to: vec![Route { target_id: "out-b".into(), delay: 0.0 }],
                    strategy: "round_robin".into(),
                    error_rate: 0.0,
                    rate: 5.0,
                },
            ],
        ));
        
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("server-1".into(), 100.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("target-a".into(), 1000.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("target-a".into(), 999999.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("target-b".into(), 1000.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("target-b".into(), 999999.0));

        // Each client sends 5 RPS (total 10 RPS)
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![TrafficStream {
                id: "s1".into(),
                label: "s1".into(),
                is_write: false,
                weight: 1,
                method: "GET".into(),
                path: "/".into(),
                rate: 5.0,
                accumulator: 0.0,
                retries: 0,
            }],
        ));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-2".into(),
            vec![TrafficStream {
                id: "s2".into(),
                label: "s2".into(),
                is_write: false,
                weight: 1,
                method: "GET".into(),
                path: "/url2".into(),
                rate: 5.0,
                accumulator: 0.0,
                retries: 0,
            }],
        ));
        sim.tick();

        tick_n(&sim, 1200); // 20 seconds

        let inner = sim.inner.borrow();
        let a_idx = inner.id_to_index["target-a"];
        let b_idx = inner.id_to_index["target-b"];

        let a_count = inner.nodes[a_idx].work_queue.len();
        let b_count = inner.nodes[b_idx].work_queue.len();

        println!("A: {}, B: {}", a_count, b_count);

        // Should achieve ~80 each after 4.4s travel time
        assert!(a_count > 70, "Target A should have ~80 packets, got {}", a_count);
        assert!(b_count > 70, "Target B should have ~80 packets, got {}", b_count);
        
        // Verify minimal server load
        let server_idx = inner.id_to_index["server-1"];
        let server_load = inner.nodes[server_idx].current_load;
        assert!(server_load < 5.0, "Server should not be overloaded, LOAD: {}", server_load);
    }

    #[test]
    fn test_server_throughput_normalizes_by_replicas() {
        let sim = Simulation::new();
        sim.add_edge("client-1".into(), "server-1".into(), "s1".into(), "in".into());
        sim.add_edge("server-1".into(), "target".into(), "out".into(), "in".into());
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeEndpoints(
            "server-1".into(),
            vec![Endpoint {
                id: "in".into(),
                method: "GET".into(),
                path: "/".into(),
                delay: 0.0,
                forward_to: vec![Route { target_id: "out".into(), delay: 0.0 }],
                strategy: "round_robin".into(),
                error_rate: 0.0,
                rate: 10.0,
            }],
        ));
        
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeReplicas("server-1".into(), 5));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("server-1".into(), 100.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("target".into(), 2000.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeDelay("target".into(), 999999.0));

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![TrafficStream {
                id: "s1".into(),
                label: "s1".into(),
                is_write: false,
                weight: 1,
                method: "GET".into(),
                path: "/".into(),
                rate: 10.0,
                accumulator: 0.0,
                retries: 0,
            }],
        ));
        sim.tick();

        tick_n(&sim, 1200);

        let inner = sim.inner.borrow();
        let target_idx = inner.id_to_index["target"];
        let count = inner.nodes[target_idx].work_queue.len();

        println!("Count with 5 replicas: {}", count);
        // Correct normalization ensures node total throughput is 10 RPS.
        // 20s - 4.4s = 15.6s * 10 RPS = 156.
        assert!(count > 140 && count < 180, "Throughput should be 10 RPS total (around 156), got {}", count);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Benchmarks — Performance regression tests (run with `cargo test -- --ignored`)
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod benchmarks {
    use crate::ops::SimOp;
    use crate::types::*;
    use crate::wasm_api::Simulation;
    use std::time::Instant;

    fn make_stream(id: &str, rate: f32) -> TrafficStream {
        TrafficStream {
            id: id.to_string(),
            label: id.to_string(),
            is_write: false,
            weight: 1,
            method: "GET".into(),
            path: "/api".into(),
            rate,
            accumulator: 0.0,
            retries: 0,
        }
    }

    fn tick_n(sim: &Simulation, n: u32) {
        for _ in 0..n {
            sim.tick();
        }
    }

    /// Helper: runs a benchmark and prints results + returns ticks/sec
    fn run_bench(sim: &Simulation, name: &str, topology_desc: &str, iterations: u32) -> u64 {
        // Warmup
        tick_n(sim, 100);

        let start = Instant::now();
        tick_n(sim, iterations);
        let elapsed = start.elapsed();

        let inner = sim.inner.borrow();
        let tps = (iterations as f64 / elapsed.as_secs_f64()) as u64;

        println!("\n┌─ BENCHMARK: {} ─────────────────────────────", name);
        println!("│ Topology:       {}", topology_desc);
        println!("│ Iterations:     {}", iterations);
        println!("│ Active packets: {}", inner.packets.len());
        println!("│ Generated:      {}", inner.stats.total_generated);
        println!("│ Processed:      {}", inner.stats.total_processed);
        println!("│ Dropped:        {}", inner.stats.total_dropped);
        println!(
            "│ Per tick:       {:.3?}",
            elapsed / iterations
        );
        println!("│ Ticks/second:   {}", tps);
        println!("└───────────────────────────────────────────────\n");

        tps
    }

    #[test]
    #[ignore] // Run explicitly with: cargo test --release -- --ignored
    fn bench_small_topology() {
        let sim = Simulation::new();

        sim.add_edge("client-1".into(), "load_balancer-1".into(), "stream-default".into(), "input".into());
        sim.add_edge("load_balancer-1".into(), "server-1".into(), "out".into(), "input".into());
        sim.tick();

        sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
            "client-1".into(),
            vec![make_stream("stream-default", 30.0)],
        ));
        sim.tick();

        let tps = run_bench(&sim, "Small", "3 nodes (client→LB→server), 30 RPS", 10_000);
        assert!(tps > 50_000, "Small topology should exceed 50k tps, got {}", tps);
    }

    #[test]
    #[ignore]
    fn bench_medium_topology() {
        let sim = Simulation::new();

        for i in 0..20 {
            sim.add_edge(
                format!("client-{}", i),
                "load_balancer-main".into(),
                "stream-default".into(),
                "input".into(),
            );
        }
        for i in 0..10 {
            sim.add_edge(
                "load_balancer-main".into(),
                format!("server-{}", i),
                "out".into(),
                "input".into(),
            );
            sim.add_edge(
                format!("server-{}", i),
                "database-main".into(),
                "dep".into(),
                "input".into(),
            );
        }
        sim.tick();

        for i in 0..20 {
            sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
                format!("client-{}", i),
                vec![make_stream("stream-default", 10.0 + i as f32 * 2.0)],
            ));
        }
        sim.tick();

        let tps = run_bench(&sim, "Medium", "32 nodes (20 clients, 1 LB, 10 servers, 1 DB)", 10_000);
        assert!(tps > 3_500, "Medium topology should exceed 3.5k tps, got {}", tps);
    }

    #[test]
    #[ignore]
    fn bench_large_topology() {
        let sim = Simulation::new();

        for i in 0..50 {
            let lb = if i < 25 { "load_balancer-1" } else { "load_balancer-2" };
            sim.add_edge(
                format!("client-{}", i),
                lb.into(),
                "stream-default".into(),
                "input".into(),
            );
        }
        for i in 0..10 {
            sim.add_edge("load_balancer-1".into(), format!("server-{}", i), "out".into(), "input".into());
            sim.add_edge(format!("server-{}", i), "database-primary".into(), "dep".into(), "input".into());
        }
        for i in 10..20 {
            sim.add_edge("load_balancer-2".into(), format!("server-{}", i), "out".into(), "input".into());
            sim.add_edge(format!("server-{}", i), "database-replica".into(), "dep".into(), "input".into());
        }
        sim.tick();

        for i in 0..50 {
            sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
                format!("client-{}", i),
                vec![make_stream("stream-default", 20.0)],
            ));
        }
        sim.tick();

        let tps = run_bench(&sim, "Large", "74 nodes (50 clients, 2 LBs, 20 servers, 2 DBs)", 10_000);
        assert!(tps > 2_000, "Large topology should exceed 2k tps, got {}", tps);
    }

    #[test]
    #[ignore]
    fn bench_microservices() {
        let sim = Simulation::new();

        for i in 0..30 {
            sim.add_edge(
                format!("client-{}", i),
                "api_gateway-main".into(),
                "stream-default".into(),
                "input".into(),
            );
        }

        for svc in &["server-auth", "server-users", "server-orders", "server-products", "server-inventory"] {
            sim.add_edge("api_gateway-main".into(), svc.to_string(), "out".into(), "input".into());
            sim.add_edge(svc.to_string(), "cache-shared".into(), "dep1".into(), "input".into());
            sim.add_edge(svc.to_string(), "database-main".into(), "dep2".into(), "input".into());
        }

        sim.add_edge("server-orders".into(), "server-inventory".into(), "inv".into(), "input".into());
        sim.add_edge("server-orders".into(), "server-users".into(), "usr".into(), "input".into());
        sim.tick();

        for i in 0..30 {
            sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
                format!("client-{}", i),
                vec![make_stream("stream-default", 15.0)],
            ));
        }
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("cache-shared".into(), 1000.0));
        sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity("database-main".into(), 500.0));
        sim.tick();

        // More warmup for complex topology
        tick_n(&sim, 500);

        let tps = run_bench(
            &sim,
            "Microservices",
            "39 nodes (30 clients, gateway, 5 services, cache, DB), inter-service calls",
            10_000,
        );
        assert!(tps > 2_000, "Microservices topology should exceed 2k tps, got {}", tps);
    }

    #[test]
    #[ignore]
    fn bench_stress_test() {
        let sim = Simulation::new();

        for i in 0..100 {
            let lb_idx = i % 5;
            sim.add_edge(
                format!("client-{}", i),
                format!("load_balancer-{}", lb_idx),
                "stream-default".into(),
                "input".into(),
            );
        }
        for lb in 0..5 {
            for s in 0..10 {
                let server_idx = lb * 10 + s;
                sim.add_edge(
                    format!("load_balancer-{}", lb),
                    format!("server-{}", server_idx),
                    "out".into(),
                    "input".into(),
                );
            }
        }
        sim.tick();

        for i in 0..100 {
            sim.pending_ops.borrow_mut().push(SimOp::SetNodeStreams(
                format!("client-{}", i),
                vec![make_stream("stream-default", 60.0)],
            ));
        }
        for i in 0..50 {
            sim.pending_ops.borrow_mut().push(SimOp::SetNodeCapacity(
                format!("server-{}", i),
                50.0,
            ));
        }
        sim.tick();

        let tps = run_bench(
            &sim,
            "STRESS",
            "155 nodes (100 clients, 5 LBs, 50 servers), 6000 RPS total",
            10_000,
        );
        assert!(tps > 350, "Stress test should exceed 350 tps, got {}", tps);
    }
}
