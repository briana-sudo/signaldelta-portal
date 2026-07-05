// FLOATING analyst panel — draggable, resizable, minimizable, position-remembered.
// Conversation history + file upload (chat attachment ONLY, never engine state) +
// flexible MD export (request-driven or the ⤓ button on any answer). Firewall:
// reads live state + reasons, never grades/decides/acts; an uploaded file is a
// discussion attachment (never seeds/writes the graph); export is read-only.
import { useEffect, useRef, useState } from 'react';
import { downloadMd, exportFor, isExportIntent } from '../mdExport.js';

const KEY = 'sd-analyst-panel';
const DEF = { x: null, y: null, w: 380, h: 460, min: false, max: false };

// IMAGE CAPS (stated + enforced): screenshots are downscaled client-side to a 1600px
// longest edge as JPEG q0.82 (a full-screen 4K grab → ~200-400 KB) so we don't ship
// multi-MB PNGs; up to 5 images per message. Downscale-not-reject keeps the operator's
// paste-heavy flow smooth. Server re-caps as defence in depth.
const IMG_MAX_EDGE = 1600;
const IMG_MAX_COUNT = 5;
const IMG_QUALITY = 0.82;

// draw the image onto a bounded canvas and re-encode → {media_type, data(base64), dataUrl}.
function downscaleImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, IMG_MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      // PNG keeps crisp text (screenshots); re-encode large ones as JPEG to bound size
      const asPng = (file.type === 'image/png') && (img.width * img.height <= 1400 * 1400);
      const dataUrl = asPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', IMG_QUALITY);
      const [, media_type, , data] = dataUrl.match(/^data:([^;]+);(base64),(.*)$/) || [];
      resolve({ name: file.name || 'screenshot.png', size: file.size || data.length,
                media_type: media_type || 'image/jpeg', data: data || '', dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

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
  const [images, setImages] = useState([]);             // [{name,size,media_type,data,dataUrl}]
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
        // resize with sane bounds: min usable, max the viewport (can't drag off-screen)
        const maxW = (window.innerWidth || 1280) - 24;
        const maxH = (window.innerHeight || 800) - 24;
        setBox((b) => ({ ...b, max: false,
          w: Math.max(300, Math.min(maxW, d.ow + e.clientX - d.sx)),
          h: Math.max(260, Math.min(maxH, d.oh + e.clientY - d.sy)) }));
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

  // route by type: image/* → downscaled vision attachment; else → text discussion file.
  async function addImages(files) {
    const imgs = [...files].filter((f) => f && f.type.startsWith('image/'));
    if (!imgs.length) return false;
    const room = Math.max(0, IMG_MAX_COUNT - images.length);
    const scaled = (await Promise.all(imgs.slice(0, room).map(downscaleImage))).filter(Boolean);
    if (scaled.length) setImages((prev) => [...prev, ...scaled].slice(0, IMG_MAX_COUNT));
    if (imgs.length > room) addMsg({ role: 'analyst', text: `Max ${IMG_MAX_COUNT} images per message — kept the first ${room + images.length}.` });
    return true;
  }
  async function onFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (await addImages(fileList)) return;              // images handled → done
    const f = fileList[0];                              // else: text discussion attachment
    let text = '';
    try { text = (await f.text()).slice(0, 20000); } catch { /* binary/unreadable */ }
    setAttachment({ name: f.name, size: f.size, text });
    addMsg({ role: 'analyst',
      text: `Attached "${f.name}" (${f.size} bytes) to our conversation — I'll reason over it here. A chat attachment is discussion only: it never becomes engine state and never seeds or writes the graph.` });
  }
  // PASTE — Ctrl/Cmd+V of a clipboard screenshot into the panel attaches it (primary path).
  function onPaste(e) {
    const items = [...(e.clipboardData?.items || [])].filter((it) => it.type.startsWith('image/'));
    if (!items.length) return;
    e.preventDefault();
    addImages(items.map((it) => it.getAsFile()).filter(Boolean));
  }
  // MAXIMIZE / restore — one click to a large panel, one click back to the remembered size.
  function toggleMax() {
    setBox((b) => {
      if (b.max) return { ...b, max: false, w: b.pw || DEF.w, h: b.ph || DEF.h, x: b.px ?? b.x, y: b.py ?? b.y };
      const W = (window.innerWidth || 1280), H = (window.innerHeight || 800);
      const w = Math.min(920, W - 48), h = Math.min(H - 48, 820);
      return { ...b, max: true, pw: b.w, ph: b.h, px: b.x, py: b.y,
               w, h, x: Math.max(12, W - w - 24), y: 24 };
    });
  }

  async function send(e) {
    e && e.preventDefault();
    const text = ask.trim();
    if (!text && !attachment && !images.length) return;
    const sentImages = images;                           // request-scoped: this message only
    addMsg({ role: 'user', text: text + (attachment ? `   📎 ${attachment.name}` : ''),
             images: sentImages.map((im) => im.dataUrl) });
    setAsk('');
    setImages([]);                                       // cleared → NOT re-sent on the next ask

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
    try { r = await contract.analyst({ ask: text, attachment, images: sentImages, history: messages }); }
    catch { r = { kind: 'EXPLAIN', explanation: 'The analyst is unavailable right now — try again in a moment.' }; }
    setBusy(false);
    // FAILURE HONESTY: if the answer isn't grounded, name the failing hop from the real reason
    const hop = (r && r.grounded === false && r.reason) ? `  ⚠ failing hop: ${r.reason}` : '';
    addMsg({ role: 'analyst', text: (r.explanation || '(no answer)') + hop,
             route: r.routed_item_type || null, kind: r.kind });
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
    <div className="analyst-panel" style={style} onPaste={onPaste}
         onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
         onDragLeave={() => setDragOver(false)}
         onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}>
      <div className="ap-head" onMouseDown={startMove}>
        <span className="ap-title"><i className="pulse st-running" />Analyst · grounded in live state</span>
        <button className="ap-btn" onClick={toggleMax}
                title={box.max ? 'Restore size' : 'Maximize'} aria-label={box.max ? 'Restore analyst size' : 'Maximize analyst'}>{box.max ? '❐' : '▢'}</button>
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
            {m.images && m.images.length > 0 && (
              <div className="ap-msg-imgs">
                {m.images.map((src, j) => <img key={j} src={src} alt="attached screenshot" className="ap-msg-img" />)}
              </div>
            )}
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
      {images.length > 0 && (
        <div className="ap-thumbs">
          {images.map((im, i) => (
            <div className="ap-thumb" key={i}>
              <img src={im.dataUrl} alt={im.name} />
              <button className="ap-thumb-x" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${im.name}`}>×</button>
            </div>
          ))}
        </div>
      )}

      <form className="ap-ask" onSubmit={send}>
        <label className="ap-attachbtn" title="Attach image(s) to discuss (paste, drop, or click)">📎
          <input type="file" accept="image/*" multiple onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
                 style={{ display: 'none' }} aria-label="Attach image(s) to discuss" />
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
