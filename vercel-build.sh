#!/bin/bash
set -e

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Source Rust environment (handle both standard and Vercel paths)
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
elif [ -f "/rust/env" ]; then
    source "/rust/env"
fi

# Ensure rustup and the wasm target are available
export PATH="/rust/bin:$HOME/.cargo/bin:$PATH"
rustup target add wasm32-unknown-unknown

# Install wasm-pack if not available
if ! command -v wasm-pack &> /dev/null; then
    cargo install wasm-pack
fi

# Build WASM
cd simulation
wasm-pack build --target web --out-dir pkg
cd ..

# Build Client
npm install --prefix client
npm run build --prefix client
