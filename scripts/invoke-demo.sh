#!/usr/bin/env bash
# Registers, queries, suspends, reactivates, revokes a test agent on Testnet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

IDENTITY="${STELLAR_IDENTITY:-}"
CID="${AGENTGUARD_CONTRACT_ID:-}"
NETWORK="${STELLAR_NETWORK:-testnet}"

if [[ -z "$IDENTITY" || -z "$CID" ]]; then
  echo "Set STELLAR_IDENTITY and AGENTGUARD_CONTRACT_ID in .env" >&2
  echo "See docs/DEPLOYMENT.md" >&2
  exit 1
fi

OWNER="$(stellar keys address "$IDENTITY")"
# Second key used as the agent identity (generate if missing)
if ! stellar keys address agentguard-demo-agent >/dev/null 2>&1; then
  stellar keys generate agentguard-demo-agent --network "$NETWORK" >/dev/null
fi
AGENT="$(stellar keys address agentguard-demo-agent)"

invoke() {
  stellar contract invoke --id "$CID" --source-account "$IDENTITY" --network "$NETWORK" -- "$@"
}

echo "Owner=$OWNER Agent=$AGENT Contract=$CID"

# Metadata as native CLI types (name, description, version)
invoke register_agent --owner "$OWNER" --agent_id "$AGENT" --metadata '{"name":"DemoAgent","description":"testnet demo","version":1}'

echo "--- get_agent ---"
invoke get_agent --agent_id "$AGENT"

echo "--- suspend ---"
invoke suspend_agent --owner "$OWNER" --agent_id "$AGENT"
invoke get_agent --agent_id "$AGENT"

echo "--- reactivate ---"
invoke reactivate_agent --owner "$OWNER" --agent_id "$AGENT"
invoke get_agent --agent_id "$AGENT"

echo "--- revoke ---"
invoke revoke_agent --owner "$OWNER" --agent_id "$AGENT"
invoke get_agent --agent_id "$AGENT"

echo "--- reactivate after revoke (expected failure) ---"
if invoke reactivate_agent --owner "$OWNER" --agent_id "$AGENT"; then
  echo "ERROR: reactivate after revoke succeeded" >&2
  exit 1
else
  echo "Reactivate after revoke failed as expected."
fi
