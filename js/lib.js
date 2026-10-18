// Shared helpers for the ShuleHub web app.
// supabase-js is served from /vendor (self-hosted), so no third-party CDN sees our visitors.
export const CONFIG = window.SHULEHUB_CONFIG || {};
export const configured = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && !/YOUR_/.test(CONFIG.supabaseUrl + CONFIG.supabaseAnonKey) && window.supabase);
export const sb = configured ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;

/* ---------- data access ---------- */
export function friendly(error) {
  const m = error?.message || String(error);
  if (/row-level security|permission denied/i.test(m)) return "Your role does not allow this. Ask your principal if you need access.";
  if (/duplicate key|unique/i.test(m)) return "That already exists.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "No connection. Check your internet and try again.";
  if (/JWT|expired/i.test(m)) return "Your session has expired. Please sign in again.";
  return m;
}
/** Await a Supabase query; throw a readable error. */
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(friendly(error));
  return data;
}
/** Call a ShuleHub server function. */
export async function fn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* keep msg */ }
    if (/Failed to send a request/i.test(msg)) msg = `The ${name} service is not reachable. Has it been deployed?`;
    throw new Error(msg);
  }
  return data;
}

/* ---------- sign-in identities (must match supabase/functions/_shared/util.ts) ---------- */
export function normalizePhone(input) {
  const d = String(input ?? '').replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(d)) return '254' + d.slice(1);
  if (/^254[17]\d{8}$/.test(d)) return d;
  return null;
}
export function loginEmail(identifier, schoolCode) {
  const id = String(identifier).trim();
  if (id.includes('@')) return id.toLowerCase();
  const ph = normalizePhone(id);
  if (ph) return `${ph}@phone.shulehub.app`;
  if (!schoolCode) return null;
  return `${id.toLowerCase().replace(/[^a-z0-9]/g, '')}.${String(schoolCode).toLowerCase().trim()}@learner.shulehub.app`;
}
export const showPhone = (p) => (p && /^254\d{9}$/.test(p) ? '0' + p.slice(3, 6) + ' ' + p.slice(6, 9) + ' ' + p.slice(9) : p || '');

/* ---------- formatting ---------- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ksh = (n) => 'KSh ' + Math.round(Number(n) || 0).toLocaleString('en-KE');
export const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
export const avg = (a) => { const xs = a.filter((v) => v !== null && v !== undefined && v !== '' && !isNaN(v)).map(Number); return xs.length ? sum(xs) / xs.length : null; };
export const r1 = (v) => (v === null || v === undefined || isNaN(v) ? '–' : Math.round(Number(v)));
export const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);   // Nairobi date
export const fmtD = (d) => { if (!d) return ''; const x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); return isNaN(x) ? d : x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
export const fmtDT = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtT = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const dParts = (d) => { const x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); return { day: x.getDate(), mon: x.toLocaleDateString('en-GB', { month: 'short' }) }; };
export const initials = (n) => String(n || '?').replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const first = (n) => String(n || '').replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(' ')[0];

export const ROLE_LABEL = { super_admin: 'ShuleHub owner', director: 'Director', principal: 'Principal', deputy_principal: 'Deputy Principal', head_teacher: 'Head Teacher', bursar: 'Bursar', teacher: 'Teacher', student: 'Learner', parent: 'Parent' };
export const LEADER_ROLES = ['director', 'principal', 'deputy_principal', 'head_teacher', 'bursar'];
export const STAFF_ROLES = [...LEADER_ROLES, 'teacher'];
export const PERMS = [['dashboard', 'See school dashboard'], ['learners', 'Admit and manage learners'], ['staff', 'Manage staff and roles'], ['fees', 'See fees and balances'], ['payments', 'Record fee payments'], ['results', 'Create exams, approve and publish results'], ['announce', 'Send announcements and SMS'], ['calendar', 'Edit the school calendar'], ['settings', 'Classes, subjects, terms and M-Pesa settings'], ['welfare', 'Review reported chats and all meetings']];

/* ---------- CBE performance levels ---------- */
export const LEVEL = (s) => (s === null || s === undefined || s === '' || isNaN(s) ? null : s >= 75 ? 'EE' : s >= 50 ? 'ME' : s >= 25 ? 'AE' : 'BE');
export const LEVEL_NAME = { EE: 'Exceeding expectations', ME: 'Meeting expectations', AE: 'Approaching expectations', BE: 'Below expectations' };
const TONE = { EE: 'good', ME: 'info', AE: 'warn', BE: 'bad' };
export const lvPill = (s) => { const l = LEVEL(s); return l ? `<span class="pill lv ${TONE[l]}" title="${LEVEL_NAME[l]}">${l}</span>` : '<span class="pill lv">–</span>'; };

