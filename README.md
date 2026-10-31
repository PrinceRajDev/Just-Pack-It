# Just Pack It

Multi-category, multi-shop neighbourhood marketplace with buyer, seller, delivery partner and admin workspaces.

## Projects

- [`just-front`](just-front): React, TypeScript, TanStack Router/Query and Vite frontend.
- [`just-back`](just-back): Express, TypeScript, MongoDB and Mongoose API.
- [API contract](just-front/docs/API_CONTRACT.md)

## Local setup

Install dependencies in each project with `npm ci`. Copy each `.env.example` to the local environment file described in that project's README, then configure your own values. Never commit credentials or service-account files.

Run `npm run dev` separately in `just-back` and `just-front`. Database/provider setup and feature flags are documented in each project's README. Payment, email, image and push integrations require their own configuration; do not treat demo fixtures as real shops or transactions.

## Checks

- Frontend: `npm test -- --maxWorkers=2`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Backend: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

Backend automated tests use disposable databases. Do not run development seed, provisioning or infrastructure commands against production without reviewing their scope.
