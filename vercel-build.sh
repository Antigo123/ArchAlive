#!/bin/bash
set -e

# Vercel pre-installs Rust with RUSTUP_HOME/CARGO_HOME at /rust.
# Source its env to get the correct PATH and variables.
source /rust/env

# Add the wasm32 target to the existing toolchain (idempotent)
rustup target add wasm32-unknown-unknown

# Install wasm-pack if not already in the build cache
if ! command -v wasm-pack &> /dev/null; then
    cargo install wasm-pack
fi

# Build WASM
cd simulation
wasm-pack build --target web --out-dir pkg
cd ..

# Remove stale simulation symlink so npm recreates it against the fresh pkg
rm -rf client/node_modules/simulation
npm install --prefix client
npm run build --prefix client
