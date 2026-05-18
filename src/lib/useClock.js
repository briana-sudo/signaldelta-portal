import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// Dual-timezone clock per reconciliation Section E.2.
//
// The portal is dual-purpose: operator instrument + financial-news
// content surface. Content priority overrides the operator's UTC
// default for the display layer. The header clock therefore shows
// US Eastern Time (ET — EDT in summer, EST in winter) prominently
// and UTC alongside for operator cross-reference.
//
// DST handling is automatic via the IANA timezone identifier
// 'America/New_York' passed to Intl.DateTimeFormat. Never hardcode
// -5 or -4 offsets anywhere.
//
// Data layer is untouched — Neo4j, engine writes, Cypher queries,
// query responses all remain UTC. Conversion happens at the render
// layer only.
//
// Phase 4 will parameterize the timezone per subscriber account
// (ET as the default for new accounts). All conversions live in
// this single hook + the dataAdapter formatters, so per-user
// override is a localized change.
// ─────────────────────────────────────────────────────────────

const TZ = 'America/New_York';

// PC header — ET with seconds, 12h AM/PM (e.g., "3:45:21 PM")
const ET_FORMATTER_FULL = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric', minute: '2-digit', second: '2-digit',
  hour12: true,
});

// Mobile header — ET without seconds, 12h AM/PM (e.g., "3:45 PM")
const ET_FORMATTER_COMPACT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric', minute: '2-digit',
  hour12: true,
});

function formatUTC(withSeconds) {
  const n = new Date();
  const parts = [n.getUTCHours(), n.getUTCMinutes()];
  if (withSeconds) parts.push(n.getUTCSeconds());
  return parts.map((v) => String(v).padStart(2, '0')).join(':');
}

function readClock() {
  const now = new Date();
  return {
    et: ET_FORMATTER_FULL.format(now),
    etCompact: ET_FORMATTER_COMPACT.format(now),
    utc: formatUTC(true),
    utcCompact: formatUTC(false),
  };
}

export function useClock() {
  const [t, setT] = useState(readClock);
  useEffect(() => {
    const id = setInterval(() => setT(readClock()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function usePollCountdown() {
  const [secs, setSecs] = useState(60);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          setPulse(true);
          setTimeout(() => setPulse(false), 800);
          return 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return { secs, pulse };
}
