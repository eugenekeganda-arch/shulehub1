// Platform owner: every school, its plan, status, invoices and payments.
import { sb, q, fn, esc, ksh, sum, toast, head, opt, stat, fmtD, modal, closeModal, setModalBody, credsBlock, bars, showPhone } from '../lib.js';
import { S, ACT, FORM, CHG, refresh, confirmAction } from '../state.js';

let cache = null;
async function load() {
  const [schools, plans, billing, counts, stats] = await Promise.all([
    q(sb.from('schools').select('*').order('name')),
    q(sb.from('plans').select('*').order('sort')),
    q(sb.from('school_billing').select('*')),
    q(sb.rpc('learner_counts')),
    q(sb.rpc('platform_stats')),
  ]);
  const bal = new Map(billing.map((b) => [b.school_id, b]));
  const lc = new Map(counts.map((c) => [c.school_id, c.learners]));
  cache = { schools: schools.map((s) => ({ ...s, billing: bal.get(s.id) || { invoiced: 0, paid: 0, balance: 0 }, learners: lc.get(s.id) || 0 })), plans, stats: stats[0] };
  return cache;
}
const statusPill = (s) => `<span class="pill ${s.status === 'active' ? 'good' : s.status === 'trial' ? 'info' : 'bad'}">${s.status}</span>`;
const billPill = (s) => s.status === 'trial' ? '<span class="pill info">Free trial</span>' : s.billing.balance > 0 ? `<span class="pill warn">Owes ${ksh(s.billing.balance)}</span>` : '<span class="pill good">Paid up</span>';
const seen = (t) => t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';
const termLabel = () => { const d = new Date(); const m = d.getMonth() + 1; return `Term ${m <= 4 ? 1 : m <= 8 ? 2 : 3} ${d.getFullYear()}`; };