/* ---------- small UI bits ---------- */
export const opt = (v, l, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`;
export const stat = (k, v, s = '', m = null) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}${m !== null && !isNaN(m) ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, m))}%"></i></div>` : ''}</div>`;
export const head = (eyebrow, title, sub = '', right = '') => `<div class="ph"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="row">${right}</div>` : ''}</div>`;
export const dateChip = (d) => { const p = dParts(d); return `<div class="date-chip"><b>${p.day}</b><small>${p.mon}</small></div>`; };
export const empty = (t, action = '') => `<div class="empty"><p>${t}</p>${action}</div>`;

export function toast(msg, tone = '') {
  const t = document.getElementById('toast');
  // Errors are announced immediately by screen readers; other messages politely.
  t.setAttribute('role', tone === 'bad' ? 'alert' : 'status'); t.setAttribute('aria-live', tone === 'bad' ? 'assertive' : 'polite');
  t.textContent = msg; t.className = tone; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), tone === 'bad' ? 6000 : 3500);
}

/* ---------- modal ---------- */
let modalClose = null; let modalReturn = null;
export function modal(title, html, { wide = false, onClose } = {}) {
  const ret = document.getElementById('overlay') ? modalReturn : document.activeElement;
  closeModal(true); modalReturn = ret;
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'overlay';
  o.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mtitle"><div class="row" style="justify-content:space-between"><h2 id="mtitle">${title}</h2><button class="btn sm ghost" data-a="close-modal" aria-label="Close dialog">Close</button></div><div class="mbody">${html}</div></div>`;
  o.addEventListener('click', (e) => { if (e.target === o) closeModal(); });
  // Keep Tab and Shift+Tab inside the dialog while it is open.
  o.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  document.querySelector('.app')?.setAttribute('inert', '');
  document.body.appendChild(o);
  modalClose = onClose || null;
  (o.querySelector('.mbody input:not([type=hidden]),.mbody select,.mbody textarea,.mbody button') || o.querySelector('[data-a=close-modal]'))?.focus();
  return o.querySelector('.mbody');
}
export function closeModal(keepFocus = false) {
  const o = document.getElementById('overlay'); if (!o) return;
  o.remove(); document.querySelector('.app')?.removeAttribute('inert');
  const f = modalClose; modalClose = null; f?.();
  if (!keepFocus && modalReturn && document.body.contains(modalReturn)) modalReturn.focus();
  if (!keepFocus) modalReturn = null;
}
export function setModalBody(html) { const b = document.querySelector('#overlay .mbody'); if (b) b.innerHTML = html; }

/** Show one-time sign-in details to hand over. */
export function credsBlock(list) {
  return `<p class="note">Share these sign-in details privately. The password works once; the person chooses their own at first sign-in.${CONFIG.appUrl ? ` Website: <b>${esc(CONFIG.appUrl)}</b>` : ''}</p>
  <div class="tw"><table><thead><tr><th>Who</th><th>Sign in with</th><th>School code</th><th>Temporary password</th></tr></thead><tbody>${list.map((c) => `<tr><td>${esc(c.who)}</td><td class="mono sel">${esc(c.login)}</td><td class="mono">${esc(c.school_code || '–')}</td><td class="mono sel">${c.password ? esc(c.password) : '<span class="muted">existing account</span>'}</td></tr>`).join('')}</tbody></table></div>
  ${list.some((c) => c.sms_sent) ? '<p class="muted" style="font-size:.84rem">An SMS with these details was also sent where a phone number was given.</p>' : ''}`;
}

