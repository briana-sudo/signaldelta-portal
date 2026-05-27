// ─────────────────────────────────────────────────────────────
// Market Status Clock — US stock-market OPEN/CLOSED/HOLIDAY state
// + per-second countdown to the next session boundary.
//
// Market-status-clock dispatch 2026-05-26.
//
// Data flow:
//   - Mount-time GET /market_calendar (proxy-side 24h cache; proxy hits
//     Alpaca's /v2/calendar with the engine's APCA credentials).
//   - Re-fetch every 24 hours from the portal too — belt-and-suspenders.
//   - 1-second timer drives the countdown re-computation (cheap; no
//     network, just date math against the cached calendar).
//
// Output shape:
//   {
//     state:      'OPEN' | 'CLOSED' | 'HOLIDAY' | 'LOADING' | 'FALLBACK',
//     label:      e.g. 'STOCKS OPEN'      / 'STOCKS CLOSED' / 'MARKET HOLIDAY',
//     countdown:  'CLOSES IN 1h 23m'       / 'OPENS IN 14h 02m' / 'OPENS Mon 9:30 AM'
//     nextChange: Date instance of the next OPEN/CLOSED boundary,
//     fallback:   true when the calendar is unavailable (proxy returned
//                 {fallback: true}); state still computes from weekday-only
//                 logic but has no holiday awareness.
//   }
//
// ET conversion is via Intl.DateTimeFormat({timeZone:'America/New_York'}) so
// EDT/EST switchovers are handled automatically. DO NOT hardcode UTC ±4/±5.
//
// Hours per dispatch: US regular session 09:30–16:00 ET Mon–Fri excluding
// market holidays. No pre/after-market in v1.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

const REGULAR_OPEN_HHMM = '09:30';
const REGULAR_CLOSE_HHMM = '16:00';

function getProxyConfig() {
  const url = import.meta.env.VITE_PROXY_URL;
  const token = import.meta.env.VITE_PROXY_API_TOKEN;
  if (!url || !token) throw new Error('Proxy credentials missing');
  return { url: url.replace(/\/$/, ''), token };
}

async function fetchMarketCalendar() {
  const { url, token } = getProxyConfig();
  const res = await fetch(`${url}/market_calendar`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.detail) detail = body.detail; } catch { /* ignore */ }
    throw new Error(`/market_calendar failed: ${detail}`);
  }
  return await res.json(); // { calendar: [{date, open, close}, ...] | null, fallback: bool }
}

// Returns {year, month, day, hour, minute, weekday} for a given Date in ET.
const ET_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
  weekday: 'short',
  hour12: false,
});

function getEtParts(date) {
  const parts = ET_PARTS_FORMATTER.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour === '24' ? '00' : map.hour, 10),
    minute: parseInt(map.minute, 10),
    weekday: map.weekday, // 'Mon'..'Sun'
    dateIso: `${map.year}-${map.month}-${map.day}`,
  };
}

// Builds a UTC Date instance for a given ET date-string + ET hh:mm.
// Alpaca's calendar returns `open` / `close` as ET clock-times (e.g., '09:30');
// we convert to UTC milliseconds by treating the ET wall-clock and using the
// formatter trick: try both UTC offsets (-4 and -5) and pick whichever round-
// trips to the right ET hh:mm. This is the standard "interpret a wall-clock
// time in an IANA zone" workaround for JS without Temporal.
function etWallClockToUtcMs(dateIso, hhmm) {
  const [hh, mm] = hhmm.split(':').map((s) => parseInt(s, 10));
  const [Y, M, D] = dateIso.split('-').map((s) => parseInt(s, 10));
  // Try both UTC offsets in the EST/EDT range. Pick the one whose UTC ms,
  // when re-formatted into ET, matches the target wall-clock.
  for (const offsetHours of [4, 5]) {
    const candidateMs = Date.UTC(Y, M - 1, D, hh + offsetHours, mm, 0, 0);
    const parts = getEtParts(new Date(candidateMs));
    if (
      parts.year === Y && parts.month === M && parts.day === D
      && parts.hour === hh && parts.minute === mm
    ) {
      return candidateMs;
    }
  }
  // Fallback: assume EST (-5). Slight skew on DST-transition days is acceptable.
  return Date.UTC(Y, M - 1, D, hh + 5, mm, 0, 0);
}