export const ownerViews = {
  overview: {
    label: 'Overview', icon: 'home',
    async render() {
      const { schools, stats } = await load();
      const months = []; const d = new Date(); for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push([x.toISOString().slice(0, 7), x.toLocaleDateString('en-GB', { month: 'short' })]); }
      const pays = await q(sb.from('platform_payments').select('amount, paid_at').gte('paid_at', months[0][0] + '-01'));
      const rev = months.map(([k, l]) => ({ label: l, value: sum(pays.filter((p) => p.paid_at.startsWith(k)).map((p) => p.amount)) / 1000 }));
      const mx = Math.max(50, Math.ceil(Math.max(...rev.map((r) => r.value)) / 50) * 50);
      const attention = schools.filter((s) => s.status !== 'active' || s.billing.balance > 0);
      return head('Platform', 'Overview', 'All schools on ShuleHub. Schools are billed per term.', `<button class="btn" data-a="go" data-v="schools">Manage schools</button>`) +
      `<div class="stats">${stat('Schools', stats.schools, `${stats.active} active · ${stats.trial} on trial · ${stats.suspended} suspended`)}${stat('Learners', Number(stats.learners).toLocaleString('en-KE'), 'enrolled across all schools')}${stat('Collected', ksh(stats.paid), `of ${ksh(stats.invoiced)} invoiced`, stats.invoiced ? stats.paid / stats.invoiced * 100 : null)}${stat('Outstanding', ksh(Math.max(0, stats.invoiced - stats.paid)), `${schools.filter((s) => s.billing.balance > 0).length} schools owe`)}</div>
      <div class="g2"><div class="card"><header><h2>Payments received</h2><span class="muted small">KSh thousands, last 6 months</span></header>${bars(rev, { max: mx })}</div>
      <div class="card"><header><h2>Needs attention</h2></header>${attention.length ? `<div class="list">${attention.map((s) => `<div class="li"><div class="av">${esc(s.code)}</div><div class="grow"><b>${esc(s.name)}</b><small class="block">${s.status === 'trial' ? 'Trial ends ' + fmtD(s.trial_ends) : s.status === 'suspended' ? 'Suspended' : 'Owes ' + ksh(s.billing.balance)}</small></div><button class="btn sm ghost" data-a="school-open" data-id="${s.id}">Open</button></div>`).join('')}</div>` : '<p class="muted">All schools are active and paid up.</p>'}</div></div>
      <div class="card"><header><h2>Bill schools for a term</h2><span class="muted small">Creates one invoice per active school at its plan price. Running it twice for the same term does nothing.</span></header>
        <form class="form" data-f="bill-schools"><label class="f">Term<input name="term" required value="${termLabel()}"></label><div><button class="btn">Create invoices</button></div></form></div>`;
    },
  },

  schools: {
    label: 'Schools', icon: 'school',
    async render() {
      const { schools, plans } = await load();
      return head('Schools', 'Schools', 'Add a school to create its first administrator. They then add their own staff, learners and parents.') +
      `<div class="card"><div class="tw"><table><thead><tr><th>School</th><th>Plan</th><th class="r">Learners</th><th>Status</th><th>Billing</th><th>Last active</th><th></th></tr></thead><tbody>
      ${schools.map((s) => `<tr><td><b>${esc(s.name)}</b><span class="sub">${esc(s.county || '')} · code <span class="mono">${esc(s.code)}</span></span></td><td>${esc(plans.find((p) => p.id === s.plan_id)?.name)}</td><td class="r num">${s.learners}</td><td>${statusPill(s)}</td><td>${billPill(s)}</td><td>${seen(s.last_active_at)}</td><td class="r"><button class="btn sm ghost" data-a="school-open" data-id="${s.id}">Manage</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No schools yet. Add the first one below.</td></tr>'}
      </tbody></table></div></div>
      <div class="card"><header><h2>Add a school</h2><span class="muted small">New schools get a 30-day free trial with every feature.</span></header>
      <form class="form" data-f="create-school">
        <label class="f grow2">School name<input name="name" required placeholder="e.g. Jacaranda Academy"></label>
        <label class="f">School code<input name="code" required pattern="[A-Za-z0-9]{2,8}" maxlength="8" placeholder="e.g. JAC" style="text-transform:uppercase"><small>Learners type this when they sign in.</small></label>
        <label class="f">County<input name="county" placeholder="e.g. Nairobi"></label>
        <label class="f">Plan<select name="plan_id">${plans.map((p) => opt(p.id, `${p.name} · ${ksh(p.price_per_term)}/term`, 'standard')).join('')}</select></label>
        <label class="f">School phone<input name="phone" type="tel"></label>
        <label class="f">School email<input name="email" type="email"></label>
        <fieldset class="full fs"><legend>First administrator</legend><div class="form">
          <label class="f">Full name<input name="admin_name" required placeholder="e.g. Mrs. Jane Wanjiru"></label>
          <label class="f">Role<select name="admin_role">${opt('principal', 'Principal')}${opt('director', 'Director')}</select></label>
          <label class="f">Email<input name="admin_email" type="email" placeholder="optional if phone given"></label>
          <label class="f">Phone<input name="admin_phone" type="tel" placeholder="07xx xxx xxx"></label></div></fieldset>
        <div><button class="btn">Add school</button></div></form></div>`;
    },
  },

  payments: {
    label: 'Payments', icon: 'receipt',
    async render() {
      const { schools } = cache || await load();
      const pays = await q(sb.from('platform_payments').select('*').order('paid_at', { ascending: false }).limit(300));
      const inv = await q(sb.from('platform_invoices').select('*').order('created_at', { ascending: false }).limit(300));
      const nm = (id) => schools.find((s) => s.id === id)?.name || '';
      return head('Payments', 'Subscription payments', `${pays.length} payments · ${ksh(sum(pays.map((p) => p.amount)))} received.`) +
      `<div class="card"><header><h2>Record a payment</h2></header><form class="form" data-f="plat-pay"><label class="f grow2">School<select name="school_id" required>${schools.map((s) => opt(s.id, `${s.name} (owes ${ksh(Math.max(0, s.billing.balance))})`)).join('')}</select></label><label class="f">Amount (KSh)<input type="number" name="amount" min="1" required></label><label class="f">Term<input name="term_label" value="${termLabel()}"></label><label class="f">Method<select name="method">${opt('M-Pesa', 'M-Pesa')}${opt('Bank', 'Bank transfer')}${opt('Cheque', 'Cheque')}</select></label><label class="f">Reference<input name="reference" placeholder="M-Pesa code or bank ref"></label><label class="f">Date<input type="date" name="paid_at" value="${new Date().toISOString().slice(0, 10)}"></label><div><button class="btn">Save payment</button></div></form></div>
      <div class="g2"><div class="card"><header><h2>Payments</h2></header><div class="tw"><table><thead><tr><th>Date</th><th>School</th><th>Term</th><th>Reference</th><th class="r">Amount</th></tr></thead><tbody>${pays.map((p) => `<tr><td>${fmtD(p.paid_at)}</td><td>${esc(nm(p.school_id))}</td><td>${esc(p.term_label || '')}</td><td class="mono">${esc(p.method)} ${esc(p.reference || '')}</td><td class="r num">${ksh(p.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No payments yet.</td></tr>'}</tbody></table></div></div>
      <div class="card"><header><h2>Invoices</h2></header><div class="tw"><table><thead><tr><th>School</th><th>Term</th><th>Due</th><th class="r">Amount</th></tr></thead><tbody>${inv.map((i) => `<tr><td>${esc(nm(i.school_id))}</td><td>${esc(i.term_label)}</td><td>${fmtD(i.due_date)}</td><td class="r num">${ksh(i.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No invoices yet. Create them from Overview.</td></tr>'}</tbody></table></div></div></div>`;
    },
  },

  plans: {
    label: 'Plans & pricing', icon: 'clip',
    async render() {
      const { plans, schools } = await load();
      const FEAT = [['fees', 'Fees & M-Pesa'], ['marks', 'Marks & report cards'], ['attendance', 'Attendance'], ['sms', 'SMS'], ['portals', 'Parent & learner portals'], ['chat', 'Messaging'], ['quiz', 'Quiz arena'], ['ai', 'Mwalimu AI'], ['video', 'Video meetings']];
      return head('Plans', 'Plans & pricing', 'Prices are per school, per term. Changes apply to the next invoices you create.') +
      `<div class="grid">${plans.map((p) => `<form class="card" data-f="save-plan"><input type="hidden" name="id" value="${p.id}"><header><h2>${esc(p.name)}</h2><span class="pill acc">${schools.filter((s) => s.plan_id === p.id).length} schools</span></header>
        <label class="f">Price per term (KSh)<input type="number" name="price" min="0" step="500" value="${p.price_per_term}"></label>
        <label class="f">Learner limit<input type="number" name="max" min="0" value="${p.max_learners ?? ''}" placeholder="Unlimited"></label>
        <div class="checks">${FEAT.map(([k, l]) => `<label><input type="checkbox" name="f_${k}" ${p.features.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <div><button class="btn ghost">Save ${esc(p.name)}</button></div></form>`).join('')}</div>`;
    },
  },
};

/* ---------------- school detail ---------------- */
async function schoolModalHTML(id) {
  const { schools, plans } = await load();
  const s = schools.find((x) => x.id === id);
  const [admins, pays, inv] = await Promise.all([
    q(sb.from('profiles').select('id, full_name, role, login_id, phone, active').eq('school_id', id).in('role', ['director', 'principal', 'deputy_principal', 'head_teacher', 'bursar'])),
    q(sb.from('platform_payments').select('*').eq('school_id', id).order('paid_at', { ascending: false })),
    q(sb.from('platform_invoices').select('*').eq('school_id', id).order('created_at', { ascending: false })),
  ]);
  return `<div class="row">${statusPill(s)}${billPill(s)}<span class="pill acc">${esc(plans.find((p) => p.id === s.plan_id)?.name)}</span><span class="muted small">code <b class="mono">${esc(s.code)}</b> · ${s.learners} learners · joined ${fmtD(s.created_at)}</span></div>
  <div class="form">
    <label class="f">Plan<select data-c="school-plan" data-id="${s.id}">${plans.map((p) => opt(p.id, `${p.name} · ${ksh(p.price_per_term)}/term`, s.plan_id)).join('')}</select></label>
    ${s.status === 'trial' ? `<label class="f">Trial ends<input type="date" value="${s.trial_ends || ''}" data-c="school-trial" data-id="${s.id}"></label>` : ''}
    <div class="row">${s.status === 'suspended' ? `<button class="btn good" data-a="school-status" data-id="${s.id}" data-s="active">Reactivate</button>` : `<button class="btn danger" data-a="school-status" data-id="${s.id}" data-s="suspended">Suspend access</button>`}${s.status === 'trial' ? `<button class="btn" data-a="school-status" data-id="${s.id}" data-s="active">Convert to paid</button>` : ''}</div>
  </div>
  ${s.status === 'suspended' ? '<p class="note">While suspended, nobody at this school can use ShuleHub. They see a notice to contact the school office. All their data is kept.</p>' : ''}
  <h3>School leaders</h3>
  <div class="tw"><table><tbody>${admins.map((a) => `<tr><td><b>${esc(a.full_name)}</b><span class="sub">${esc(a.role.replace('_', ' '))} · <span class="mono">${esc(a.login_id || '')}</span></span></td><td>${a.active ? '' : '<span class="pill bad">inactive</span>'}</td><td class="r"><button class="btn sm ghost" data-a="owner-reset" data-id="${a.id}" data-name="${esc(a.full_name)}">Reset password</button></td></tr>`).join('') || '<tr><td class="muted">No leaders yet.</td></tr>'}</tbody></table></div>
  <details><summary class="btn sm ghost">Add another leader</summary><form class="form" data-f="owner-add-leader" style="margin-top:10px"><input type="hidden" name="school_id" value="${s.id}"><label class="f">Full name<input name="full_name" required></label><label class="f">Role<select name="role">${['director', 'principal', 'deputy_principal', 'head_teacher', 'bursar'].map((r) => opt(r, r.replace('_', ' '))).join('')}</select></label><label class="f">Email<input type="email" name="email"></label><label class="f">Phone<input type="tel" name="phone"></label><div><button class="btn">Create account</button></div></form></details>
  <h3>Invoices and payments</h3>
  <p class="muted small">Invoiced ${ksh(s.billing.invoiced)} · paid ${ksh(s.billing.paid)} · balance <b>${ksh(s.billing.balance)}</b>${s.phone ? ` · phone ${esc(showPhone(s.phone))}` : ''}${s.email ? ` · ${esc(s.email)}` : ''}</p>
  <div class="tw"><table><thead><tr><th>Date</th><th>Item</th><th class="r">Amount</th></tr></thead><tbody>${[...inv.map((i) => ({ d: i.created_at, t: 'Invoice · ' + i.term_label, a: i.amount })), ...pays.map((p) => ({ d: p.paid_at, t: `Payment · ${p.method} ${p.reference || ''}`, a: -p.amount }))].sort((a, b) => String(b.d).localeCompare(String(a.d))).map((r) => `<tr><td>${fmtD(r.d)}</td><td>${esc(r.t)}</td><td class="r num" ${r.a < 0 ? 'style="color:var(--good)"' : ''}>${r.a < 0 ? '−' : ''}${ksh(Math.abs(r.a))}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nothing yet.</td></tr>'}</tbody></table></div>
  <p class="small muted">Terms accepted for the school: ${s.terms_accepted_at ? `version ${esc(s.terms_version)} on ${fmtD(s.terms_accepted_at)}` : 'not yet (the director or principal is asked at their next sign-in)'}.</p>
  <h3>End of contract</h3>
  <p class="small">When a school leaves, give it time to download its data (Setup → Your school's data), then delete it here. This removes every account and record for the school.</p>
  <div><button class="btn danger" data-a="school-delete" data-id="${s.id}" data-code="${esc(s.code)}" data-name="${esc(s.name)}">Delete school and all its data</button></div>`;
}
ACT['school-open'] = async (a) => {
  const s = cache?.schools.find((x) => x.id === a.dataset.id);
  modal(esc(s?.name || 'School'), '<div class="loading"><span class="thinking"><i></i><i></i><i></i></span></div>', { wide: true });
  setModalBody(await schoolModalHTML(a.dataset.id));
  S.params.openSchool = a.dataset.id;
};
async function reopen(id) { setModalBody(await schoolModalHTML(id)); refresh(); }
ACT['school-status'] = async (a) => {
  const patch = { status: a.dataset.s }; if (a.dataset.s === 'active') patch.trial_ends = null;
  await q(sb.from('schools').update(patch).eq('id', a.dataset.id));
  toast(a.dataset.s === 'suspended' ? 'School suspended' : 'School is active'); reopen(a.dataset.id);
};
CHG['school-plan'] = async (e) => { await q(sb.from('schools').update({ plan_id: e.value }).eq('id', e.dataset.id)); toast('Plan changed'); reopen(e.dataset.id); };
CHG['school-trial'] = async (e) => { await q(sb.from('schools').update({ trial_ends: e.value }).eq('id', e.dataset.id)); toast('Trial end date saved'); };
ACT['school-delete'] = (a) => confirmAction({
  title: `Delete ${esc(a.dataset.name)}?`,
  body: `<p>This permanently deletes the school, every account at it and all of its records. It cannot be undone.</p><label class="f" for="del-code">Type the school code <b class="mono">${esc(a.dataset.code)}</b> to confirm<input id="del-code" name="code" autocomplete="off"></label>`,
  confirmLabel: 'Delete school permanently',
  onConfirm: async (x) => { const r = await fn('manage-users', { action: 'delete_school', school_id: a.dataset.id, confirm_code: x.code }); closeModal(); toast(`School deleted with ${r.accounts_removed} accounts.`); refresh(); },
});
ACT['owner-reset'] = async (a) => {
  const r = await fn('manage-users', { action: 'reset_password', user_id: a.dataset.id });
  modal('New temporary password', credsBlock([{ who: a.dataset.name, login: r.login, password: r.password }]));
};
FORM['owner-add-leader'] = async (d) => {
  const r = await fn('manage-users', { action: 'create_staff', school_id: d.school_id, full_name: d.full_name, role: d.role, email: d.email, phone: d.phone });
  modal('Leader account created', credsBlock([{ who: d.full_name, ...r }])); return false;
};
FORM['create-school'] = async (d) => {
  const r = await fn('manage-users', { action: 'create_school', name: d.name, code: d.code, county: d.county, plan_id: d.plan_id, phone: d.phone, email: d.email,
    admin: { full_name: d.admin_name, role: d.admin_role, email: d.admin_email, phone: d.admin_phone } });
  modal(`${esc(r.school.name)} is on ShuleHub`, `<p>Give these details to <b>${esc(d.admin_name)}</b>. They can then add staff, classes, learners and parents.</p>${credsBlock([{ who: d.admin_name, ...r.admin }])}`);
};
FORM['bill-schools'] = async (d) => { const n = await q(sb.rpc('bill_schools', { p_term_label: d.term.trim() })); toast(n ? `${n} invoice${n > 1 ? 's' : ''} created for ${d.term}` : 'Every active school already has an invoice for that term.'); };
FORM['plat-pay'] = async (d) => {
  await q(sb.from('platform_payments').insert({ school_id: d.school_id, amount: +d.amount, term_label: d.term_label || null, method: d.method, reference: d.reference || null, paid_at: d.paid_at, recorded_by: S.me.id }));
  toast('Payment recorded');
};
FORM['save-plan'] = async (d) => {
  const features = Object.keys(d).filter((k) => k.startsWith('f_')).map((k) => k.slice(2));
  await q(sb.from('plans').update({ price_per_term: +d.price, max_learners: d.max ? +d.max : null, features }).eq('id', d.id));
  toast('Plan saved'); return false;
};
