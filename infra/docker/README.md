# infra/docker — Self-hosted Safe Transaction Service

This directory contains the Docker Compose file and configuration for running the
[Safe Transaction Service](https://github.com/safe-global/safe-transaction-service) locally,
scoped to BNB Chapel testnet (chainId 97).

The Safe Tx Service collects multisig transaction signatures and exposes them via a REST API,
allowing the wallet-portal UI and backends to query pending signatures without relying on
the public Safe infrastructure.

---

## Quick Start

### 1. Prerequisites

- The main wallet-portal dev stack must be running first (provides the `wp-net` network and `redis`):

  ```bash
  docker compose -f infra/docker-compose.yml up -d redis
  ```

- Python 3 available locally to generate `DJANGO_SECRET_KEY` (one-time setup).

### 2. Configure environment

```bash
cd infra/docker
cp .env.safe-tx.example .env.safe-tx
```

Edit `.env.safe-tx` and set:

| Variable | Description |
|---|---|
| `DJANGO_SECRET_KEY` | Random secret — see generation command below |
| `ETHEREUM_NODE_URL` | Chapel RPC URL (default public endpoint works for dev) |
| `ETHEREUM_CHAIN_ID` | `97` (Chapel testnet) |
| `START_BLOCK` | Recent Chapel block to skip genesis indexing — **strongly recommended** |

#### Generate `DJANGO_SECRET_KEY`

```bash
python3 -c "import secrets; print(secrets.token_hex(50))"
```

Copy the output into `.env.safe-tx` as `DJANGO_SECRET_KEY=<value>`.

#### Set `START_BLOCK` (important)

Indexing from genesis block on Chapel testnet can take **many hours**.
Set `START_BLOCK` to a recent block to skip past history:

1. Visit [Chapel BscScan](https://testnet.bscscan.com) and note the current block number.
2. Subtract a small buffer (e.g. 1000 blocks) to ensure your Safe's creation block is included.
3. Add to `.env.safe-tx`:

   ```dotenv
   START_BLOCK=45123000
   ```

### 3. Bring up the stack

```bash
docker compose -f infra/docker/safe-tx-service.compose.yml up -d
```

Services started:

| Service | Role |
|---|---|
| `safe-tx-postgres` | Dedicated Postgres 14 DB (port 5434) |
| `safe-tx-web` | Django API server (port 8888) |
| `safe-tx-worker` | Celery worker — processes tasks |
| `safe-tx-scheduler` | Celery Beat — periodic task scheduler |
| `safe-tx-indexer` | Celery worker — indexes chain events |

### 4. Verify

```bash
curl http://localhost:8888/api/v1/about/
```

Expected response (HTTP 200):

```json
{
  "name": "Safe Transaction Service",
  "version": "...",
  "api_version": "v1",
  "secure": false,
  "eth_network": "unknown",
  "eth_chain_id": "97",
  ...
}
```

### 5. Configure app env vars

Once the service is running and verified, set in each app's `.env.local`:

```dotenv
SAFE_TX_SERVICE_URL=http://localhost:8888
```

Or run the sync-envs helper after adding `SAFE_TX_SERVICE_URL` to `.deployed.json`:

```bash
# infra/chain/.deployed.json — add or update:
# "SAFE_TX_SERVICE_URL": "http://localhost:8888"

pnpm --filter @wp/chain-scripts sync-envs
```

This writes:
- `apps/ui/.env.local` → `VITE_SAFE_TX_SERVICE_URL=http://localhost:8888`
- `apps/admin-api/.env.local` → `SAFE_TX_SERVICE_URL=http://localhost:8888`
- `apps/wallet-engine/.env.local` → `SAFE_TX_SERVICE_URL=http://localhost:8888`

---

## Tear down

```bash
docker compose -f infra/docker/safe-tx-service.compose.yml down

# To also remove the Postgres volume (full reset):
docker compose -f infra/docker/safe-tx-service.compose.yml down -v
```

---

## Network Architecture

The compose file uses the `wp-net` external Docker network (created by the main
`docker-compose.yml`). This allows the Safe Tx Service containers to reach the
existing `redis` container by hostname without duplicating infrastructure.

```
wp-net (external)
  ├── redis            ← main stack — reused as Celery broker
  ├── safe-tx-postgres ← dedicated DB for Safe Tx Service
  ├── safe-tx-web      ← API :8888
  ├── safe-tx-worker   ← Celery worker
  ├── safe-tx-scheduler← Celery beat
  └── safe-tx-indexer  ← Chain event indexer
```

---

## Troubleshooting

### `wp-net` network not found

Start the main stack first:

```bash
docker compose -f infra/docker-compose.yml up -d redis
```

### Indexer is slow / API returns empty results

This is normal on first start if `START_BLOCK` is not set or is set too far in the past.
Set `START_BLOCK` to a recent block, then restart the indexer:

```bash
docker compose -f infra/docker/safe-tx-service.compose.yml restart safe-tx-indexer
```

### API returns 500 on `/api/v1/about/`

The DB migrations may not have run yet. Check web logs:

```bash
docker compose -f infra/docker/safe-tx-service.compose.yml logs safe-tx-web
```

### Port 8888 conflict

The main stack's `otel-collector-base` service also binds port `8888` (OTel metrics).
If both are running simultaneously, the Safe Tx Service will fail to bind.
Options:
- Stop the OTel collector: `docker compose stop otel-collector-base`
- Or change the Safe Tx Service port: edit `ports: - '8889:8888'` in `safe-tx-service.compose.yml`
  and update `SAFE_TX_SERVICE_URL=http://localhost:8889`.

---

## Security Notes

- `DJANGO_SECRET_KEY` must be kept secret — do not commit `.env.safe-tx` to git.
- `.env.safe-tx` is git-ignored; only `.env.safe-tx.example` is committed.
- This setup is for testnet/dev only. For production, replace the public Chapel RPC
  with a private node and restrict `DJANGO_ALLOWED_HOSTS`.