/* ---------- charts (SVG, drawn to scale) ---------- */
export function bars(items, { max = 100, h = 200, fmt = (v) => Math.round(v) } = {}) {
  const W = Math.max(340, items.length * 70), H = h, pl = 44, pr = 10, pt = 18, pb = 36, iw = W - pl - pr, ih = H - pt - pb, bw = iw / Math.max(1, items.length);
  let g = '';
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => { const t = f * max, y = pt + ih - f * ih; g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text class="tk" x="${pl - 6}" y="${y + 4}" text-anchor="end">${fmt(t)}</text>`; });
  items.forEach((it, i) => {
    const v = Number(it.value) || 0, w = Math.min(44, bw * 0.55), x = pl + i * bw + (bw - w) / 2, y = pt + ih - (Math.min(v, max) / max) * ih;
    g += `<rect class="br" x="${x}" y="${y}" width="${w}" height="${Math.max(0, pt + ih - y)}" rx="4"/>`;
    let top = y;
    if (it.ref !== null && it.ref !== undefined) { const ry = pt + ih - (Math.min(it.ref, max) / max) * ih; top = Math.min(y, ry); g += `<line class="ref" x1="${x - 5}" x2="${x + w + 5}" y1="${ry}" y2="${ry}"/>`; }
    g += `<text class="vl" x="${x + w / 2}" y="${top - 6}" text-anchor="middle">${it.value === null || it.value === undefined ? '–' : fmt(v)}</text><text class="tk" x="${x + w / 2}" y="${H - 14}" text-anchor="middle">${esc(it.label)}</text>`;
  });
  const desc = 'Bar chart. ' + items.map((it) => `${it.label}: ${it.value === null || it.value === undefined ? 'no value' : fmt(Number(it.value))}${it.ref !== null && it.ref !== undefined ? ` (class mean ${fmt(Number(it.ref))})` : ''}`).join('; ') + '.';
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}"><title>${esc(desc)}</title>${g}</svg></div>`;
}
export function lineChart(pts, { max = 100, h = 170 } = {}) {
  const W = Math.max(340, pts.length * 120), H = h, pl = 40, pr = 24, pt = 22, pb = 32, iw = W - pl - pr, ih = H - pt - pb;
  const X = (i) => (pts.length < 2 ? pl + iw / 2 : pl + i * (iw / (pts.length - 1))), Y = (v) => pt + ih - (v / max) * ih;
  let g = '';
  [0, 25, 50, 75, 100].forEach((t) => { g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tk" x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`; });
  const idx = pts.map((p, i) => (p.value === null || p.value === undefined ? null : i)).filter((i) => i !== null);
  if (idx.length) {
    const d = idx.map((i) => `${X(i)},${Y(pts[i].value)}`);
    g += `<polygon class="ar" points="${X(idx[0])},${Y(0)} ${d.join(' ')} ${X(idx[idx.length - 1])},${Y(0)}"/><polyline class="ln" points="${d.join(' ')}"/>`;
    idx.forEach((i, k) => { g += `<circle class="dot" cx="${X(i)}" cy="${Y(pts[i].value)}" r="${k === idx.length - 1 ? 6 : 4.5}"/><text class="vl" x="${X(i)}" y="${Y(pts[i].value) - 11}" text-anchor="middle">${Math.round(pts[i].value)}</text>`; });
  }
  pts.forEach((p, i) => (g += `<text class="tk" x="${X(i)}" y="${H - 10}" text-anchor="middle">${esc(p.label)}</text>`));
  const desc = 'Line chart of averages. ' + pts.map((p) => `${p.label}: ${p.value === null || p.value === undefined ? 'no result' : Math.round(p.value)}`).join('; ') + '.';
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}"><title>${esc(desc)}</title>${g}</svg></div>`;
}

/* ---------- CSV (for bulk learner import) ---------- */
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  if (!rows.length) return [];
  const keys = rows[0].map((k) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  return rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Simple markdown for AI replies: **bold**, `code`, line breaks. */
export const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
