# SearXNG for AML PEP OSINT

This folder runs a private SearXNG instance used by the n8n AML PEP assistant.

## Start

```bash
cd infra/searxng
cp .env.example .env
openssl rand -hex 32
```

Paste the generated value into `SEARXNG_SECRET` in `.env`, then run:

```bash
docker compose up -d
```

By default SearXNG listens only on `127.0.0.1:8080`. This is intentional. If n8n runs on the same server, use:

```text
http://127.0.0.1:8080/search?q=<query>&format=json&language=pl
```

If n8n runs in another container on the same Docker host, either attach both containers to one Docker network or expose SearXNG through a reverse proxy protected by basic auth/IP allowlist.

## Test

```bash
curl "http://127.0.0.1:8080/search?q=Jan%20Kowalski%20PEP&format=json&language=pl"
```

The response must be JSON with a `results` array.

## Security

Do not expose SearXNG openly to the public internet. It has no built-in authentication suitable for a public API endpoint. Use it internally for n8n or put it behind a protected reverse proxy.
