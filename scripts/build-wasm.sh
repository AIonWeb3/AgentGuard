#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "Building agent_guard.wasm (release, wasm32v1-none)..."
cargo build --target wasm32v1-none --release -p agent-guard
WASM="$ROOT/target/wasm32v1-none/release/agent_guard.wasm"
if [[ ! -f "$WASM" ]]; then
  echo "WASM not found at $WASM" >&2
  exit 1
fi
echo "Built $WASM"
ls -l "$WASM"
