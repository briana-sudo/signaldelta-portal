// FLOATING analyst panel — draggable, resizable, minimizable, position-remembered.
// Conversation history + file upload (chat attachment ONLY, never engine state) +
// flexible MD export (request-driven or the ⤓ button on any answer). Firewall:
// reads live state + reasons, never grades/decides/acts; an uploaded file is a
// discussion attachment (never seeds/writes the graph); export is read-only.
import { useEffect, useRef, useState } from 'react';
import { downloadMd, exportFor, isExportIntent } from '../mdExport.js';

const KEY = 'sd-analyst-panel';
const DEF = { x: null, y: null, w: 380, h: 460, min: false };

function loadBox() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return { ...DEF, ...s };
  } catch { /* storage unavailable → default corner */ }
  return { ...DEF };
}
function persist(box) {
  try { localStorage.setItem(KEY, JSON.stringify(box)); } catch { /* ignore */ }
}

export default function AnalystPanel({ contract, costingQuestion, onCostingResolved }) {
  const [box, setBox] = useState(loadBox);
  const [messages, setMessages] = useState([]);
  const [ask, setAsk] = useState('');
  const taRef = useRef(null);
  const [attachment, setAttachment] = useState(null);   // {name,size,text} — chat only
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // the ask box auto-grows with content (single line → multi-line), capped then scroll
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [ask]);
  const bodyRef = useRef(null);
  const drag = useRef(null);
  const pendingCosting = useRef(null);                   // Part C: a costing Q awaiting the operator's answer

  // default to a sensible corner if we have no remembered position
  useEffect(() => {
    if (box.x == null || box.y == null) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const h = typeof window !== 'undefined' ? window.innerHeight : 800;
      setBox((b) => ({ ...b, x: Math.max(12, w - b.w - 24), y: Math.max(12, h - b.h - 24) }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { persist(box); }, [box]);
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, busy]);

  // drag (header) + resize (corner)
  useEffect(() => {
    const onMove = (e) => {
      const d = drag.current; if (!d) return;
      if (d.mode === 'move') {
        const w = window.innerWidth, h = window.innerHeight;
        setBox((b) => ({ ...b,
          x: Math.max(0, Math.min(w - 80, d.ox + e.clientX - d.sx)),
          y: Math.max(0, Math.min(h - 36, d.oy + e.clientY - d.sy)) }));
      } else {
        setBox((b) => ({ ...b,
          w: Math.max(300, d.ow + e.clientX - d.sx),
          h: Math.max(260, d.oh + e.clientY - d.sy) }));
      }
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const startMove = (e) => {
    if (e.target.closest('button')) return;             // don't drag when clicking a header button
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y };
    e.preventDefault();
  };
  const startResize = (e) => {
    drag.current = { mode: 'resize', sx: e.clientX, sy: e.clientY, ow: box.w, oh: box.h };
    e.preventDefault(); e.stopPropagation();
  };

  const addMsg = (m) => setMessages((prev) => [...prev, m]);

  // Part C — a costing question handed from the worker: open the panel + pose it;
  // the operator's NEXT message is captured as the recorded resolution. No spend.
  useEffect(() => {
    if (!costingQuestion) return;
    pendingCosting.current = costingQuestion;
    setBox((b) => ({ ...b, min: false }));
    setMessages((prev) => [...prev, { role: 'analyst',
      text: `Costing — ${costingQuestion.surface}: ${costingQuestion.question}\n\nAnswer here and I'll record it and explain — nothing is purchased.` }]);
  }, [costingQuestion]);

  async function onFiles(fileList) {
    const f = fileList && fileList[0]; if (!f) return;
    let text = '';
    try { text = (await f.text()).slice(0, 20000); } catch { /* binary/unreadable */ }
    setAttachment({ name: f.name, size: f.size, text });
    addMsg({ role: 'analyst',
      text: `Attached "${f.name}" (${f.size} bytes) to our conversation — I'll reason over it here. A chat attachment is discussion only: it never becomes engine state and never seeds or writes the graph.` });
  }

  async function send(e) {
    e && e.preventDefault();
    const text = ask.trim();
    if (!text && !attachment) return;
    addMsg({ role: 'user', text: text + (attachment ? `   📎 ${attachment.name}` : '') });
    setAsk('');

    if (isExportIntent(text)) {                          // export request → make the MD, no analyst call
      const res = await exportFor(text, contract, messages);
      addMsg({ role: 'analyst',
        text: res ? `Exported → ${res.filename} (read-only, no secrets).`
                  : 'I can export the board, the coverage map, the kills, the ledger (B1), a gated surface, or my last answer — name one and I\'ll make the MD.' });
      if (attachment) setAttachment(null);
      return;
    }

    // Part C — if a costing question is pending, THIS answer resolves it (recorded
    // back to the card). The assistant still explains; it never buys or onboards.
    const pc = pendingCosting.current;

    setBusy(true);
    let r;
    try { r = await contract.analyst({ ask: text, attachment, history: messages }); }
    catch { r = { kind: 'EXPLAIN', explanation: 'The analyst is unavailable right now — try again in a moment.' }; }
    setBusy(false);
    addMsg({ role: 'analyst', text: r.explanation || '(no answer)', route: r.routed_item_type || null, kind: r.kind });
    if (pc) {
      pendingCosting.current = null;
      onCostingResolved && onCostingResolved(pc.surface_id, text);
      addMsg({ role: 'analyst',
        text: `Recorded for ${pc.surface} — the worker can finish the card. Nothing was purchased; buying stays your Approve.` });
    }
    if (attachment) setAttachment(null);
  }

  // --- minimized bubble --------------------------------------------------------
  if (box.min) {
    return (
      <button className="analyst-bubble" onClick={() => setBox((b) => ({ ...b, min: false }))}
              aria-label="Open analyst">
        <span className="pulse st-running" />Analyst
      </button>
    );
  }

  const style = { width: box.w, height: box.h,
    left: box.x != null ? box.x : undefined, top: box.y != null ? box.y : undefined,
    right: box.x == null ? 24 : undefined, bottom: box.y == null ? 24 : undefined };

  return (
    <div className="analyst-panel" style={style}
         onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
         onDragLeave={() => setDragOver(false)}
         onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}>
      <div className="ap-head" onMouseDown={startMove}>
        <span className="ap-title"><i className="pulse st-running" />Analyst · grounded in live state</span>
        <button className="ap-btn" onClick={() => setBox((b) => ({ ...b, min: true }))}
                title="Minimize" aria-label="Minimize analyst">–</button>
      </div>

      <div className={`ap-body${dragOver ? ' dragover' : ''}`} ref={bodyRef}>
        {messages.length === 0 && (
          <div className="ap-empty">Ask about the board, the map, what to unlock — or drop a file to discuss it.
            Try “what's runnable now,” or “export the relational surface.”</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ap-msg ${m.role}`}>
            <div className="ap-text">{m.text}</div>
            {m.role === 'analyst' && m.route && <span className="route">routed → {m.route}</span>}
            {m.role === 'analyst' && m.text && m.text !== '(no answer)' && (
              <button className="ap-exp" title="Export this answer to MD"
                      onClick={() => downloadMd('analyst-answer.md', 'Analyst answer', m.text)}>⤓ MD</button>
            )}
          </div>
        ))}
        {busy && <div className="ap-msg analyst"><div className="ap-text ap-typing">…</div></div>}
      </div>

      {attachment && (
        <div className="ap-attach">📎 {attachment.name}
          <button onClick={() => setAttachment(null)} aria-label="Remove attachment">×</button></div>
      )}

      <form className="ap-ask" onSubmit={send}>
        <label className="ap-attachbtn" title="Attach a file to discuss (not engine state)">📎
          <input type="file" onChange={(e) => onFiles(e.target.files)} style={{ display: 'none' }}
                 aria-label="Attach a file to discuss" />
        </label>
        <textarea ref={taRef} value={ask} rows={1} className="ap-textarea"
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
                  placeholder="Ask, or “export the board”… (Shift+Enter for a new line)" aria-label="Ask the analyst" />
        <button type="submit" disabled={busy}>Ask</button>
      </form>

      <div className="ap-resize" onMouseDown={startResize} title="Drag to resize" aria-hidden="true" />
    </div>
  );
}
