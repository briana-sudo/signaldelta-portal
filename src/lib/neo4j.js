// ─────────────────────────────────────────────────────────────
// Neo4j driver singleton — DEFERRED Step D module.
//
// Authored against reconciliation v1.1's data-wiring contract but
// intentionally NOT imported by any component in Steps E–H. Engine
// is running on local Neo4j (bolt://localhost:7687) per v3 §15 which
// is not reachable from a browser running on GitHub Pages. Aura
// migration is planned but not yet scheduled.
//
// To activate when Aura lands:
//   1. Add GitHub Secrets: VITE_NEO4J_URI, VITE_NEO4J_USER, VITE_NEO4J_PASSWORD
//   2. Import { getDriver } here from useNeo4jPoll.js (already wired)
//   3. Mount useNeo4jPoll in App.jsx and pass result down in place of placeholders
// No portal redeploy required beyond that.
// ─────────────────────────────────────────────────────────────
import neo4j from 'neo4j-driver';

let _driver = null;

export function getDriver() {
  if (_driver) return _driver;
  const uri = import.meta.env.VITE_NEO4J_URI;
  const user = import.meta.env.VITE_NEO4J_USER;
  const password = import.meta.env.VITE_NEO4J_PASSWORD;
  if (!uri || !user || !password) {
    throw new Error(
      'Neo4j credentials missing. Set VITE_NEO4J_URI / VITE_NEO4J_USER / VITE_NEO4J_PASSWORD ' +
      'as GitHub Secrets and confirm injection in .github/workflows/deploy.yml.',
    );
  }
  _driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 4,
    connectionAcquisitionTimeout: 5000,
    disableLosslessIntegers: true,
  });
  return _driver;
}

export async function closeDriver() {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

export function getSession() {
  return getDriver().session({ defaultAccessMode: neo4j.session.READ });
}

// Run a single Cypher and return rows as plain objects.
export async function runQuery(cypher, params = {}) {
  const session = getSession();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}