const WEEKDAY_LONG = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

function formatCountdown(deltaMs, nextOpenDate, nowDate) {
  if (deltaMs <= 0) return '0h 0m';
  const totalMin = Math.floor(deltaMs / 60_000);
  const totalHr = Math.floor(totalMin / 60);
  const days = Math.floor(totalHr / 24);
  if (days >= 7) {
    // >7 days away — show explicit date label
    return ET_DATE_LABEL_FORMATTER.format(nextOpenDate);
  }
  if (days >= 1) {
    // 1–6 days: "Mon 9:30 AM"
    return ET_DAY_TIME_FORMATTER.format(nextOpenDate);
  }
  // <24h: "1h 23m" or "23m"
  const hr = totalHr;
  const min = totalMin % 60;
  if (hr > 0) return `${hr}h ${String(min).padStart(2, '0')}m`;
  return `${min}m`;
}

const ET_DAY_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
});
const ET_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short', day: 'numeric',
});

// Pure status computation — given the cached calendar and a 'now' date,
// returns the {state, label, countdown, nextChange} bundle. Extracted so
// the 1-second tick is cheap (no async, no React side effects).
export function computeMarketStatus(calendar, fallback, now) {
  const nowMs = now.getTime();
  const todayParts = getEtParts(now);
  const todayIso = todayParts.dateIso;

  // Resolve the calendar to a lookup: { 'YYYY-MM-DD': {open, close} } trading days only.
  const tradingDays = new Map();
  if (Array.isArray(calendar)) {
    for (const row of calendar) {
      if (row && row.date && row.open && row.close) {
        tradingDays.set(row.date, { open: row.open, close: row.close });
      }
    }
  }

  // Determine today's trading status.
  const todaySession = tradingDays.get(todayIso);
  let state, label, countdown, nextChange;
  let isHoliday = false;

  if (todaySession) {
    const openMs = etWallClockToUtcMs(todayIso, todaySession.open);
    const closeMs = etWallClockToUtcMs(todayIso, todaySession.close);
    if (nowMs >= openMs && nowMs < closeMs) {
      // OPEN — countdown to close
      state = 'OPEN';
      label = 'STOCKS OPEN';
      const delta = closeMs - nowMs;
      countdown = `CLOSES IN ${formatCountdown(delta, new Date(closeMs), now)}`;
      nextChange = new Date(closeMs);
    } else if (nowMs < openMs) {
      // BEFORE OPEN — pre-market
      state = 'CLOSED';
      label = 'STOCKS CLOSED';
      const delta = openMs - nowMs;
      countdown = `OPENS IN ${formatCountdown(delta, new Date(openMs), now)}`;
      nextChange = new Date(openMs);
    } else {
      // AFTER CLOSE — find next trading day
      const next = findNextTradingDay(tradingDays, todayIso);
      if (next) {
        const nextOpenMs = etWallClockToUtcMs(next.date, next.session.open);
        const delta = nextOpenMs - nowMs;
        state = 'CLOSED';
        label = 'STOCKS CLOSED';
        countdown = `OPENS ${formatNextOpen(delta, new Date(nextOpenMs), now)}`;
        nextChange = new Date(nextOpenMs);
      } else {
        state = 'CLOSED';
        label = 'STOCKS CLOSED';
        countdown = 'CALENDAR EXHAUSTED';
        nextChange = null;
      }
    }
  } else {
    // Today is NOT a trading day — could be weekend or holiday.
    // Weekday-with-no-trading-row = market holiday.
    const dow = todayParts.weekday;
    isHoliday = !fallback && (dow !== 'Sat' && dow !== 'Sun') && Array.isArray(calendar);
    const next = findNextTradingDay(tradingDays, todayIso);
    if (next) {
      const nextOpenMs = etWallClockToUtcMs(next.date, next.session.open);
      const delta = nextOpenMs - nowMs;
      state = isHoliday ? 'HOLIDAY' : 'CLOSED';
      label = isHoliday ? 'MARKET HOLIDAY' : 'STOCKS CLOSED';
      countdown = `OPENS ${formatNextOpen(delta, new Date(nextOpenMs), now)}`;
      nextChange = new Date(nextOpenMs);
    } else if (fallback || !Array.isArray(calendar)) {
      // FALLBACK weekday-only logic (no calendar). Next open = next Mon–Fri 09:30 ET.
      const nextOpen = nextWeekdayOpen(now);
      const delta = nextOpen.getTime() - nowMs;
      state = 'CLOSED';
      label = 'STOCKS CLOSED';
      countdown = `OPENS ${formatNextOpen(delta, nextOpen, now)}`;
      nextChange = nextOpen;
    } else {
      state = 'CLOSED';
      label = 'STOCKS CLOSED';
      countdown = 'CALENDAR EXHAUSTED';
      nextChange = null;
    }
  }

  return { state, label, countdown, nextChange, fallback: !!fallback };
}

