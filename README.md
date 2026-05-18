# SignalDelta — Operator Portal (Phase 1.1)

Real-time operator dashboard for the SignalDelta paper-trading engine. Reads Neo4j on a 60-second poll and renders the locked PC + mobile visual baselines.

## Build status

Phase 1.1 Step 2 — Vite + React scaffold. Panels wired in subsequent build steps per the [Portal Spec Reconciliation v1.1](https://www.notion.so/364ca70abea681a09305e1dda20461e1).

## Stack

- **Vite** + **React** (functional components, hooks, no external state library)
- **neo4j-driver** for Cypher queries against a shared Bolt session
- **three.js** (r128-compatible patterns; avoid `THREE.CapsuleGeometry` r142+) for the 3D kernel map
- **CSS variables** for design tokens — see [src/styles/index.css](src/styles/index.css)
- **Google Fonts**: Share Tech Mono, Barlow Condensed, Barlow

## Visual baselines (locked, do not modify)

- PC: https://briana-sudo.github.io/signaldelta-portal-preview-pc/
- Mobile: https://briana-sudo.github.io/signaldelta-portal-preview/

## Environment variables

Required at build time (GitHub Secrets → injected by the deploy workflow):

- `VITE_NEO4J_URI`
- `VITE_NEO4J_USER`
- `VITE_NEO4J_PASSWORD`

> Client-side React app — these values WILL appear in the browser bundle after deploy. Phase 4 adds a backend proxy. This is an accepted trade-off for the operator-only Phase 1.1 portal.

## Deployment

Automatic on push to `main` via `.github/workflows/deploy.yml`. Live URL once Pages is configured:

`https://briana-sudo.github.io/signaldelta-portal/`
