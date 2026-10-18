// Parent portal: children's results and report cards, school results, fees with M-Pesa, meetings.
import { sb, q, fn, esc, ksh, r1, avg, toast, head, opt, stat, fmtD, fmtDT, today, modal, closeModal, setModalBody, lvPill, bars, lineChart, first, empty, normalizePhone, showPhone } from '../lib.js';
import { S, ACT, FORM, CHG, nameOf, className, refresh, go, hasFeature } from '../state.js';
import { announcementsCard, meetingRow, toEAT } from './common.js';
import { learnerResults, reportCard } from './learner.js';

async function kids() {
  if (!S.kids) S.kids = await q(sb.from('students').select('*').order('full_name'));
  return S.kids;
}
async function kid(p) {
  const k = await kids(); if (!k.length) return null;
  const id = p.child || S.child; const c = k.find((x) => x.id === id) || k[0]; S.child = c.id; return c;
}
const switcher = (k, c, view) => k.length > 1 ? `<div class="seg" role="group" aria-label="Choose child">${k.map((x) => `<button class="plain ${x.id === c.id ? 'on' : ''}" data-a="child" data-id="${x.id}" data-v="${view}">${esc(first(x.full_name))}</button>`).join('')}</div>` : '';
ACT.child = (a) => { S.child = a.dataset.id; go(a.dataset.v, { child: a.dataset.id }); };
const noKids = () => empty('No children are linked to your account yet. Ask the school office to link you.');

