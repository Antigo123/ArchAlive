<img width="1148" height="603" alt="archalivegif" src="https://github.com/user-attachments/assets/b332b054-946e-46cc-a09c-aa41123dc6eb" />

**Play it live at: [https://archalive.com/](https://archalive.com/)**

ArchAlive turns static architecture into living infrastructure. Build complex cloud topologies using a suite of drag-and-drop components including load balancers and API gateways, then leverage a high-performance WebAssembly engine to simulate and visualize real-time traffic flow across your entire design.

## Features

- **Visual Architecture Builder** — Drag-and-drop canvas for assembling complex system topologies.
- **Real-Time Simulation** — High-performance WebAssembly (Rust) engine simulates thousands of requests per second directly in the browser.
- **Guided Scenarios** — Structured chapters with progressive puzzles covering fault tolerance, load balancing, caching, and more.
- **Live Performance Metrics** — Throughput, latency, and resource utilization stats update as the simulation runs.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, TailwindCSS, PixiJS |
| Simulation Engine | Rust → WebAssembly (via `wasm-pack`) |

## Project Structure

```
ArchAlive/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/   # UI components
│       └── puzzles/      # Scenario definitions
├── simulation/      # Rust simulation engine
│   └── src/
│       └── engine.rs
└── package.json     # Root build scripts
```

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (latest stable)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) — installed automatically via `npm install`

### Getting Started

1. **Build the Rust simulation engine**

   ```bash
   cd simulation && wasm-pack build --target web --out-dir pkg
   ```

2. **Install frontend dependencies**

   ```bash
   cd client && npm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

4. **Open in browser**

   Navigate to `http://localhost:5173` (or the port Vite prints).

> After editing Rust code, re-run step 1 to rebuild the WASM package.

## Production Build

```bash
npm run build
```

Runs the wasm-pack build, installs client dependencies, and outputs to `client/dist/`.
