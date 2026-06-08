# OpenClaw Soccer Dashboard

Static frontend for the OpenClaw soccer model. It reads sanitized JSON exports
from `data/` and renders a daily board, market edges, and diagnostics.

## Serving Locally

The dashboard uses `fetch()` and must be served over HTTP. It will not work from
`file://`.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

If running on a remote VPS, tunnel the port to your local machine:

```bash
ssh -L 8000:localhost:8000 user@your-server
```

Then open `http://localhost:8000` locally.

## Staging Data

The frontend accepts a `?dataRoot=` query parameter to load data from any
subdirectory of this repo without touching production `data/`.

```text
http://localhost:8000/?dataRoot=staging-data
```

That URL serves `staging-data/manifest.json`, `staging-data/daily/...`, and
related files. Use this to preview exports before overwriting `data/`.

Current data directories:

- `data/` - production exports from real model runs

## Data Layout

```text
index.html
app.js
style.css
fonts/
data/
  manifest.json
  latest.json
  daily/
    YYYY-MM-DD.json
  audit/
    latest.json
```

`manifest.json` lists available dates, newest first. `latest.json` is a copy of
the most recent daily export. `audit/latest.json` is the audit block from the
most recent run.

## Validating Exports

Before publishing, validate exports from the private workspace:

```bash
python3 models/validate_export.py dashboard/data/daily/2026-06-11.json
```

The validator checks:

- required top-level and game-level keys
- summary counters against actual game objects
- `sources.coverage` counters against actual game and blocked counts
- audit counters against games and blocked arrays
- `market_status` values: `available`, `model_only`, or `missing`
- `markets.btts` remains `null` until BTTS markets are implemented
- blocked entries have required fields and `status: blocked`

Exit code `0` means valid. Exit code `1` means errors were found.

Also validate `latest.json` if it differs from the daily file, then copy only
the sanitized JSON into this repo's `data/` directory:

```bash
python3 models/validate_export.py dashboard/data/latest.json
```

## Export Guard

The model script skips writing to `dashboard/data/` when there are no fixtures or
blocked entries for a date:

```text
[dashboard_export] No fixtures for this date - skipping export.
```

This keeps `manifest.json` clean. Only dates with actual content appear in the
date picker.

## Schema

Daily exports follow `soccer-dashboard-v1` with `schema_version: 1`. Field
definitions and normalization logic live in the private model workspace.

The `markets.btts` field is reserved and remains `null` until BTTS market odds
are integrated.

## Public Boundary

This public dashboard repo should contain only:

- `index.html`, `app.js`, and `style.css`
- sanitized `data/` JSON exports
- required static assets such as fonts

It must not contain model code, odds source logic, API keys, raw source
responses, cron configuration, logs, screenshots, or staging/test directories.