/* ---------------- HOME ---------------- */
const home = {
  label: 'Home', icon: 'home',
  async render(p) {
    const k = await kids(); const c = await kid(p); if (!c) return head(esc(S.school.name), `Welcome, ${esc(S.me.full_name)}`) + noKids();
    const [{ exams, marks }, rates, bal, meets] = await Promise.all([
      learnerResults(c), q(sb.rpc('attendance_rates', { p_days: 20 })), q(sb.from('student_balances').select('*').eq('student_id', c.id).maybeSingle()),
      q(sb.from('meetings').select('*').eq('parent_id', S.me.id).in('status', ['requested', 'confirmed']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(3)),
    ]);
    const last = exams[exams.length - 1]; const a = last ? avg(marks.filter((m) => m.exam_id === last.id).map((m) => m.score)) : null;
    const r = rates.find((x) => x.student_id === c.id);
    let chart = '<p class="muted">No results released yet.</p>';
    if (last) { const rc = await reportCard(c, last, marks); chart = rc.html; }
    return head(esc(S.school.name), `Welcome, ${esc(S.me.full_name)}`, `Following ${k.map((x) => esc(first(x.full_name))).join(' and ')}.`, switcher(k, c, 'home')) +
    `<div class="stats">${stat(esc(first(c.full_name)) + "'s average", last ? `${r1(a)} ${lvPill(a)}` : '–', last ? esc(last.name) : '')}${stat('Attendance', r ? r.rate + '%' : '–', r ? `${r.present} of ${r.total} days` : 'not recorded yet', r?.rate ?? null)}${stat('Fee balance', bal && bal.balance > 0 ? ksh(bal.balance) : 'Cleared', bal && bal.balance > 0 ? 'tap Fees to pay by M-Pesa' : 'thank you', bal && bal.charged ? (bal.paid / bal.charged) * 100 : null)}${stat('Next meeting', meets[0] ? fmtD(meets[0].starts_at) : 'None', meets[0] ? esc(nameOf(meets[0].teacher_id)) : '')}</div>
    ${optionsCard(c)}
    <div class="g2"><div class="card"><header><h2>${esc(first(c.full_name))}'s latest results</h2><button class="btn sm ghost" data-a="go" data-v="results">Report card</button></header>${chart}</div>${await announcementsCard(4)}</div>`;
  },
};

/* ---------------- OPTIONAL FEATURES (parental consent) ---------------- */
function optionsCard(c) {
  const sc = S.school; if (!sc.learner_chat && !sc.learner_ai) return '';
  const nm = esc(first(c.full_name));
  return `<form class="card" data-f="child-options"><input type="hidden" name="id" value="${c.id}"><header><h2>What ${nm} can use</h2></header>
  <p class="small">These are off until you allow them. You can change your mind at any time here. See the <a href="#/privacy">Privacy notice</a> for details.</p>
  ${sc.learner_chat ? `<label class="f check"><input type="checkbox" name="chat" ${c.allow_chat ? 'checked' : ''}> <span><b>Messages</b>: ${nm} can chat with classmates and teachers. Chats are private but kept by the school for 12 months, and ${nm} can report anything upsetting.</span></label>` : ''}
  ${sc.learner_ai && hasFeature('ai') ? `<label class="f check"><input type="checkbox" name="ai" ${c.allow_ai ? 'checked' : ''}> <span><b>Mwalimu AI</b>: ${nm} can ask an AI tutor for help. Questions are sent to an AI service (Anthropic, in the United States) without ${nm}'s name. Answers can be wrong.</span></label>` : ''}
  <div><button class="btn ghost">Save choices for ${nm}</button></div></form>`;
}
FORM['child-options'] = async (d) => {
  await q(sb.rpc('set_child_options', { p_student: d.id, p_chat: !!d.chat, p_ai: !!d.ai }));
  S.kids = null; toast('Saved');
};

/* ---------------- RESULTS ---------------- */
const results = {
  label: 'Results', icon: 'chart',
  async render(p) {
    const k = await kids(); const c = await kid(p); if (!c) return head('Results', 'Results') + noKids();
    const { exams, marks } = await learnerResults(c);
    if (!exams.length) return head('Results', 'Results', '', switcher(k, c, 'results')) + empty('No results have been released yet.');
    const ex = exams.find((e) => e.id === p.exam) || exams[exams.length - 1];
    const [rc, school] = await Promise.all([reportCard(c, ex, marks), q(sb.rpc('school_exam_summary', { p_exam: ex.id }))]);
    const sm = avg(school.map((x) => x.mean));
    return head('Results', `${esc(first(c.full_name))}'s report card`, 'Results appear once the school releases them.', switcher(k, c, 'results') + `<select data-c="pr-exam" aria-label="Exam">${exams.map((e) => opt(e.id, e.name, ex.id)).join('')}</select><button class="btn ghost" data-a="print">Print</button>`) +
    `<div class="card">${rc.html}</div>
    <div class="g2"><div class="card"><header><h2>Progress through the year</h2></header>${lineChart(exams.map((e) => ({ label: e.name, value: avg(marks.filter((m) => m.exam_id === e.id).map((m) => m.score)) })))}</div>
    <div class="card"><header><h2>School results · ${esc(ex.name)}</h2></header>${bars(school.map((x) => ({ label: x.class_name.replace(/^Grade\s*/, 'G'), value: x.mean })))}<p class="muted small">Mean score for each class across all learning areas. School mean <b class="num">${r1(sm)}</b>.</p></div></div>`;
  },
};
CHG['pr-exam'] = (e) => go('results', { ...S.params, exam: e.value });

