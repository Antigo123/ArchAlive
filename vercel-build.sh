#!/bin/bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

# Build WASM
cd simulation
wasm-pack build --target web --out-dir pkg
cd ..

# Build Client
rm -rf client/node_modules/simulation
npm install --prefix client
npm run build --prefix client
