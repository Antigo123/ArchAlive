<img width="1148" height="603" alt="archalivegif" src="https://github.com/user-attachments/assets/b332b054-946e-46cc-a09c-aa41123dc6eb" />

**Play it live at: [https://archalive.com/](https://archalive.com/)**

ArchAlive teaches backend concepts by running them. Ask what an ACL is, how rate limiting works, or what's inside a JWT, and a tutor builds a working system on a live canvas. You predict what will happen, watch real traffic, and check your guess against what the simulator actually did.

## Features

- **Tutor chat** — Ask about any backend concept and get a lesson built for it, plus answers to follow-up questions about what's on screen.
- **Predict, then watch** — Lesson steps pause traffic, ask you to commit to a prediction, then run it and show real request counts before the explanation.
- **Lesson tabs** — Each topic keeps its own canvas, chat and progress in your browser, separate from your own designs.
- **Policy node** — An ordered rule table with live hit counts. It can model an ACL, an authorization check, a firewall or a rate limiter, and you can edit its rules mid-lesson.
- **Diagram cards** — Tables, trees, key-value lists and sequence diagrams for concepts that aren't traffic, like B-trees and token formats.
- **Visual Architecture Builder** — Drag-and-drop canvas for assembling your own system topologies.
- **Real-Time Simulation** — A WebAssembly (Rust) engine simulates thousands of requests per second in the browser.
- **Guided Scenarios** — Tutorials and templates covering fault tolerance, load balancing, caching, and more.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, TailwindCSS, PixiJS |
| Simulation Engine | Rust → WebAssembly (via `wasm-pack`) |
| Tutor | Claude API (`@anthropic-ai/sdk`), served by a local Vite middleware |

## Project Structure

```
ArchAlive/
├── client/          # React frontend (Vite)
│   ├── server/           # The tutor's chat endpoint, tools and system prompt
│   └── src/
│       ├── components/   # UI components
│       ├── puzzles/      # Scenario definitions
│       └── tutor/        # Lesson flow, agent loop, and the scene compiler
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

3. **Add an Anthropic API key** (optional: the built-in ACL lesson works without one)

   ```bash
   cp client/.env.example client/.env.local
   ```

   Then set `ANTHROPIC_API_KEY` in `client/.env.local`. It stays on the local server and never reaches the browser. The tutor uses Claude Sonnet 5.5; set `TUTOR_MODEL` to use a different model.

4. **Start the development server**

   ```bash
   cd client && npm run dev
   ```

5. **Open in browser**

   Navigate to `http://localhost:5173` (or the port Vite prints).

> After editing Rust code, re-run step 1 to rebuild the WASM package.

## Production Build

```bash
npm run build
```

Runs the wasm-pack build, installs client dependencies, and outputs to `client/dist/`.

The production build is a static site with no tutor endpoint, so deployed copies can't spend your API key. Only the built-in lesson works there; the tutor chat runs under `npm run dev` or `npm run preview`.

## Tests

```bash
cd simulation && cargo test
cd client && npx vitest run
```