/* ---------------- FEES ---------------- */
const feesView = {
  label: 'Fees', icon: 'money',
  async render(p) {
    const k = await kids(); const c = await kid(p); if (!c) return head('Fees', 'Fees') + noKids();
    const [bal, ch, pay, pend] = await Promise.all([
      q(sb.from('student_balances').select('*').eq('student_id', c.id).maybeSingle()),
      q(sb.from('fee_charges').select('*').eq('student_id', c.id)), q(sb.from('payments').select('*').eq('student_id', c.id)),
      q(sb.from('mpesa_requests').select('*').eq('student_id', c.id).eq('status', 'pending').gte('created_at', new Date(Date.now() - 10 * 60e3).toISOString())),
    ]);
    const b = bal || { charged: 0, paid: 0, balance: 0, this_term: 0 };
    const rows = [...ch.map((x) => ({ d: x.created_at, t: x.description, a: x.amount })), ...pay.map((x) => ({ d: x.paid_at, t: `Payment · ${x.method} ${x.mpesa_receipt || x.reference || ''}`, a: -x.amount }))].sort((a, b2) => String(a.d).localeCompare(String(b2.d)));
    let run = 0;
    return head('Fees', `Fees for ${esc(first(c.full_name))}`, `Admission number <b class="mono">${esc(c.adm_no)}</b>`, switcher(k, c, 'fees')) +
    `<div class="stats">${stat('This term', ksh(b.this_term))}${stat('Paid so far', ksh(b.paid), '', b.charged ? (b.paid / b.charged) * 100 : null)}${stat('Balance', b.balance > 0 ? ksh(b.balance) : 'Cleared', b.balance < 0 ? `credit of ${ksh(-b.balance)}` : '')}</div>
    <div class="g2"><div class="card"><header><h2>Pay with M-Pesa</h2></header>
      <form class="form" data-f="stk"><input type="hidden" name="student_id" value="${c.id}"><label class="f">Safaricom number<input name="phone" type="tel" required value="${esc(showPhone(S.me.phone))}" placeholder="07xx xxx xxx"></label><label class="f">Amount (KSh)<input name="amount" type="number" min="1" required value="${Math.max(0, Math.round(b.balance)) || ''}"></label><div><button class="btn good">Send M-Pesa prompt</button></div></form>
      <div id="stk-status">${pend.length ? '<p class="note">A payment prompt is waiting on your phone. Enter your M-Pesa PIN to finish.</p>' : ''}</div>
      ${S.school.paybill ? `<p class="small">Or pay yourself: M-Pesa → Lipa na M-Pesa → Pay Bill → Business number <b class="mono sel">${esc(S.school.paybill)}</b> → Account number <b class="mono sel">${esc(c.adm_no)}</b>.</p>` : ''}
      <p class="muted small">Your payment shows here as soon as M-Pesa confirms it, usually within a minute.</p></div>
    <div class="card"><header><h2>Statement</h2></header><div class="tw"><table><thead><tr><th>Date</th><th>Item</th><th class="r">Amount</th><th class="r">Balance</th></tr></thead><tbody>${rows.map((r) => { run += r.a; return `<tr><td>${fmtD(r.d)}</td><td>${esc(r.t)}</td><td class="r num" ${r.a < 0 ? 'style="color:var(--good)"' : ''}>${r.a < 0 ? '−' : ''}${ksh(Math.abs(r.a))}</td><td class="r num">${ksh(run)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">Nothing billed yet.</td></tr>'}</tbody></table></div></div></div>`;
  },
};
FORM.stk = async (d) => {
  if (!normalizePhone(d.phone)) throw new Error('Enter a Safaricom number like 0712 345 678.');
  const r = await fn('mpesa', { action: 'stk', student_id: d.student_id, phone: d.phone, amount: +d.amount });
  const box = document.getElementById('stk-status');
  box.innerHTML = `<p class="note"><span class="thinking"><i></i><i></i><i></i></span> ${esc(r.message)}</p>`;
  const started = Date.now();
  const poll = async () => {
    if (!document.getElementById('stk-status')) return;
    const s = await fn('mpesa', { action: 'status', checkout_request_id: r.checkout_request_id }).catch(() => null);
    if (s?.status === 'paid') { toast(`Payment received. M-Pesa receipt ${s.receipt}.`); refresh(); return; }
    if (s?.status === 'failed') { box.innerHTML = `<p class="note bad">The payment did not go through: ${esc(s.result || 'cancelled')}. You can try again.</p>`; return; }
    if (Date.now() - started > 120e3) { box.innerHTML = '<p class="note">Still waiting for M-Pesa. If you paid, it will appear on your statement shortly.</p>'; return; }
    setTimeout(poll, 4000);
  };
  setTimeout(poll, 5000);
  return false;
};

/* ---------------- MEETINGS ---------------- */
const meetings = {
  label: 'Meetings', icon: 'video',
  async render() {
    const k = await kids();
    const [mine, ta] = await Promise.all([
      q(sb.from('meetings').select('*').eq('parent_id', S.me.id).order('starts_at', { ascending: false }).limit(60)),
      q(sb.from('teaching_assignments').select('teacher_id, class_id, subject_id').in('class_id', k.map((x) => x.class_id).filter(Boolean).concat(['00000000-0000-0000-0000-000000000000']))),
    ]);
    const names = new Map(k.map((x) => [x.id, x.full_name])); mine.forEach((m) => (m.student_name = names.get(m.student_id)));
    const teacherIds = new Set(ta.map((t) => t.teacher_id)); S.classes.filter((c) => k.some((x) => x.class_id === c.id) && c.class_teacher).forEach((c) => teacherIds.add(c.class_teacher));
    [...S.names.values()].filter((p) => ['principal', 'deputy_principal', 'head_teacher'].includes(p.role)).forEach((p) => teacherIds.add(p.id));
    const label = (id) => { const subs = ta.filter((t) => t.teacher_id === id).map((t) => S.subjects.find((s) => s.id === t.subject_id)?.short).filter(Boolean); const role = S.names.get(id)?.role; return `${nameOf(id)} · ${subs.length ? [...new Set(subs)].join(', ') : role === 'teacher' ? 'Class teacher' : (role || '').replace('_', ' ')}`; };
    const up = mine.filter((m) => ['requested', 'confirmed'].includes(m.status) && new Date(m.starts_at) > new Date(Date.now() - 3 * 3600e3)).reverse();
    return head('Meetings', 'Meetings with teachers', `Join from your phone browser. Choose an audio call if your data bundle is low.${hasFeature('video') ? '' : ' Video calls are part of the Premium plan; audio calls and SMS still work.'}`) +
    `<div class="card"><header><h2>Upcoming</h2></header><div class="list">${up.map((m) => meetingRow(m, 'parent')).join('') || '<p class="muted">No meetings booked.</p>'}</div></div>
    ${k.length ? `<div class="card"><header><h2>Request a meeting</h2></header><form class="form" data-f="req-meeting"><label class="f grow2">Teacher<select name="teacher_id" required>${[...teacherIds].map((id) => opt(id, label(id))).join('')}</select></label><label class="f">About<select name="student_id">${k.map((x) => opt(x.id, x.full_name, S.child)).join('')}</select></label><label class="f">Preferred date<input type="date" name="date" required min="${today()}"></label><label class="f">Time<input type="time" name="time" required value="16:00"></label><label class="f">Call<select name="mode">${opt('audio', 'Audio call (less data)')}${opt('video', 'Video call')}</select></label><label class="f grow2">Topic<input name="topic" required maxlength="120" placeholder="e.g. Help with Mathematics"></label><div><button class="btn">Send request</button></div></form></div>` : ''}
    ${mine.filter((m) => !up.includes(m)).length ? `<div class="card"><header><h2>Past</h2></header><div class="list">${mine.filter((m) => !up.includes(m)).slice(0, 10).map((m) => meetingRow(m, 'parent')).join('')}</div></div>` : ''}`;
  },
};
FORM['req-meeting'] = async (d) => {
  await q(sb.from('meetings').insert({ school_id: S.me.school_id, teacher_id: d.teacher_id, parent_id: S.me.id, student_id: d.student_id, starts_at: toEAT(d.date, d.time), mode: d.mode, topic: d.topic, status: 'requested', created_by: S.me.id }));
  toast('Request sent. You will see a Join button once the teacher confirms.');
};

export const parentViews = { home, results, fees: feesView, meetings };
