use crate::engine::SimulationInner;
use crate::ops::SimOp;
use crate::types::*;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

// ═══════════════════════════════════════════════════════════════════════════════
// WASM-Facing Simulation Handle
// ═══════════════════════════════════════════════════════════════════════════════

/// The public WASM API wrapper around the simulation engine.
///
/// Uses `RefCell` interior mutability to satisfy `wasm_bindgen`'s requirement
/// for `&self` receivers while still allowing mutation of internal state.
/// Operations are queued via `pending_ops` and applied atomically at tick start.
#[wasm_bindgen]
pub struct Simulation {
    pub(crate) inner: RefCell<SimulationInner>,
    pub(crate) pending_ops: RefCell<Vec<SimOp>>,
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Simulation {
        Simulation {
            inner: RefCell::new(SimulationInner::new()),
            pending_ops: RefCell::new(Vec::new()),
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Node Configuration API
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn set_node_request_rate(&self, id: String, rate: f32) {
        if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
            ops.push(SimOp::SetNodeRequestRate(id, rate));
        }
    }

    pub fn set_server_delay(&self, delay: f32) {
        if let Ok(mut inner) = self.inner.try_borrow_mut() {
            inner.server_delay = delay;
            for node in inner.nodes.iter_mut() {
                if matches!(node.node_type, NodeType::Server) {
                    node.processing_delay = delay;
                }
            }
        }
    }

    pub fn set_node_delay(&self, id: String, delay: f32) {
        if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
            ops.push(SimOp::SetNodeDelay(id, delay));
        }
    }

    pub fn set_node_capacity(&self, id: String, capacity: f32) {
        if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
            ops.push(SimOp::SetNodeCapacity(id, capacity));
        }
    }

    pub fn set_node_cache_hit_rate(&self, id: String, rate: f32) {
        if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
            ops.push(SimOp::SetNodeCacheHitRate(id, rate));
        }
    }

    pub fn set_node_streams(&self, id: String, streams_val: JsValue) {
        if let Ok(streams) = serde_wasm_bindgen::from_value::<Vec<TrafficStream>>(streams_val) {
            if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
                ops.push(SimOp::SetNodeStreams(id, streams));
            }
        }
    }

    pub fn set_node_endpoints(&self, id: String, eps_val: JsValue) {
        if let Ok(eps) = serde_wasm_bindgen::from_value::<Vec<Endpoint>>(eps_val) {
            if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
                ops.push(SimOp::SetNodeEndpoints(id, eps));
            }
        }
    }

    pub fn set_node_dependencies(&self, id: String, deps_val: JsValue) {
        if let Ok(deps) = serde_wasm_bindgen::from_value(deps_val) {
            if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
                ops.push(SimOp::SetNodeDependencies(id, deps));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Topology Management
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn clear_edges(&self) {
        if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
            ops.push(SimOp::ClearEdges);
        }
    }

    pub fn add_edge(
        &self,
        source: String,
        target: String,
        source_handle: String,
        target_handle: String,
        delay_ms: f32,
    ) {
        if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
            ops.push(SimOp::AddEdge(source, target, source_handle, target_handle, delay_ms));
        }
    }

    pub fn remove_node(&self, id: String) {
        if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
            ops.push(SimOp::RemoveNode(id));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Tick — Main Entry Point
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn tick(&self) -> JsValue {
        // 1. Extract pending ops (release borrow immediately)
        let ops_to_process: Vec<SimOp> = {
            if let Ok(mut ops) = self.pending_ops.try_borrow_mut() {
                std::mem::take(&mut *ops)
            } else {
                Vec::new()
            }
        };

        // 2. Apply ops + run simulation tick
        if let Ok(mut inner) = self.inner.try_borrow_mut() {
            if !ops_to_process.is_empty() {
                inner.apply_ops(ops_to_process);
            }
            return inner.tick();
        }

        JsValue::NULL
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Zero-Copy Buffer Accessors (for JS direct memory read)
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn get_packet_buffer_ptr(&self) -> *const f32 {
        if let Ok(inner) = self.inner.try_borrow() {
            inner.packet_buffer.as_ptr()
        } else {
            std::ptr::null()
        }
    }

    pub fn get_packet_buffer_len(&self) -> usize {
        if let Ok(inner) = self.inner.try_borrow() {
            inner.packet_buffer.len()
        } else {
            0
        }
    }

    pub fn get_node_status_buffer_ptr(&self) -> *const f32 {
        if let Ok(inner) = self.inner.try_borrow() {
            inner.node_status_buffer.as_ptr()
        } else {
            std::ptr::null()
        }
    }

    pub fn get_node_status_buffer_len(&self) -> usize {
        if let Ok(inner) = self.inner.try_borrow() {
            inner.node_status_buffer.len()
        } else {
            0
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Query API
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn get_node_index(&self, id: String) -> i32 {
        if let Ok(inner) = self.inner.try_borrow() {
            match inner.id_to_index.get(&id) {
                Some(idx) => *idx as i32,
                None => -1,
            }
        } else {
            -1
        }
    }

    pub fn get_node_ids(&self) -> JsValue {
        if let Ok(inner) = self.inner.try_borrow() {
            let ids: Vec<String> = inner.nodes.iter().map(|n| n.id.clone()).collect();
            serde_wasm_bindgen::to_value(&ids).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Smoke Test Export
// ═══════════════════════════════════════════════════════════════════════════════

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
