#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-}"
WASM="$ROOT/target/wasm32v1-none/release/agent_guard.wasm"

if [[ ! -f "$WASM" ]]; then
  echo "WASM missing. Run ./scripts/build-wasm.sh first." >&2
  exit 1
fi

if [[ -z "$IDENTITY" ]]; then
  cat <<EOF >&2
STELLAR_IDENTITY is not set.

Remaining manual step:
  1. Copy .env.example to .env
  2. Create and fund a CLI identity:
       stellar keys generate agentguard-deployer --network testnet --fund
  3. Set STELLAR_IDENTITY=agentguard-deployer in .env
  4. Re-run ./scripts/deploy-testnet.sh

Equivalent command:
  stellar contract deploy --wasm $WASM --network $NETWORK --source-account <YOUR_IDENTITY>
EOF
  exit 1
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar CLI not found. Install it, then re-run this script." >&2
  exit 1
fi

echo "Deploying $WASM to $NETWORK as $IDENTITY..."
CONTRACT_ID="$(stellar contract deploy --wasm "$WASM" --network "$NETWORK" --source-account "$IDENTITY")"
echo "$CONTRACT_ID" | tee "$ROOT/scripts/.deployed-contract-id"
echo "Set AGENTGUARD_CONTRACT_ID=$CONTRACT_ID in .env"
