// Flexible MD export — read-only, no secrets. Renders any read-model slice, item,
// or the analyst's own answer to markdown and downloads it. Used by the analyst
// panel (request-driven + a button on each answer) and by the board/map export
// buttons. Never writes state; the read model carries no credentials.

function fmt(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : x)).join(', ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v == null ? '' : String(v);
}

function renderRecord(r) {
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    return Object.entries(r)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `- **${k}:** ${fmt(v)}`).join('\n');
  }
  return `- ${fmt(r)}`;
}

// render a slice (array of records / a record / scalar) to markdown
export function renderMd(data) {
  if (Array.isArray(data)) return data.map((r, i) => `### ${r.name || r.title || r.id || r.item_id || i + 1}\n${renderRecord(r)}`).join('\n\n');
  if (data && typeof data === 'object') return renderRecord(data);
  return String(data ?? '');
}

// build the markdown string (also used standalone for the analyst answer export)
export function toMd(title, body) {
  return `# ${title}\n\n${body}\n\n_SignalDelta Discovery — read-only export, no secrets._\n`;
}

// trigger a browser download of an MD file; returns the markdown (so callers/tests
// can assert content). Guards the DOM/URL bits so it never throws in jsdom.
export function downloadMd(filename, title, body) {
  const md = toMd(title, body);
  try {
    if (typeof URL !== 'undefined' && URL.createObjectURL && typeof document !== 'undefined') {
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  } catch { /* export is best-effort; the md is still returned */ }
  return { filename, md };
}

// trigger a download of a fully-formed markdown document AS-IS (no title wrapping) —
// used by the Lead Handoff Pack, whose markdown is already a complete BOOT_CONTEXT.md.
export function downloadText(filename, text) {
  try {
    if (typeof URL !== 'undefined' && URL.createObjectURL && typeof document !== 'undefined') {
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  } catch { /* best-effort */ }
  return { filename, text };
}

export function isExportIntent(text) {
  return /\b(export|download|make an md|md on|md of|save as md|save.*markdown)\b/i.test(text || '');
}

// map a free-text export request to a read-model slice, if any
export function matchSlice(text) {
  const t = (text || '').toLowerCase();
  if (/\bboard\b|decision queue|the queue/.test(t)) return 'board';
  if (/\bmap\b|coverage|\bgrid\b|whitespace|surfaces/.test(t)) return 'grid';
  if (/\bkill/.test(t)) return 'kills';
  if (/\bledger\b|\bb1\b|retained/.test(t)) return 'ledger';
  if (/\bgated\b|data need/.test(t)) return 'gated';
  return null;
}

// resolve an export request → { filename, md } (triggers the download), or null if
// the analyst should ask the operator which thing to export.
export async function exportFor(text, contract, messages = []) {
  const t = (text || '').toLowerCase();
  // "export what you just said" / "that answer"
  if (/(what you (just )?said|that answer|your (last )?answer|the answer|this answer)/.test(t)) {
    const last = [...messages].reverse().find((m) => m.role === 'analyst');
    if (last) return downloadMd('analyst-answer.md', 'Analyst answer', last.text);
  }
  // a named read-model slice
  const slice = matchSlice(t);
  if (slice) {
    let data = null;
    try { data = await contract.query(slice); } catch { /* offline */ }
    return downloadMd(`${slice}.md`, `SignalDelta — ${slice}`, renderMd(data));
  }
  // a named surface / brick on the coverage map
  try {
    const grid = (await contract.query('grid')) || [];
    const s = grid.find((g) => {
      const name = (g.name || g.surface || '').toLowerCase();
      const key = name.split(/[ ·]/).filter(Boolean)[0] || '';
      return key && t.includes(key);
    });
    if (s) return downloadMd(`${s.surface || 'surface'}.md`, s.name || s.surface, renderMd(s));
  } catch { /* offline */ }
  return null;
}
