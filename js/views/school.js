// School leadership: director, principal, deputy, head teacher, bursar.
// Each page is shown only to roles with the matching permission.
import { sb, q, fn, esc, ksh, sum, avg, r1, toast, head, opt, stat, fmtD, fmtDT, today, modal, closeModal, setModalBody, credsBlock, bars, lvPill, parseCSV, showPhone, PERMS, ROLE_LABEL, STAFF_ROLES, LEADER_ROLES, initials, empty } from '../lib.js';
import { S, ACT, FORM, CHG, can, nameOf, className, currentTerm, refresh, reloadLookups, go, confirmAction } from '../state.js';
import { announcementsCard, meetingRow } from './common.js';

const termOpts = (sel) => S.terms.map((t) => opt(t.id, t.name + (t.is_current ? ' (current)' : ''), sel)).join('');
const classOpts = (sel, all = true) => (all ? opt('all', 'All classes', sel) : '') + S.classes.map((c) => opt(c.id, c.name, sel)).join('');

/* =============================== DASHBOARD =============================== */
const dashboard = {
  label: 'Dashboard', icon: 'home', perm: 'dashboard',
  async render() {
    const t = today();
    const [students, staff, att, rates] = await Promise.all([
      q(sb.from('students').select('id, full_name, class_id').eq('active', true)),
      q(sb.from('profiles').select('id', { count: 'exact' }).in('role', STAFF_ROLES).eq('active', true)),
      q(sb.from('attendance').select('status').eq('day', t)),
      q(sb.rpc('attendance_rates', { p_days: 20 })),
    ]);
    const setup = [[S.terms.length, 'Add the current term', 'setup'], [S.classes.length, 'Add your classes and streams', 'setup'], [staff.length > 1, 'Add staff accounts', 'staff'], [students.length, 'Admit learners and their parents', 'learners']];
    const needsSetup = setup.some((s) => !s[0]);
    let feeCard = '', feeStat = '';
    if (can('fees')) {
      const bal = await q(sb.from('student_balances').select('*'));
      const charged = sum(bal.map((b) => b.charged)), paid = sum(bal.map((b) => b.paid));
      feeStat = stat('Fees collected', charged ? Math.round(paid / charged * 100) + '%' : '–', `${ksh(paid)} of ${ksh(charged)} billed`, charged ? paid / charged * 100 : null);
      const top = bal.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 6);
      feeCard = `<div class="card"><header><h2>Largest balances</h2><button class="btn sm ghost" data-a="go" data-v="fees">All fees</button></header>${top.length ? `<div class="tw"><table><tbody>${top.map((b) => `<tr><td><b>${esc(b.full_name)}</b><span class="sub">${esc(className(b.class_id))} · ${esc(b.adm_no)}</span></td><td class="r num">${ksh(b.balance)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No outstanding balances.</p>'}</div>`;
    }
    const present = att.filter((a) => a.status !== 'A').length;
    const low = rates.filter((r) => r.total >= 5 && r.rate < 85).sort((a, b) => a.rate - b.rate);
    const byId = new Map(students.map((s) => [s.id, s]));
    const draft = (await q(sb.from('exams').select('id, name').eq('status', 'draft').order('created_at', { ascending: false }).limit(1)))[0];
    let subStat = '';
    if (draft) { const subs = await q(sb.from('mark_submissions').select('class_id', { count: 'exact' }).eq('exam_id', draft.id)); const need = (await q(sb.from('teaching_assignments').select('class_id, subject_id'))).length; subStat = stat(esc(draft.name), `${subs.length}/${need || '–'}`, 'class-subject mark sets submitted', need ? subs.length / need * 100 : null); }
    return head(esc(S.school.name), `Hello, ${esc(S.me.full_name.split(' ').slice(0, 2).join(' '))}`, `${ROLE_LABEL[S.me.role]} · ${esc(currentTerm()?.name || 'no current term set')}`) +
      (needsSetup ? `<div class="card accent"><header><h2>Getting started</h2></header><div class="list">${setup.map(([done, label, v]) => `<div class="li"><span class="tick ${done ? 'on' : ''}">${done ? '✓' : ''}</span><div class="grow">${label}</div>${done ? '' : `<button class="btn sm" data-a="go" data-v="${v}">Do this</button>`}</div>`).join('')}</div></div>` : '') +
      `<div class="stats">${stat('Learners', students.length, `${S.classes.length} classes`)}${stat('Staff', staff.length)}${feeStat}${stat('Present today', att.length ? `${present}/${att.length}` : '–', att.length ? 'marked so far' : 'register not taken yet', att.length ? present / att.length * 100 : null)}${subStat}</div>
      <div class="g2">${feeCard || '<div></div>'}<div class="card"><header><h2>Attendance alerts</h2><span class="pill ${low.length ? 'warn' : 'good'}">${low.length} below 85%</span></header>${low.length ? `<div class="list">${low.slice(0, 8).map((r) => { const s = byId.get(r.student_id); return s ? `<div class="li"><div class="av">${initials(s.full_name)}</div><div class="grow"><b>${esc(s.full_name)}</b><small class="block">${esc(className(s.class_id))} · ${r.present}/${r.total} days</small></div><span class="num">${r.rate}%</span></div>` : ''; }).join('')}</div>` : '<p class="muted">Everyone is at 85% or above over the last 20 days.</p>'}</div></div>
      ${await announcementsCard(3)}`;
  },
};

/* =============================== LEARNERS =============================== */
const learners = {
  label: 'Learners', icon: 'users', perm: 'learners',
  async render(p) {
    const cls = p.cls || 'all', term = (p.search || '').toLowerCase();
    let qy = sb.from('students').select('*').order('full_name');
    if (cls !== 'all') qy = qy.eq('class_id', cls);
    if (!p.inactive) qy = qy.eq('active', true);
    const [rows, guards, rates, bal] = await Promise.all([qy, sb.from('guardians').select('student_id, parent_id, relationship'), sb.rpc('attendance_rates', { p_days: 20 }), can('fees') ? sb.from('student_balances').select('student_id, balance') : Promise.resolve({ data: [] })].map(q));
    const g = new Map(); guards.forEach((x) => { if (!g.has(x.student_id)) g.set(x.student_id, []); g.get(x.student_id).push(x); });
    const rate = new Map(rates.map((r) => [r.student_id, r])); const bl = new Map(bal.map((b) => [b.student_id, b.balance]));
    const list = rows.filter((s) => !term || s.full_name.toLowerCase().includes(term) || s.adm_no.toLowerCase().includes(term));
    if (!S.classes.length) return head('Learners', 'Learners') + empty('Add your classes first, then admit learners into them.', `<button class="btn" data-a="go" data-v="setup">Set up classes</button>`);
    return head('Learners', 'Learners', `${rows.length} learner${rows.length === 1 ? '' : 's'}${cls !== 'all' ? ' in ' + esc(className(cls)) : ''}. Admission numbers are what learners sign in with, together with the school code <b class="mono">${esc(S.school.code)}</b>.`,
      `<select data-c="lrn-cls" aria-label="Class">${classOpts(cls)}</select><input type="search" data-c="lrn-search" placeholder="Search name or adm. no." value="${esc(p.search || '')}" aria-label="Search learners"><label class="row small"><input type="checkbox" data-c="lrn-inactive" ${p.inactive ? 'checked' : ''}> Show left</label>`) +
    `<div class="card"><div class="tw"><table><thead><tr><th>Learner</th><th>Class</th><th>Parents / guardians</th><th class="r">Attendance</th>${can('fees') ? '<th class="r">Balance</th>' : ''}<th></th></tr></thead><tbody>
    ${list.map((s) => { const r = rate.get(s.id); return `<tr${s.active ? '' : ' class="dim"'}><td><b>${esc(s.full_name)}</b><span class="sub mono">${esc(s.adm_no)}${s.user_id ? '' : ' · no login'}</span>${s.consent_recorded_at ? '' : ' <span class="pill bad">consent not recorded</span>'}</td><td>${esc(className(s.class_id))}</td><td>${(g.get(s.id) || []).map((x) => esc(nameOf(x.parent_id))).join(', ') || '<span class="pill warn">none</span>'}</td><td class="r">${r ? `<span class="pill ${r.rate < 85 ? 'warn' : 'good'}">${r.rate}%</span>` : '<span class="muted">–</span>'}</td>${can('fees') ? `<td class="r num">${bl.get(s.id) > 0 ? ksh(bl.get(s.id)) : bl.has(s.id) ? '<span class="pill good">Clear</span>' : '–'}</td>` : ''}<td class="r"><button class="btn sm ghost" data-a="learner-open" data-id="${s.id}">Open</button></td></tr>`; }).join('') || `<tr><td colspan="6" class="muted">No learners${term ? ' match that search' : ' yet'}.</td></tr>`}
    </tbody></table></div></div>
    <div class="card"><header><h2>Admit a learner</h2><span class="muted small">Creates the learner's login and the parent's login. Both get their details by SMS if a phone is given.</span></header>
    <form class="form" data-f="admit">
      <label class="f grow2">Learner's full name<input name="full_name" required></label>
      <label class="f">Admission number<input name="adm_no" required placeholder="e.g. 2026/0412"></label>
      <label class="f">Class<select name="class_id" required>${classOpts(cls === 'all' ? '' : cls, false)}</select></label>
      <label class="f check"><input type="checkbox" name="learner_login" checked> Give the learner a login</label>
      <fieldset class="full fs"><legend>Parent or guardian</legend><div class="form">
        <label class="f">Full name<input name="p_name" placeholder="e.g. Mrs. Grace Kariuki"></label>
        <label class="f">Phone<input name="p_phone" type="tel" placeholder="07xx xxx xxx"></label>
        <label class="f">Email (optional)<input name="p_email" type="email"></label>
        <label class="f">Relationship<select name="p_rel">${['Mother', 'Father', 'Guardian', 'Grandparent', 'Sponsor'].map((r) => opt(r, r)).join('')}</select></label></div>
        <small class="muted">If this parent already has a child here, use the same phone number and both children appear on one account.</small></fieldset>
      <fieldset class="full fs"><legend>Parent or guardian consent (required)</legend>
        <p class="small">Kenyan law requires a parent or guardian's consent before a child's data is entered. Give the parent the <a href="#/privacy" target="_blank" rel="noopener">Privacy notice<span class="sr-only"> (opens in a new tab)</span></a> and keep their signed form on file.</p>
        <div class="form"><label class="f">How consent was given<select name="consent_method" required>${opt('', 'Choose…')}${['Signed admission form', 'Signed ShuleHub consent form', 'Parent confirmed in person at the school', 'Parent confirmed in writing (email or letter)'].map((m) => opt(m, m)).join('')}</select></label>
        <label class="f check"><input type="checkbox" name="consent" required> A parent or guardian has consented to this learner's data being kept in ShuleHub.</label></div></fieldset>
      <div><button class="btn">Admit learner</button></div></form></div>
    <div class="card"><header><h2>Import many learners</h2></header><p class="muted">Upload a CSV with these columns: <span class="mono">name, adm_no, class, parent_name, parent_phone, parent_email</span>. The class must match a class name exactly, for example "${esc(S.classes[0]?.name || 'Grade 7 East')}". Do not include other details such as gender or date of birth: ShuleHub does not need them.</p>
    <div class="form"><label class="f" for="csv-file">CSV file<input type="file" accept=".csv,text/csv" id="csv-file"></label>
      <label class="f" for="csv-method">How parents gave consent<select id="csv-method">${opt('', 'Choose…')}${['Signed admission form', 'Signed ShuleHub consent form', 'Parent confirmed in person at the school', 'Parent confirmed in writing (email or letter)'].map((m) => opt(m, m)).join('')}</select></label>
      <label class="f check"><input type="checkbox" id="csv-consent"> A parent or guardian of every learner in this file has consented.</label>
      <label class="f check"><input type="checkbox" id="csv-logins" checked> Create learner logins</label>
      <div><button class="btn ghost" data-a="csv-import">Import learners</button></div></div><div id="csv-out" aria-live="polite"></div></div>`;
  },
};
CHG['lrn-cls'] = (e) => go('learners', { ...S.params, cls: e.value });
CHG['lrn-search'] = (e) => go('learners', { ...S.params, search: e.value });
CHG['lrn-inactive'] = (e) => go('learners', { ...S.params, inactive: e.checked });
FORM.admit = async (d) => {
  const r = await fn('manage-users', { action: 'create_learner', full_name: d.full_name, adm_no: d.adm_no, class_id: d.class_id,
    consent_confirmed: !!d.consent, consent_method: d.consent_method,
    learner_login: !!d.learner_login, parent: d.p_name ? { full_name: d.p_name, phone: d.p_phone, email: d.p_email, relationship: d.p_rel } : null });
  const creds = [];
  if (r.learner) creds.push({ who: d.full_name + ' (learner)', ...r.learner });
  if (r.parent) creds.push({ who: d.p_name + ' (parent)', ...r.parent });
  await reloadLookups();
  modal(`${esc(d.full_name)} admitted`, (r.warning ? `<p class="note bad">${esc(r.warning)}</p>` : '') + (creds.length ? credsBlock(creds) : '<p>No logins were created.</p>'));
};
ACT['csv-import'] = async () => {
  const file = document.getElementById('csv-file').files[0]; const out = document.getElementById('csv-out');
  if (!file) { toast('Choose a CSV file first.', 'bad'); document.getElementById('csv-file').focus(); return; }
  const method = document.getElementById('csv-method').value;
  if (!method || !document.getElementById('csv-consent').checked) { toast('Confirm that parents have consented, and how, before importing.', 'bad'); document.getElementById('csv-method').focus(); return; }
  const rows = parseCSV(await file.text());
  if (!rows.length) { toast('That file has no rows.', 'bad'); return; }
  const logins = document.getElementById('csv-logins').checked; const creds = []; const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; out.innerHTML = `<p class="note">Importing ${i + 1} of ${rows.length}…</p>`;
    const cls = S.classes.find((c) => c.name.toLowerCase() === String(r.class || '').toLowerCase());
    if (!r.name || !r.adm_no) { errors.push(`Row ${i + 2}: name and adm_no are required`); continue; }
    try {
      const res = await fn('manage-users', { action: 'create_learner', full_name: r.name, adm_no: r.adm_no, class_id: cls?.id || null, consent_confirmed: true, consent_method: method,
        learner_login: logins, parent: r.parent_name ? { full_name: r.parent_name, phone: r.parent_phone, email: r.parent_email } : null });
      if (res.learner) creds.push({ who: r.name, ...res.learner });
      if (res.parent?.password) creds.push({ who: r.parent_name + ' (parent of ' + r.name.split(' ')[0] + ')', ...res.parent });
      if (res.warning) errors.push(`${r.name}: ${res.warning}`);
      if (!cls && r.class) errors.push(`${r.name}: class "${r.class}" not found, admitted without a class`);
    } catch (e) { errors.push(`${r.name}: ${e.message}`); }
  }
  out.innerHTML = `<p class="note">${rows.length - errors.filter((e) => !e.includes('admitted without')).length} imported.${errors.length ? ' Problems:<br>' + errors.map(esc).join('<br>') : ''}</p>`;
  if (creds.length) {
    const csv = 'name,login,school_code,temporary_password\n' + creds.map((c) => [c.who, c.login, c.school_code || '', c.password || ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    modal('Sign-in details', `<p><a class="btn" href="${url}" download="shulehub-logins.csv">Download all as CSV</a></p>${credsBlock(creds)}`, { wide: true });
  }
  await reloadLookups();
};

async function learnerModal(id) {
  const [s, guards] = await Promise.all([q(sb.from('students').select('*').eq('id', id).single()), q(sb.from('guardians').select('*').eq('student_id', id))]);
  const parents = guards.length ? await q(sb.from('profiles').select('id, full_name, phone, login_id, active').in('id', guards.map((g) => g.parent_id))) : [];
  return `<form class="form" data-f="learner-save"><input type="hidden" name="id" value="${s.id}">
    <label class="f grow2">Full name<input name="full_name" value="${esc(s.full_name)}" required></label>
    <label class="f">Admission no.<input name="adm_no" value="${esc(s.adm_no)}" required></label>
    <label class="f">Class<select name="class_id">${opt('', 'No class')}${S.classes.map((c) => opt(c.id, c.name, s.class_id)).join('')}</select></label>
    <label class="f check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Still at the school</label>
    <div><button class="btn">Save changes</button></div></form>
  <h3>Consent and optional features</h3>
  <p>${s.consent_recorded_at ? `Parent consent recorded on ${fmtD(s.consent_recorded_at)} (${esc(s.consent_method || '')}) by ${esc(nameOf(s.consent_recorded_by))}.` : '<span class="pill bad">No consent recorded</span> Record it once a parent or guardian has agreed.'}</p>
  ${s.consent_recorded_at ? '' : `<form class="form" data-f="record-consent"><input type="hidden" name="id" value="${s.id}"><label class="f">How consent was given<select name="method" required>${opt('', 'Choose…')}${['Signed admission form', 'Signed ShuleHub consent form', 'Parent confirmed in person at the school', 'Parent confirmed in writing (email or letter)'].map((m) => opt(m, m)).join('')}</select></label><div><button class="btn ghost">Record consent</button></div></form>`}
  <p class="small muted">Chat: <b>${s.allow_chat ? 'allowed' : 'off'}</b> · Mwalimu AI: <b>${s.allow_ai ? 'allowed' : 'off'}</b>. Only a parent or guardian can switch these on, from their Home page. You can switch them off.</p>
  ${s.allow_chat || s.allow_ai ? `<div><button class="btn sm ghost" data-a="child-off" data-id="${s.id}">Switch chat and AI off</button></div>` : ''}
  <h3>Learner login</h3>
  <div class="row">${s.user_id ? `<span class="muted">Signs in with <b class="mono">${esc(s.adm_no)}</b> and school code <b class="mono">${esc(S.school.code)}</b>.</span><button class="btn sm ghost" data-a="reset-pw" data-id="${s.user_id}" data-name="${esc(s.full_name)}">Reset password</button>` : `<span class="muted">No login yet.</span><button class="btn sm" data-a="learner-login" data-id="${s.id}" data-name="${esc(s.full_name)}">Create login</button>`}</div>
  <h3>Parents and guardians</h3>
  <div class="tw"><table><tbody>${parents.map((p) => `<tr><td><b>${esc(p.full_name)}</b><span class="sub">${esc(guards.find((g) => g.parent_id === p.id)?.relationship || '')} · <span class="mono">${esc(showPhone(p.phone) || p.login_id || '')}</span></span></td><td class="r"><button class="btn sm ghost" data-a="reset-pw" data-id="${p.id}" data-name="${esc(p.full_name)}">Reset password</button> <button class="btn sm ghost" data-a="unlink-parent" data-s="${s.id}" data-p="${p.id}">Unlink</button></td></tr>`).join('') || '<tr><td class="muted">No parent linked.</td></tr>'}</tbody></table></div>
  <form class="form" data-f="add-guardian"><input type="hidden" name="student_id" value="${s.id}"><label class="f">Parent name<input name="full_name" required></label><label class="f">Phone<input name="phone" type="tel"></label><label class="f">Email<input name="email" type="email"></label><label class="f">Relationship<select name="relationship">${['Mother', 'Father', 'Guardian', 'Grandparent', 'Sponsor'].map((r) => opt(r, r)).join('')}</select></label><div><button class="btn ghost">Link parent</button></div></form>
  <h3>Delete this learner</h3>
  <p class="small">Permanently deletes the learner's login, marks, attendance, fee records and messages. Use this when the school no longer needs the records, or a parent asks for deletion and the school has no legal reason to keep them. Download the fee statement first if your accounts need it.</p>
  <div><button class="btn danger" data-a="learner-delete" data-id="${s.id}" data-name="${esc(s.full_name)}">Delete learner permanently</button></div>`;
}
ACT['learner-open'] = async (a) => { modal('Learner', '<div class="loading"><span class="thinking"><i></i><i></i><i></i></span></div>', { wide: true }); setModalBody(await learnerModal(a.dataset.id)); };
FORM['learner-save'] = async (d) => {
  await q(sb.from('students').update({ full_name: d.full_name, adm_no: d.adm_no, class_id: d.class_id || null, active: !!d.active }).eq('id', d.id));
  toast('Saved'); closeModal(); await reloadLookups();
};
FORM['record-consent'] = async (d) => {
  await q(sb.from('students').update({ consent_recorded_at: new Date().toISOString(), consent_recorded_by: S.me.id, consent_method: d.method }).eq('id', d.id));
  toast('Consent recorded'); setModalBody(await learnerModal(d.id)); return false;
};
ACT['child-off'] = async (a) => { await q(sb.from('students').update({ allow_chat: false, allow_ai: false }).eq('id', a.dataset.id)); toast('Chat and Mwalimu AI switched off for this learner'); setModalBody(await learnerModal(a.dataset.id)); };
ACT['learner-delete'] = (a) => confirmAction({
  title: `Delete ${esc(a.dataset.name)}?`,
  body: `<p>This permanently deletes <b>${esc(a.dataset.name)}</b>: their login, marks, attendance, fee charges and payments, quiz scores and messages. It cannot be undone.</p><label class="f check"><input type="checkbox" name="lone"> Also delete parent accounts that have no other child at the school</label>`,
  confirmLabel: 'Delete permanently',
  onConfirm: async (x) => { const r = await fn('manage-users', { action: 'delete_learner', student_id: a.dataset.id, delete_lone_parents: !!x.lone }); closeModal(); toast(`Learner deleted${r.parents_removed ? `, with ${r.parents_removed} parent account${r.parents_removed > 1 ? 's' : ''}` : ''}.`); await reloadLookups(); refresh(); },
});
ACT['learner-login'] = async (a) => { const r = await fn('manage-users', { action: 'learner_login', student_id: a.dataset.id }); modal('Learner login created', credsBlock([{ who: a.dataset.name, ...r }])); refresh(); };
ACT['reset-pw'] = async (a) => { const r = await fn('manage-users', { action: 'reset_password', user_id: a.dataset.id }); modal('New temporary password', credsBlock([{ who: a.dataset.name, ...r }])); };
ACT['unlink-parent'] = async (a) => { await q(sb.from('guardians').delete().eq('student_id', a.dataset.s).eq('parent_id', a.dataset.p)); toast('Parent unlinked'); setModalBody(await learnerModal(a.dataset.s)); };
FORM['add-guardian'] = async (d) => {
  const r = await fn('manage-users', { action: 'add_guardian', student_id: d.student_id, parent: { full_name: d.full_name, phone: d.phone, email: d.email, relationship: d.relationship } });
  await reloadLookups();
  if (r.password) modal('Parent account created', credsBlock([{ who: d.full_name, ...r }])); else { toast('Linked to the existing parent account'); setModalBody(await learnerModal(d.student_id)); }
  return false;
};

/* =============================== STAFF =============================== */
const staff = {
  label: 'Staff & roles', icon: 'shield', perm: 'staff',
  async render() {
    const [people, asg, perms] = await Promise.all([
      q(sb.from('profiles').select('*').in('role', STAFF_ROLES).order('full_name')),
      q(sb.from('teaching_assignments').select('*')),
      q(sb.from('role_permissions').select('*')),
    ]);
    const has = (r, p) => perms.some((x) => x.role === r && x.perm === p);
    const teachers = people.filter((p) => p.active);
    const canDirector = ['director'].includes(S.me.role);
    return head('Staff', 'Staff & roles', 'Changing a person\'s role changes what they can see and do. Leaders who also teach get the teaching tools too.') +
    `<div class="card"><div class="tw"><table><thead><tr><th>Name</th><th>Role</th><th>Teaches</th><th>Sign in with</th><th></th></tr></thead><tbody>
    ${people.map((p) => { const mine = asg.filter((a) => a.teacher_id === p.id); return `<tr${p.active ? '' : ' class="dim"'}><td><b>${esc(p.full_name)}</b><span class="sub mono">${esc(showPhone(p.phone))}</span></td>
      <td><select data-c="staff-role" data-id="${p.id}" aria-label="Role for ${esc(p.full_name)}" ${p.id === S.me.id || (p.role === 'director' && !canDirector) ? 'disabled' : ''}>${STAFF_ROLES.filter((r) => r !== 'director' || canDirector || p.role === 'director').map((r) => opt(r, ROLE_LABEL[r], p.role)).join('')}</select></td>
      <td class="small">${mine.map((a) => `${esc(S.subjects.find((s) => s.id === a.subject_id)?.short || '')} ${esc(className(a.class_id).replace(/^Grade /, 'G'))}`).join(', ') || '<span class="muted">–</span>'}</td>
      <td class="mono small">${esc(p.login_id || '')}</td>
      <td class="r nowrap">${p.id !== S.me.id ? `<button class="btn sm ghost" data-a="reset-pw" data-id="${p.id}" data-name="${esc(p.full_name)}">Reset password</button> <button class="btn sm ghost" data-a="staff-active" data-id="${p.id}" data-on="${p.active ? '0' : '1'}">${p.active ? 'Deactivate' : 'Reactivate'}</button> <button class="btn sm ghost" data-a="account-delete" data-id="${p.id}" data-name="${esc(p.full_name)}">Delete</button>` : '<span class="muted small">you</span>'}</td></tr>`; }).join('')}
    </tbody></table></div></div>
    <div class="card"><header><h2>Add a staff member</h2></header><form class="form" data-f="add-staff"><label class="f grow2">Full name<input name="full_name" required placeholder="e.g. Mr. Daniel Kiprop"></label><label class="f">Role<select name="role">${STAFF_ROLES.filter((r) => r !== 'director' || canDirector).map((r) => opt(r, ROLE_LABEL[r], 'teacher')).join('')}</select></label><label class="f">Phone<input name="phone" type="tel" placeholder="07xx xxx xxx"></label><label class="f">Email (optional)<input name="email" type="email"></label><div><button class="btn">Add staff</button></div></form></div>
    <div class="card"><header><h2>Who teaches what</h2><span class="muted small">Teachers can only take registers and enter marks for the classes and subjects listed here.</span></header>
      <form class="form" data-f="add-assignment"><label class="f">Teacher<select name="teacher_id" required>${teachers.map((t) => opt(t.id, t.full_name)).join('')}</select></label><label class="f">Class<select name="class_id" required>${S.classes.map((c) => opt(c.id, c.name)).join('')}</select></label><label class="f">Learning area<select name="subject_id" required>${S.subjects.map((s) => opt(s.id, s.name)).join('')}</select></label><div><button class="btn ghost">Assign</button></div></form>
      <div class="tw"><table><thead><tr><th>Class</th><th>Learning area</th><th>Teacher</th><th></th></tr></thead><tbody>${asg.sort((a, b) => className(a.class_id).localeCompare(className(b.class_id))).map((a) => `<tr><td>${esc(className(a.class_id))}</td><td>${esc(S.subjects.find((s) => s.id === a.subject_id)?.name || '')}</td><td>${esc(nameOf(a.teacher_id))}</td><td class="r"><button class="btn sm ghost" data-a="del-assignment" data-id="${a.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No assignments yet.</td></tr>'}</tbody></table></div></div>
    <div class="card"><header><h2>What each role can do</h2><span class="muted small">Directors always have every permission. Teachers always have their own classes, gradebook and messages.</span></header>
      <div class="tw"><table><thead><tr><th>Permission</th>${LEADER_ROLES.filter((r) => r !== 'director').map((r) => `<th class="c">${ROLE_LABEL[r]}</th>`).join('')}</tr></thead><tbody>${PERMS.map(([p, l]) => `<tr><td>${l}</td>${LEADER_ROLES.filter((r) => r !== 'director').map((r) => `<td class="c"><input type="checkbox" aria-label="${ROLE_LABEL[r]}: ${l}" data-c="perm" data-r="${r}" data-p="${p}" ${has(r, p) ? 'checked' : ''} ${r === S.me.role && p === 'staff' ? 'disabled title="You cannot remove your own access to this page"' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  },
};
CHG['staff-role'] = async (e) => { await fn('manage-users', { action: 'set_role', user_id: e.dataset.id, role: e.value }); toast(`${nameOf(e.dataset.id)} is now ${ROLE_LABEL[e.value]}`); await reloadLookups(); };
ACT['staff-active'] = async (a) => { await fn('manage-users', { action: 'set_active', user_id: a.dataset.id, active: a.dataset.on === '1' }); toast(a.dataset.on === '1' ? 'Account reactivated' : 'Account deactivated. They can no longer sign in.'); refresh(); };
ACT['account-delete'] = (a) => confirmAction({
  title: `Delete ${esc(a.dataset.name)}'s account?`,
  body: `<p>This permanently deletes the account and the messages they sent and received. Marks they entered and registers they took stay with the learners. If you only want to stop them signing in, use <b>Deactivate</b> instead.</p>`,
  confirmLabel: 'Delete account',
  onConfirm: async () => { await fn('manage-users', { action: 'delete_account', user_id: a.dataset.id }); closeModal(); toast('Account deleted'); await reloadLookups(); refresh(); },
});
FORM['add-staff'] = async (d) => { const r = await fn('manage-users', { action: 'create_staff', ...d }); await reloadLookups(); modal('Staff account created', credsBlock([{ who: d.full_name, ...r }])); };
FORM['add-assignment'] = async (d) => { await q(sb.from('teaching_assignments').insert({ ...d, school_id: S.me.school_id })); toast('Assigned'); };
ACT['del-assignment'] = async (a) => { await q(sb.from('teaching_assignments').delete().eq('id', a.dataset.id)); refresh(); };
CHG.perm = async (e) => {
  const row = { school_id: S.me.school_id, role: e.dataset.r, perm: e.dataset.p };
  if (e.checked) await q(sb.from('role_permissions').insert(row)); else await q(sb.from('role_permissions').delete().match(row));
  toast('Permissions updated');
};

/* =============================== FEES =============================== */
const fees = {
  label: 'Fees', icon: 'money', perm: 'fees',
  async render(p) {
    if (!S.terms.length) return head('Fees', 'Fees') + empty('Add a term first. Fees are set per term.', can('settings') ? '<button class="btn" data-a="go" data-v="setup">Add a term</button>' : '');
    const termId = p.term || currentTerm()?.id; const cls = p.cls || 'all';
    const [items, bal, recent, unmatched, mp] = await Promise.all([
      q(sb.from('fee_items').select('*').eq('term_id', termId).order('name')),
      q(sb.from('student_balances').select('*').order('balance', { ascending: false })),
      q(sb.from('payments').select('*').order('paid_at', { ascending: false }).limit(15)),
      q(sb.from('mpesa_unmatched').select('*').order('created_at', { ascending: false })),
      q(sb.rpc('mpesa_configured')),
    ]);
    const shown = bal.filter((b) => cls === 'all' || b.class_id === cls);
    const charged = sum(bal.map((b) => b.charged)), paid = sum(bal.map((b) => b.paid)), owing = bal.filter((b) => b.balance > 0);
    const byClass = (c) => items.filter((i) => (i.class_id || null) === c);
    const structure = [null, ...S.classes.map((c) => c.id)].filter((c) => byClass(c).length);
    return head('Fees', 'Fees', `Parents pay by M-Pesa ${S.school.paybill ? `Paybill <b class="mono">${esc(S.school.paybill)}</b>` : 'Paybill'} using the learner's admission number as the account number.`,
      `<select data-c="fee-term" aria-label="Term">${termOpts(termId)}</select>${can('announce') || can('fees') ? `<button class="btn ghost" data-a="fee-sms">SMS ${owing.length} parents with balances</button>` : ''}`) +
    (!mp ? `<p class="note">M-Pesa is not connected yet, so payments must be recorded by hand. ${can('settings') ? '<button class="linkbtn" data-a="go" data-v="setup">Connect M-Pesa</button>' : 'Ask the principal to connect it under Setup.'}</p>` : '') +
    `<div class="stats">${stat('Billed (all terms)', ksh(charged))}${stat('Collected', ksh(paid), charged ? Math.round(paid / charged * 100) + '% of billed' : '', charged ? paid / charged * 100 : null)}${stat('Outstanding', ksh(sum(owing.map((b) => b.balance))), `${owing.length} learners`)}${stat('Cleared', bal.length - owing.length, 'learners with no balance')}</div>
    ${unmatched.length && can('payments') ? `<div class="card accent"><header><h2>${unmatched.length} M-Pesa payment${unmatched.length > 1 ? 's' : ''} need a learner</h2><span class="muted small">The account number did not match any admission number.</span></header><div class="tw"><table><tbody>${unmatched.map((u) => `<tr><td><b>${ksh(u.amount)}</b><span class="sub mono">${esc(u.trans_id)} · account "${esc(u.bill_ref)}" · ${esc(u.payer_name || '')} · ${fmtDT(u.created_at)}</span></td><td><select data-c="assign-unmatched" data-id="${esc(u.trans_id)}" aria-label="Assign to learner"><option value="">Assign to…</option>${bal.map((b) => opt(b.student_id, `${b.full_name} · ${b.adm_no}`)).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="g2"><div class="card"><header><h2>Balances</h2><select data-c="fee-cls" aria-label="Class">${classOpts(cls)}</select></header><div class="tw"><table><thead><tr><th>Learner</th><th class="r">This term</th><th class="r">Paid (all)</th><th class="r">Balance</th><th></th></tr></thead><tbody>
      ${shown.map((b) => `<tr><td><b>${esc(b.full_name)}</b><span class="sub">${esc(className(b.class_id))} · <span class="mono">${esc(b.adm_no)}</span></span></td><td class="r num">${ksh(b.this_term)}</td><td class="r num">${ksh(b.paid)}</td><td class="r">${b.balance > 0 ? `<b class="num">${ksh(b.balance)}</b>` : b.balance < 0 ? `<span class="pill info">Credit ${ksh(-b.balance)}</span>` : '<span class="pill good">Clear</span>'}</td><td class="r"><button class="btn sm ghost" data-a="statement" data-id="${b.student_id}" data-name="${esc(b.full_name)}">Statement</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No learners yet.</td></tr>'}
    </tbody></table></div></div>
    <div class="stack">
      ${can('payments') ? `<div class="card"><header><h2>Record a payment</h2></header><form class="form" data-f="fee-pay"><label class="f full">Learner<select name="student_id" required>${bal.map((b) => opt(b.student_id, `${b.full_name} · ${b.adm_no}`)).join('')}</select></label><label class="f">Amount (KSh)<input type="number" name="amount" min="1" required></label><label class="f">Method<select name="method">${['M-Pesa', 'Bank', 'Cash', 'Cheque'].map((m) => opt(m, m)).join('')}</select></label><label class="f full">Reference<input name="reference" placeholder="M-Pesa code, bank slip or receipt no."></label><div><button class="btn">Save payment</button></div></form></div>` : ''}
      <div class="card"><header><h2>Fee structure · ${esc(S.terms.find((t) => t.id === termId)?.name || '')}</h2><span class="num">${ksh(sum(byClass(null).map((i) => i.amount)))} for all</span></header>
        ${structure.length ? structure.map((c) => `<p class="small muted" style="margin-top:6px">${c ? esc(className(c)) + ' only' : 'Every class'}</p><div class="tw"><table><tbody>${byClass(c).map((i) => `<tr><td>${esc(i.name)}</td><td class="r num">${ksh(i.amount)}</td><td class="r"><button class="btn sm ghost" data-a="del-fee-item" data-id="${i.id}" aria-label="Remove ${esc(i.name)}">×</button></td></tr>`).join('')}</tbody></table></div>`).join('') : '<p class="muted">No fee items for this term yet.</p>'}
        <form class="form" data-f="fee-item"><input type="hidden" name="term_id" value="${termId}"><label class="f">Item<input name="name" required placeholder="e.g. Tuition"></label><label class="f">Amount<input type="number" name="amount" min="0" required></label><label class="f">Applies to<select name="class_id">${opt('', 'Every class')}${S.classes.map((c) => opt(c.id, c.name)).join('')}</select></label><div><button class="btn ghost">Add item</button></div></form>
        <div class="row"><button class="btn" data-a="bill-term" data-id="${termId}">Bill learners for this term</button><span class="muted small">Adds these items to every learner's account. Safe to press again after admitting new learners.</span></div></div>
      <div class="card"><header><h2>Recent payments</h2></header><div class="list">${recent.map((r) => `<div class="li"><div class="grow"><b>${esc(bal.find((b) => b.student_id === r.student_id)?.full_name || '')}</b><small class="block mono">${esc(r.method)} · ${esc(r.mpesa_receipt || r.reference || '')} · ${fmtDT(r.paid_at)}</small></div><span class="num">${ksh(r.amount)}</span></div>`).join('') || '<p class="muted">No payments yet.</p>'}</div></div>
    </div></div>`;
  },
};
CHG['fee-term'] = (e) => go('fees', { ...S.params, term: e.value });
CHG['fee-cls'] = (e) => go('fees', { ...S.params, cls: e.value });
FORM['fee-item'] = async (d) => { await q(sb.from('fee_items').insert({ school_id: S.me.school_id, term_id: d.term_id, name: d.name.trim(), amount: +d.amount, class_id: d.class_id || null })); toast('Fee item added'); };
ACT['del-fee-item'] = async (a) => { await q(sb.from('fee_items').delete().eq('id', a.dataset.id)); refresh(); };
ACT['bill-term'] = async (a) => { const n = await q(sb.rpc('bill_term', { p_term: a.dataset.id })); toast(n ? `${n} charges added to learners' accounts` : 'Everyone is already billed for these items.'); refresh(); };
FORM['fee-pay'] = async (d) => { await q(sb.from('payments').insert({ school_id: S.me.school_id, student_id: d.student_id, amount: +d.amount, method: d.method, reference: d.reference || null, recorded_by: S.me.id })); toast(`${ksh(d.amount)} recorded`); };
ACT['fee-sms'] = async () => { const r = await fn('sms', { action: 'fee_reminders' }); toast(r.sent ? `${r.sent} reminder${r.sent > 1 ? 's' : ''} sent` : r.note || 'No reminders were sent. Check that parents have phone numbers.'); };
CHG['assign-unmatched'] = async (e) => {
  if (!e.value) return;
  const u = (await q(sb.from('mpesa_unmatched').select('*').eq('trans_id', e.dataset.id).single()));
  await q(sb.from('payments').insert({ school_id: S.me.school_id, student_id: e.value, amount: u.amount, method: 'M-Pesa', reference: `${u.trans_id} · ${u.payer_name || ''}`, mpesa_receipt: u.trans_id, recorded_by: S.me.id }));
  await q(sb.from('mpesa_unmatched').delete().eq('trans_id', u.trans_id));
  toast('Payment assigned'); refresh();
};
async function statementHTML(id) {
  const [ch, pay] = await Promise.all([q(sb.from('fee_charges').select('*').eq('student_id', id)), q(sb.from('payments').select('*').eq('student_id', id))]);
  const rows = [...ch.map((c) => ({ d: c.created_at, t: c.description + (c.term_id ? ' · ' + (S.terms.find((x) => x.id === c.term_id)?.name || '') : ''), a: c.amount, id: c.id, k: 'c' })), ...pay.map((p) => ({ d: p.paid_at, t: `Payment · ${p.method} ${p.mpesa_receipt || p.reference || ''}`, a: -p.amount, id: p.id, k: 'p', m: !p.mpesa_receipt }))].sort((a, b) => String(a.d).localeCompare(String(b.d)));
  let run = 0;
  return `<div class="tw"><table><thead><tr><th>Date</th><th>Item</th><th class="r">Amount</th><th class="r">Balance</th><th></th></tr></thead><tbody>${rows.map((r) => { run += r.a; return `<tr><td>${fmtD(r.d)}</td><td>${esc(r.t)}</td><td class="r num" ${r.a < 0 ? 'style="color:var(--good)"' : ''}>${r.a < 0 ? '−' : ''}${ksh(Math.abs(r.a))}</td><td class="r num">${ksh(run)}</td><td class="r">${(r.k === 'c' && can('fees')) || (r.k === 'p' && r.m && can('payments')) ? `<button class="btn sm ghost" data-a="del-ledger" data-k="${r.k}" data-id="${r.id}" data-s="${id}" aria-label="Remove">×</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Nothing yet.</td></tr>'}</tbody></table></div>
  <h3>Add a charge or bursary</h3><form class="form" data-f="add-charge"><input type="hidden" name="student_id" value="${id}"><label class="f">Description<input name="description" required placeholder="e.g. Balance brought forward, CDF bursary"></label><label class="f">Amount (KSh)<input type="number" name="amount" required><small>Use a minus sign for a bursary or waiver, e.g. -5000</small></label><label class="f">Term<select name="term_id">${opt('', 'No term')}${termOpts(currentTerm()?.id)}</select></label><div><button class="btn ghost">Add</button></div></form>`;
}
ACT.statement = async (a) => { modal(`Statement · ${esc(a.dataset.name)}`, '<div class="loading"><span class="thinking"><i></i><i></i><i></i></span></div>', { wide: true }); S.params.stmt = a.dataset.id; setModalBody(await statementHTML(a.dataset.id)); };
FORM['add-charge'] = async (d) => { await q(sb.from('fee_charges').insert({ school_id: S.me.school_id, student_id: d.student_id, description: d.description, amount: Math.round(+d.amount), term_id: d.term_id || null, created_by: S.me.id })); toast('Added'); setModalBody(await statementHTML(d.student_id)); refresh(); return false; };
ACT['del-ledger'] = async (a) => { await q(sb.from(a.dataset.k === 'c' ? 'fee_charges' : 'payments').delete().eq('id', a.dataset.id)); setModalBody(await statementHTML(a.dataset.s)); refresh(); };

/* =============================== RESULTS =============================== */
const results = {
  label: 'Results', icon: 'chart', perm: 'results',
  async render(p) {
    const exams = await q(sb.from('exams').select('*').order('created_at', { ascending: false }));
    const examForm = `<form class="form" data-f="new-exam"><label class="f">Exam name<input name="name" required placeholder="e.g. T3 End-Term"></label><label class="f">Term<select name="term_id">${termOpts(currentTerm()?.id)}</select></label><div><button class="btn ghost">Create exam</button></div></form>`;
    if (!exams.length) return head('Results', 'Results') + `<div class="card"><h2>Create your first exam</h2><p class="muted">Teachers enter marks against an exam. When everyone has submitted, you publish it and parents and learners see the results.</p>${examForm}</div>`;
    const ex = exams.find((e) => e.id === p.exam) || exams[0];
    const [marks, subs, asg, students] = await Promise.all([
      q(sb.from('marks').select('student_id, subject_id, score').eq('exam_id', ex.id)),
      q(sb.from('mark_submissions').select('*').eq('exam_id', ex.id)),
      q(sb.from('teaching_assignments').select('class_id, subject_id, teacher_id')),
      q(sb.from('students').select('id, full_name, class_id, adm_no').eq('active', true)),
    ]);
    const stuClass = new Map(students.map((s) => [s.id, s.class_id]));
    const cell = (c, s) => { const ms = marks.filter((m) => m.subject_id === s && stuClass.get(m.student_id) === c); return { n: ms.length, mean: avg(ms.map((m) => m.score)), sub: subs.some((x) => x.class_id === c && x.subject_id === s), taught: asg.some((a) => a.class_id === c && a.subject_id === s) }; };
    const usedSubj = S.subjects.filter((s) => asg.some((a) => a.subject_id === s.id) || marks.some((m) => m.subject_id === s.id));
    const need = asg.length, done = subs.length;
    const bcls = p.bcls || S.classes[0]?.id;
    const roster = students.filter((s) => s.class_id === bcls).sort((a, b) => a.full_name.localeCompare(b.full_name));
    const sc = (sid, sub) => marks.find((m) => m.student_id === sid && m.subject_id === sub)?.score;
    return head('Results', 'Results', 'Teachers submit marks for each class and learning area. Publishing makes results and report cards visible to parents and learners.',
      `<select data-c="res-exam" aria-label="Exam">${exams.map((e) => opt(e.id, `${e.name}${e.status === 'published' ? ' (published)' : ''}`, ex.id)).join('')}</select>`) +
    `<div class="card"><header><div class="row"><h2>${esc(ex.name)}</h2><span class="pill ${ex.status === 'published' ? 'good' : 'warn'}">${ex.status}</span><span class="muted small">${done} of ${need} mark sets submitted</span></div>
      ${ex.status === 'published' ? `<button class="btn ghost" data-a="exam-status" data-id="${ex.id}" data-s="draft">Unpublish</button>` : `<button class="btn" data-a="exam-status" data-id="${ex.id}" data-s="published">Publish to parents & learners</button>`}</header>
      ${ex.status !== 'published' && done < need ? `<p class="note">${need - done} mark set${need - done > 1 ? 's are' : ' is'} not submitted yet. You can still publish; missing learning areas show as "not yet assessed".</p>` : ''}
      <div class="tw"><table><thead><tr><th>Class</th>${usedSubj.map((s) => `<th class="r">${esc(s.short)}</th>`).join('')}</tr></thead><tbody>${S.classes.map((c) => `<tr><td><b>${esc(c.name)}</b></td>${usedSubj.map((s) => { const x = cell(c.id, s.id); return `<td class="r">${!x.taught && !x.n ? '<span class="muted">·</span>' : x.sub ? `<span class="num" title="Submitted">${r1(x.mean)} ✓</span>` : `<span class="pill warn" title="Marks entered, not submitted">${x.n}</span>`}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="legend"><span>Number with ✓: submitted, class mean out of 100.</span><span><span class="pill warn">5</span> marks entered but not submitted.</span><span>· nobody assigned.</span></div></div>
    <div class="card printable"><header><h2>Broadsheet · ${esc(className(bcls))}</h2><div class="row noprint"><select data-c="res-bcls" aria-label="Class">${classOpts(bcls, false)}</select><button class="btn ghost" data-a="print">Print</button></div></header>
      <div class="tw"><table><thead><tr><th>#</th><th>Learner</th>${usedSubj.map((s) => `<th class="r">${esc(s.short)}</th>`).join('')}<th class="r">Avg</th><th>Level</th></tr></thead><tbody>${roster.map((s, i) => { const v = usedSubj.map((x) => sc(s.id, x.id)); const a = avg(v); return `<tr><td class="muted">${i + 1}</td><td><b>${esc(s.full_name)}</b><span class="sub mono">${esc(s.adm_no)}</span></td>${v.map((x) => `<td class="r num">${x ?? '<span class="muted">–</span>'}</td>`).join('')}<td class="r num"><b>${r1(a)}</b></td><td>${lvPill(a)}</td></tr>`; }).join('') || `<tr><td colspan="${usedSubj.length + 4}" class="muted">No learners in this class.</td></tr>`}
      <tr class="foot"><td></td><td>Class mean</td>${usedSubj.map((x) => `<td class="r num">${r1(avg(roster.map((s) => sc(s.id, x.id))))}</td>`).join('')}<td class="r num">${r1(avg(roster.map((s) => avg(usedSubj.map((x) => sc(s.id, x.id))))))}</td><td></td></tr></tbody></table></div></div>
    <div class="card"><header><h2>School mean by learning area</h2></header>${bars(usedSubj.map((s) => ({ label: s.short, value: avg(marks.filter((m) => m.subject_id === s.id).map((m) => m.score)) })))}</div>
    <div class="card"><header><h2>New exam</h2></header>${examForm}</div>`;
  },
};
CHG['res-exam'] = (e) => go('results', { ...S.params, exam: e.value });
CHG['res-bcls'] = (e) => go('results', { ...S.params, bcls: e.value });
FORM['new-exam'] = async (d) => { const r = await q(sb.from('exams').insert({ school_id: S.me.school_id, name: d.name.trim(), term_id: d.term_id || null }).select().single()); S.params.exam = r.id; toast('Exam created. Teachers can now enter marks.'); };
ACT['exam-status'] = async (a) => { await q(sb.from('exams').update({ status: a.dataset.s, published_at: a.dataset.s === 'published' ? new Date().toISOString() : null }).eq('id', a.dataset.id)); toast(a.dataset.s === 'published' ? 'Published. Parents and learners can now see results.' : 'Results hidden again.'); refresh(); };
ACT.print = () => { document.body.classList.add('printing'); setTimeout(() => { window.print(); document.body.classList.remove('printing'); }, 50); };

/* =============================== ANNOUNCEMENTS =============================== */
const announce = {
  label: 'Announcements', icon: 'bell', perm: 'announce',
  async render() {
    const xs = await q(sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(50));
    return head('Announcements', 'Announcements', 'Post to everyone or one group. Tick SMS for parents who do not use smartphones.') +
    `<div class="card"><form class="form" data-f="announce"><label class="f full">Title<input name="title" required maxlength="120"></label><label class="f full">Message<textarea name="body" required maxlength="400"></textarea><small>Keep it under 400 characters so the SMS fits in three messages.</small></label><label class="f">Send to<select name="audience">${[['everyone', 'Everyone'], ['parents', 'Parents'], ['learners', 'Learners'], ['staff', 'Staff']].map(([v, l]) => opt(v, l)).join('')}</select></label><label class="f check"><input type="checkbox" name="sms"> Also send by SMS</label><div><button class="btn">Post</button></div></form></div>
    <div class="card"><header><h2>Posted</h2></header><div class="list">${xs.map((a) => `<div class="li"><div class="grow"><b>${esc(a.title)}</b><p class="muted pre">${esc(a.body)}</p><small>${fmtDT(a.created_at)} · ${esc(nameOf(a.created_by))} · ${esc(a.audience)}${a.sms ? ' · SMS' : ''}</small></div><button class="btn sm ghost" data-a="del-ann" data-id="${a.id}">Delete</button></div>`).join('') || '<p class="muted">Nothing posted yet.</p>'}</div></div>`;
  },
};
FORM.announce = async (d) => {
  const a = await q(sb.from('announcements').insert({ school_id: S.me.school_id, title: d.title, body: d.body, audience: d.audience, sms: !!d.sms, created_by: S.me.id }).select().single());
  if (d.sms) { try { const r = await fn('sms', { action: 'announcement', announcement_id: a.id }); toast(`Posted and sent to ${r.sent} phone${r.sent === 1 ? '' : 's'}`); } catch (e) { toast('Posted, but SMS failed: ' + e.message, 'bad'); } }
  else toast('Posted');
};
ACT['del-ann'] = async (a) => { await q(sb.from('announcements').delete().eq('id', a.dataset.id)); refresh(); };

/* =============================== WELFARE =============================== */
const welfare = {
  label: 'Welfare', icon: 'heart', perm: 'welfare',
  async render() {
    const [reps, meets] = await Promise.all([q(sb.from('message_reports').select('*').order('created_at', { ascending: false }).limit(100)), q(sb.from('meetings').select('*').order('starts_at', { ascending: false }).limit(60))]);
    return head('Welfare', 'Welfare', 'Chats that learners have reported, and every parent meeting at the school.') +
    `<div class="card"><header><h2>Reported chats</h2><span class="pill ${reps.filter((r) => !r.resolved).length ? 'warn' : 'good'}">${reps.filter((r) => !r.resolved).length} open</span></header><div class="list">${reps.map((r) => `<div class="li"><div class="grow"><b>${esc(nameOf(r.reporter))}</b> reported a chat with <b>${esc(nameOf(r.reported_user))}</b><p class="muted">${esc(r.note || 'No note')}</p><small>${fmtDT(r.created_at)}</small></div><div class="row col-end">${r.resolved ? '<span class="pill good">resolved</span>' : '<span class="pill warn">open</span>'}<button class="btn sm ghost" data-a="view-report" data-id="${r.id}">Read chat</button>${r.resolved ? '' : `<button class="btn sm" data-a="resolve-report" data-id="${r.id}">Mark resolved</button>`}</div></div>`).join('') || '<p class="muted">No reports. Learners can report a chat from their Messages page.</p>'}</div></div>
    <div class="card"><header><h2>Parent meetings</h2></header><div class="list">${meets.map((m) => meetingRow(m, 'leader')).join('') || '<p class="muted">No meetings yet.</p>'}</div></div>`;
  },
};
ACT['view-report'] = async (a) => { const t = await q(sb.rpc('reported_thread', { p_report: a.dataset.id })); modal('Reported conversation', `<div class="thread static">${t.map((m) => `<div class="bub them"><b>${esc(nameOf(m.sender))}:</b> ${esc(m.body)}<small>${fmtDT(m.created_at)}</small></div>`).join('') || '<p class="muted">No messages.</p>'}</div>`, { wide: true }); };
ACT['resolve-report'] = async (a) => { await q(sb.from('message_reports').update({ resolved: true }).eq('id', a.dataset.id)); refresh(); };

/* =============================== SETUP =============================== */
const setup = {
  label: 'Setup', icon: 'gear', perm: 'settings',
  async render() {
    const s = S.school; const mp = await q(sb.rpc('mpesa_configured'));
    const staffList = [...S.names.values()].filter((p) => STAFF_ROLES.includes(p.role)).sort((a, b) => a.full_name.localeCompare(b.full_name));
    return head('Setup', 'School setup', 'Terms, classes, learning areas, school details and M-Pesa.') +
    `<div class="grid">
    <div class="card"><header><h2>Terms</h2></header><div class="list">${S.terms.map((t) => `<div class="li"><div class="grow"><b>${esc(t.name)}</b><small class="block">${t.starts ? fmtD(t.starts) + ' to ' + fmtD(t.ends) : 'No dates'}</small></div>${t.is_current ? '<span class="pill good">current</span>' : `<button class="btn sm ghost" data-a="term-current" data-id="${t.id}">Make current</button>`}</div>`).join('') || '<p class="muted">No terms yet.</p>'}</div>
      <form class="form" data-f="add-term"><label class="f">Name<input name="name" required placeholder="e.g. Term 1 2027"></label><label class="f">Opens<input type="date" name="starts"></label><label class="f">Closes<input type="date" name="ends"></label><label class="f check"><input type="checkbox" name="current" ${S.terms.length ? '' : 'checked'}> Current term</label><div><button class="btn ghost">Add term</button></div></form></div>
    <div class="card"><header><h2>Learning areas</h2></header><div class="chips">${S.subjects.map((x) => `<span class="chip static">${esc(x.name)} <span class="mono muted">${esc(x.short)}</span> <button class="x" data-a="del-subject" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">×</button></span>`).join('')}</div>
      <form class="form" data-f="add-subject"><label class="f">Name<input name="name" required placeholder="e.g. Computer Science"></label><label class="f">Short name<input name="short" required maxlength="8" placeholder="e.g. CS"></label><div><button class="btn ghost">Add</button></div></form></div>
    </div>
    <div class="card"><header><h2>Classes and class teachers</h2></header><div class="tw"><table><thead><tr><th>Class</th><th>Grade</th><th>Class teacher</th><th></th></tr></thead><tbody>${S.classes.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="num">${c.grade ?? ''}</td><td><select data-c="class-teacher" data-id="${c.id}" aria-label="Class teacher for ${esc(c.name)}">${opt('', 'None', c.class_teacher || '')}${staffList.map((p) => opt(p.id, p.full_name, c.class_teacher)).join('')}</select></td><td class="r"><button class="btn sm ghost" data-a="del-class" data-id="${c.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No classes yet.</td></tr>'}</tbody></table></div>
      <form class="form" data-f="add-class"><label class="f">Grade<input type="number" name="grade" min="1" max="12" required placeholder="e.g. 7"></label><label class="f">Stream<input name="stream" placeholder="e.g. Jacaranda, East, Blue"></label><div><button class="btn ghost">Add class</button></div></form></div>
    <div class="grid">
    <div class="card"><header><h2>School details</h2><span class="muted small">Code <b class="mono">${esc(s.code)}</b></span></header><form class="form one" data-f="school-settings"><label class="f">Phone<input name="phone" value="${esc(s.phone || '')}"></label><label class="f">Email<input name="email" type="email" value="${esc(s.email || '')}"></label><label class="f">M-Pesa Paybill shown to parents<input name="paybill" value="${esc(s.paybill || '')}"></label><label class="f">Motto (on report cards)<input name="motto" value="${esc(s.motto || '')}"></label>
      <fieldset class="fs"><legend>Optional features for learners</legend>
        <p class="small">Off by default. When you switch one on, it still stays off for each learner until a parent or guardian allows it from their own account. Do a data protection impact assessment before switching these on.</p>
        <label class="f check"><input type="checkbox" name="learner_chat" ${s.learner_chat ? 'checked' : ''}> Learners can use Messages (classmates and teachers)</label>
        <label class="f check"><input type="checkbox" name="learner_ai" ${s.learner_ai ? 'checked' : ''}> Learners can use Mwalimu AI (questions are sent to an AI service in the United States, without names)</label></fieldset>
      <div><button class="btn ghost">Save school details</button></div></form></div>
    <div class="card"><header><h2>M-Pesa (Daraja)</h2>${mp ? '<span class="pill good">connected</span>' : '<span class="pill warn">not connected</span>'}</header>
      <p class="muted small">Get these from the Safaricom developer portal (daraja.safaricom.co.ke) after your Paybill or Till goes live. Saved keys are never shown again.</p>
      <form class="form" data-f="mpesa-settings"><label class="f">Environment<select name="env">${opt('sandbox', 'Sandbox (testing)')}${opt('production', 'Production (real money)')}</select></label><label class="f">Shortcode<input name="shortcode" required placeholder="Paybill or till"></label><label class="f">Type<select name="type">${opt('paybill', 'Paybill')}${opt('till', 'Till (Buy Goods)')}</select></label><label class="f full">Passkey<input name="passkey" required autocomplete="off"></label><label class="f">Consumer key<input name="key" required autocomplete="off"></label><label class="f">Consumer secret<input name="secret" type="password" required autocomplete="off"></label><div><button class="btn">Save M-Pesa keys</button></div></form>
      ${mp ? '<div class="row"><button class="btn ghost" data-a="register-c2b">Receipt manual Paybill payments automatically</button></div>' : ''}</div></div>
    <div class="card"><header><h2>Your school's data</h2></header><p class="small">Download everything ShuleHub holds for ${esc(s.name)} as a JSON file: for your own records, to answer a data request, or before leaving ShuleHub.</p><div><button class="btn ghost" data-a="export-school">Download all school data</button></div></div>`;
  },
};
FORM['add-term'] = async (d) => {
  if (d.current) await q(sb.from('terms').update({ is_current: false }).eq('school_id', S.me.school_id).eq('is_current', true));
  await q(sb.from('terms').insert({ school_id: S.me.school_id, name: d.name.trim(), starts: d.starts || null, ends: d.ends || null, is_current: !!d.current }));
  await reloadLookups(); toast('Term added');
};
ACT['term-current'] = async (a) => { await q(sb.from('terms').update({ is_current: false }).eq('school_id', S.me.school_id).eq('is_current', true)); await q(sb.from('terms').update({ is_current: true }).eq('id', a.dataset.id)); await reloadLookups(); refresh(); };
FORM['add-subject'] = async (d) => { await q(sb.from('subjects').insert({ school_id: S.me.school_id, name: d.name.trim(), short: d.short.trim(), sort: S.subjects.length + 1 })); await reloadLookups(); };
ACT['del-subject'] = async (a) => { await q(sb.from('subjects').delete().eq('id', a.dataset.id)); await reloadLookups(); refresh(); };
FORM['add-class'] = async (d) => { await q(sb.from('classes').insert({ school_id: S.me.school_id, grade: +d.grade, name: `Grade ${+d.grade}${d.stream ? ' ' + d.stream.trim() : ''}` })); await reloadLookups(); toast('Class added'); };
ACT['del-class'] = async (a) => { await q(sb.from('classes').delete().eq('id', a.dataset.id)); await reloadLookups(); refresh(); };
CHG['class-teacher'] = async (e) => { await q(sb.from('classes').update({ class_teacher: e.value || null }).eq('id', e.dataset.id)); await reloadLookups(); toast('Class teacher saved'); };
FORM['school-settings'] = async (d) => { await q(sb.rpc('update_school_settings', { p_phone: d.phone, p_email: d.email, p_paybill: d.paybill, p_motto: d.motto, p_learner_chat: !!d.learner_chat, p_learner_ai: !!d.learner_ai })); S.school = await q(sb.from('schools').select('*').eq('id', S.me.school_id).single()); toast('Saved'); };
FORM['mpesa-settings'] = async (d) => { await q(sb.rpc('save_mpesa_settings', { p_env: d.env, p_shortcode: d.shortcode.trim(), p_type: d.type, p_passkey: d.passkey.trim(), p_key: d.key.trim(), p_secret: d.secret.trim() })); S.school = await q(sb.from('schools').select('*').eq('id', S.me.school_id).single()); toast('M-Pesa connected'); };
ACT['export-school'] = async (a) => {
  a.disabled = true; a.textContent = 'Preparing…';
  const tables = ['schools', 'terms', 'classes', 'subjects', 'teaching_assignments', 'profiles', 'students', 'guardians', 'exams', 'marks', 'mark_submissions', 'attendance', 'homework', 'exam_papers', 'fee_items', 'fee_charges', 'payments', 'announcements', 'events', 'meetings', 'quizzes', 'quiz_attempts', 'message_reports'];
  const out = { exported_at: new Date().toISOString(), school: S.school.name };
  for (const t of tables) { const { data } = await sb.from(t).select('*').limit(50000); out[t] = data || []; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `shulehub-${S.school.code}-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(link); link.click(); link.remove();
  a.disabled = false; a.textContent = 'Download all school data'; toast('Download started');
};
ACT['register-c2b'] = async () => { await fn('mpesa', { action: 'register_c2b' }); toast('Done. Payments made straight to your Paybill will now be receipted automatically.'); };

/* =============================== SHULEHUB BILLING =============================== */
const billing = {
  label: 'ShuleHub plan', icon: 'receipt', perm: 'fees',
  async render() {
    const [plan, inv, pay] = await Promise.all([q(sb.from('plans').select('*').eq('id', S.school.plan_id).single()), q(sb.from('platform_invoices').select('*').order('created_at', { ascending: false })), q(sb.from('platform_payments').select('*').order('paid_at', { ascending: false }))]);
    const owed = sum(inv.map((i) => i.amount)) - sum(pay.map((p) => p.amount));
    return head('ShuleHub', 'Your ShuleHub plan', `${esc(plan.name)} plan · ${ksh(plan.price_per_term)} per term${plan.max_learners ? ` · up to ${plan.max_learners} learners` : ''}`) +
    `<div class="stats">${stat('Status', esc(S.school.status), S.school.status === 'trial' ? 'trial ends ' + fmtD(S.school.trial_ends) : '')}${stat('Balance', ksh(Math.max(0, owed)), owed > 0 ? 'please pay to avoid interruption' : 'thank you')}</div>
    <div class="card"><div class="tw"><table><thead><tr><th>Date</th><th>Item</th><th class="r">Amount</th></tr></thead><tbody>${[...inv.map((i) => ({ d: i.created_at, t: 'Invoice · ' + i.term_label, a: i.amount })), ...pay.map((p) => ({ d: p.paid_at, t: `Payment · ${p.method} ${p.reference || ''}`, a: -p.amount }))].sort((a, b) => String(b.d).localeCompare(String(a.d))).map((r) => `<tr><td>${fmtD(r.d)}</td><td>${esc(r.t)}</td><td class="r num">${r.a < 0 ? '−' : ''}${ksh(Math.abs(r.a))}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No invoices yet.</td></tr>'}</tbody></table></div></div>`;
  },
};

export const schoolViews = { dashboard, learners, staff, fees, results, announce, welfare, setup, billing };