function findNextTradingDay(tradingDays, fromIso) {
  // Sort keys, find the first date strictly greater than fromIso.
  const keys = [...tradingDays.keys()].sort();
  for (const k of keys) {
    if (k > fromIso) return { date: k, session: tradingDays.get(k) };
  }
  return null;
}

function formatNextOpen(deltaMs, nextOpenDate, nowDate) {
  const totalMin = Math.floor(deltaMs / 60_000);
  const totalHr = Math.floor(totalMin / 60);
  const days = Math.floor(totalHr / 24);
  if (days >= 1) {
    // 1+ days away → show "Mon 9:30 AM"
    return ET_DAY_TIME_FORMATTER.format(nextOpenDate);
  }
  return `IN ${formatCountdown(deltaMs, nextOpenDate, nowDate)}`;
}

function nextWeekdayOpen(from) {
  // Walk forward up to 7 days; return the first ET-weekday 09:30 strictly after `from`.
  for (let d = 0; d < 8; d++) {
    const candidate = new Date(from.getTime() + d * 86_400_000);
    const p = getEtParts(candidate);
    if (p.weekday !== 'Sat' && p.weekday !== 'Sun') {
      const ms = etWallClockToUtcMs(p.dateIso, REGULAR_OPEN_HHMM);
      if (ms > from.getTime()) return new Date(ms);
    }
  }
  return new Date(from.getTime() + 86_400_000); // pathological fallback
}

// ── Hook ────────────────────────────────────────────────────────────────
const CAL_REFRESH_MS = 24 * 60 * 60 * 1000; // 24h portal-side refresh

export function useMarketStatus() {
  const [calendar, setCalendar] = useState(null);
  const [fallback, setFallback] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const calRefreshRef = useRef(0);

  // Mount-time fetch + 24h refresh.
  useEffect(() => {
    let mounted = true;
    let timer = null;
    async function load() {
      try {
        const res = await fetchMarketCalendar();
        if (!mounted) return;
        setCalendar(res?.calendar ?? null);
        setFallback(!!res?.fallback || !Array.isArray(res?.calendar));
        setLoadError(null);
        calRefreshRef.current = Date.now();
      } catch (e) {
        if (!mounted) return;
        setLoadError(e);
        setFallback(true);
      }
    }
    load();
    timer = setInterval(load, CAL_REFRESH_MS);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, []);

  // 1-second tick for countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (calendar == null && !fallback && !loadError) {
    return { state: 'LOADING', label: 'STOCKS …', countdown: '', nextChange: null, fallback: false };
  }
  return computeMarketStatus(calendar, fallback, now);
}
