# AgentGuard — Stellar Testnet deployment

Do not paste private keys into this file or into git. Use a named Stellar CLI identity.

## Prerequisites

- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
- Rust target `wasm32v1-none`: `rustup target add wasm32v1-none`
- A Testnet-funded identity:

```bash
stellar keys generate agentguard-deployer --network testnet --fund
```

Fund the printed address from the [Stellar Laboratory friendbot](https://laboratory.stellar.org/#account-creator?network=testnet).

Copy `.env.example` to `.env` and set `STELLAR_IDENTITY=agentguard-deployer`.

## Build optimized WASM

```bash
./scripts/build-wasm.sh
```

Output: `target/wasm32v1-none/release/agent_guard.wasm`

## Deploy

```bash
./scripts/deploy-testnet.sh
```

The script prints the contract ID. Save it as `AGENTGUARD_CONTRACT_ID` in `.env`. It also writes `scripts/.deployed-contract-id` (gitignored) if the deploy succeeds.

If credentials are missing, the script exits with the exact remaining manual command.

## Initialize

```bash
stellar contract invoke \
  --id "$AGENTGUARD_CONTRACT_ID" \
  --source-account "$STELLAR_IDENTITY" \
  --network testnet \
  -- \
  initialize \
  --admin "$(stellar keys address "$STELLAR_IDENTITY")"
```

## Demo invoke flow

```bash
./scripts/invoke-demo.sh
```

Requires `AGENTGUARD_CONTRACT_ID` and `STELLAR_IDENTITY`. The script registers, queries, suspends, reactivates, revokes, then shows that a second reactivate fails.

## Manual invoke examples

Replace `$OWNER` / `$AGENT` with G... addresses. Metadata is a Soroban map matching `AgentMetadata`.

```bash
stellar contract invoke --id "$AGENTGUARD_CONTRACT_ID" --source-account "$STELLAR_IDENTITY" --network testnet -- \
  get_owner_agents --owner "$OWNER"
```

## Contract ID

No Testnet contract ID is recorded in this repository unless a deploy in this environment actually succeeded. See the final verification notes in the README after a real deploy.
