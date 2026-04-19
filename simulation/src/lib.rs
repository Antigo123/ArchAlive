//! ArchAlive Simulation Engine
//!
//! A network simulation engine compiled to WASM for real-time visualization
//! of distributed system topologies including load balancers, servers,
//! databases, caches, message queues, and Kubernetes clusters.

mod types;
mod node;
mod ops;
mod engine;
mod wasm_api;

pub use types::*;
pub use node::*;
pub use ops::SimOp;
pub use engine::SimulationInner;
pub use wasm_api::*;

#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[cfg(test)]
mod tests;
