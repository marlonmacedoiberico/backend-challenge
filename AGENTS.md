# Repository Guidelines

## Project Structure & Module Organization

This repository is the ClinicSay backend challenge scaffold. `openapi.yaml` defines the service contract, while `enunciado.pdf` and `enunciado.md` contain the challenge statement. `docker-compose.yml` currently starts the simulated messaging provider in `provider/`; implement the API service and database alongside it in the Compose configuration. The provider's `server.mjs` is fixed for evaluation and must not be modified. Product requirements and design notes live under `.ai/steering/` and `.ai/specs/`.

## Build, Test, and Development Commands

There is no application package manifest or test suite in the scaffold yet. Use Docker Compose to run the existing provider:

- `docker compose up --build` builds and starts the provider on port 4010.
- `docker compose down` stops the services.

As you add the API, document its run and test commands in the README. The intended API configuration includes port `3000`, `CLOCK_MODE=test`, and `PROVIDER_URL=http://provider:4010` (see `docker-compose.yml`).

## Coding Style & Naming Conventions

The supplied provider uses native JavaScript ES modules, two-space indentation, semicolons, and single quotes. Follow those conventions for JavaScript unless the selected application framework establishes a consistent alternative. Keep HTTP routes aligned with the lowercase, plural resource paths in `openapi.yaml`; keep database and API behavior consistent with that contract and the `.ai/` specifications.

## Testing Guidelines

No test framework or coverage threshold is configured yet. Add tests with the API implementation and document the chosen runner and invocation. Cover contract responses, validation, persistence, scheduling/time behavior, and provider retry/idempotency cases. The provider exposes `/admin/reset`, `/admin/rules`, `/admin/messages`, and `/admin/requests` to support repeatable integration tests; keep it unchanged.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase, descriptive subjects (for example, `reminder petri net` and `rules notes`), without a required prefix. Keep commits focused and use a concise imperative summary. Pull requests should explain behavior and design choices, link the relevant challenge requirement or spec, list validation performed, and include API examples when changing externally visible behavior.

## Configuration & Security

Keep local secrets out of version control. Configure service connections through environment variables; use the Compose service name `provider` for container-to-container access rather than `localhost`.

## Agent-Specific Instructions

Treat this repository as the ClinicSay backend application. Before changing behavior, consult `openapi.yaml` and the relevant files under `.ai/steering/` and `.ai/specs/`; use those as the source of truth for API and product decisions. Keep changes focused on the application, its implementation, and its documentation. Preserve the evaluation provider and update README commands when adding runnable services or tooling.
