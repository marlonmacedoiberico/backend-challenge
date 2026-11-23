# Repository Guidelines

## Project Structure & Module Organization

This repository contains the ClinicSay backend API scaffold. `src/` holds the Node.js/TypeScript service, `migrations/` contains PostgreSQL migrations, and the root `Dockerfile` builds the API. `openapi.yaml` defines the service contract; `enunciado.pdf` and `enunciado.md` contain the challenge statement. `docker-compose.yml` runs the API, PostgreSQL, and simulated messaging provider in `provider/`. The provider's `server.mjs` is fixed for evaluation and must not be modified. Product requirements and design notes live under `.ai/steering/` and `.ai/specs/`.

## Build, Test, and Development Commands

Build and run the local stack with Docker Compose:

- `docker compose up --build` builds and starts the API, database, and provider.
- `docker compose down` stops the services while preserving the PostgreSQL volume.
- `npm install` installs dependencies for local development; `npm run build` compiles TypeScript into `dist/`.

The API uses port `3000`, `CLOCK_MODE=test`, `PROVIDER_URL=http://provider:4010`, and `DATABASE_URL` (see `docker-compose.yml`). Document any new run or test commands in the README.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, and single quotes, consistent with the API scaffold and supplied provider. Keep HTTP routes aligned with the paths in `openapi.yaml`; keep database and API behavior consistent with that contract and the `.ai/` specifications.

## Testing Guidelines

No test framework or coverage threshold is configured yet. Add tests with the API implementation and document the chosen runner and invocation. Cover contract responses, validation, persistence, scheduling/time behavior, and provider retry/idempotency cases. The provider exposes `/admin/reset`, `/admin/rules`, `/admin/messages`, and `/admin/requests` to support repeatable integration tests; keep it unchanged.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase, descriptive subjects (for example, `reminder petri net` and `rules notes`), without a required prefix. Keep commits focused and use a concise imperative summary. Pull requests should explain behavior and design choices, link the relevant challenge requirement or spec, list validation performed, and include API examples when changing externally visible behavior.

## Configuration & Security

Keep local secrets out of version control. Configure service connections through environment variables; use the Compose service name `provider` for container-to-container access rather than `localhost`.

## Agent-Specific Instructions

Treat this repository as the ClinicSay backend application. Before changing behavior, consult `openapi.yaml` and the relevant files under `.ai/steering/` and `.ai/specs/`; use those as the source of truth for API and product decisions. Keep changes focused on the application, its implementation, and its documentation. Preserve the evaluation provider and update README commands when adding runnable services or tooling.
