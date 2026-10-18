// ShuleHub web app: sign-in, navigation and the page shell.
import { sb, configured, CONFIG, q, esc, toast, closeModal, modal, loginEmail, initials, ROLE_LABEL, LEADER_ROLES, STAFF_ROLES, PERMS, first } from './lib.js';
import { ICON } from './icons.js';
import { S, ACT, FORM, CHG, can, isStaff, nameOf, teachesAnything, hooks } from './state.js';

/* ---------- views ---------- */
import { ownerViews } from './views/owner.js';
import { schoolViews } from './views/school.js';
import { teacherViews } from './views/teacher.js';
import { learnerViews } from './views/learner.js';
import { parentViews } from './views/parent.js';
import { commonViews } from './views/common.js';
import { legalViews, legalFooter } from './views/legal.js';

function navFor() {
  const r = S.me.role;
  const pick = (obj, ids) => ids.filter((id) => obj[id]).map((id) => ({ id, ...obj[id] }));
  if (r === 'super_admin') return pick(ownerViews, ['overview', 'schools', 'payments', 'plans']).concat(pick(commonViews, ['account']));
  if (r === 'student') return pick(learnerViews, ['home', 'results', 'arena', 'tutor', 'homework']).concat(pick(commonViews, ['messages', 'calendar', 'account']));
  if (r === 'parent') return pick(parentViews, ['home', 'results', 'fees', 'meetings']).concat(pick(commonViews, ['messages', 'calendar', 'account']));
  const teach = pick(teacherViews, ['today', 'register', 'gradebook', 'exambuilder', 'homework', 'meetings']);
  if (r === 'teacher') return teach.concat(pick(commonViews, ['messages', 'calendar', 'account']));
  // leadership: what their permissions allow, plus teaching tools if they teach
  const lead = pick(schoolViews, ['dashboard', 'learners', 'staff', 'fees', 'results', 'announce', 'welfare', 'setup', 'billing']).filter((v) => !v.perm || can(v.perm));
  const t = teachesAnything() ? [{ id: '_sep', sep: 'My teaching' }, ...teach.filter((v) => v.id !== 'today')] : [];
  return [...lead, ...t, { id: '_sep2', sep: 'Everyone' }, ...pick(commonViews, ['messages', 'calendar', 'account'])];
}
const allViews = () => ({ ...ownerViews, ...schoolViews, ...teacherViews, ...learnerViews, ...parentViews, ...commonViews });

/* ---------- navigation ---------- */
function go(view, params = {}) {
  S.view = view; S.params = params;
  const h = '#/' + view; if (location.hash !== h) history.replaceState(null, '', h);
  render();
  window.scrollTo?.(0, 0);
}
let renderSeq = 0;
const routeNow = () => (location.hash.startsWith('#/') ? location.hash.slice(2) : '');
const needsAcceptance = () => S.me && (S.me.must_change_password || S.me.terms_version !== CONFIG.legalVersion
  || (['director', 'principal'].includes(S.me.role) && S.school && S.school.terms_version !== CONFIG.legalVersion));
/** Replace the whole screen (login, legal pages…) and move focus to its heading. */
function screen(html, title) {
  const app = document.getElementById('app'); app.innerHTML = html;
  document.title = title ? `${title} · ${CONFIG.appName || 'ShuleHub'}` : CONFIG.appName || 'ShuleHub';
  const h = app.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}
async function render() {
  const app = document.getElementById('app');
  const r = routeNow();
  if (legalViews[r]) { screen(legalViews[r]()); document.title = `${app.querySelector('h1')?.textContent || ''} · ${CONFIG.appName || 'ShuleHub'}`; window.scrollTo?.(0, 0); return; }
  if (!configured) { screen(setupNeeded()); return; }
  if (!S.me) { if (!app.querySelector('form[data-f=signin]')) screen(loginView(), 'Sign in'); return; }
  if (needsAcceptance()) { if (!app.querySelector('form[data-f=accept]')) screen(acceptView(), 'Welcome'); return; }
  if (S.me.role !== 'super_admin' && S.school?.status === 'suspended') { screen(suspendedView(), 'Access paused'); return; }
  const nav = navFor();
  if (!S.view || !nav.find((n) => n.id === S.view)) S.view = nav.find((n) => !n.sep).id;
  const v = allViews()[S.view];
  const shell = document.querySelector('.app');
  if (!shell) app.innerHTML = shellHTML(nav);
  else { document.querySelector('.nav').innerHTML = navHTML(nav); }
  const main = document.getElementById('main');
  const seq = ++renderSeq;
  if (!main.dataset.view || main.dataset.view !== S.view) main.innerHTML = '<div class="loading"><span class="thinking"><i></i><i></i><i></i></span></div>';
  main.dataset.view = S.view;
  try {
    const html = await v.render(S.params);
    if (seq !== renderSeq) return;            // a newer render started
    const firstLoad = main.dataset.shown !== S.view;
    main.innerHTML = trialBanner() + html;
    main.dataset.shown = S.view;
    document.title = `${v.label} · ${CONFIG.appName || 'ShuleHub'}`;
    v.after?.(main);
    // After moving to a new page, put keyboard and screen-reader focus on its heading.
    if (firstLoad && !main.contains(document.activeElement)) { const h = main.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    main.innerHTML = `<div class="card"><h2>This page could not load</h2><p class="muted">${esc(e.message)}</p><div><button class="btn" data-a="reload">Try again</button></div></div>`;
  }
}

function navHTML(nav) {
  return nav.map((n) => n.sep ? `<div class="navsep">${n.sep}</div>` :
    `<button class="navi ${n.id === S.view ? 'on' : ''}" data-a="go" data-v="${n.id}" ${n.id === S.view ? 'aria-current="page"' : ''}>${ICON[n.icon] || ''}<span>${n.label}</span>${n.id === 'messages' && S.unread ? `<em>${S.unread}</em>` : ''}</button>`).join('');
}
function shellHTML(nav) {
  const sub = S.me.role === 'super_admin' ? 'Platform owner' : S.school?.name || '';
  return `<div class="app"><aside class="rail">
    <div class="brand"><span class="mark" aria-hidden="true">S</span><div><b>${esc(CONFIG.appName || 'ShuleHub')}</b><small>${esc(sub)}</small></div></div>
    <nav class="nav" aria-label="Main">${navHTML(nav)}</nav>
    <div class="who"><div class="av" aria-hidden="true">${initials(S.me.full_name)}</div><div class="whotext"><b>${esc(S.me.full_name)}</b><small>${esc(ROLE_LABEL[S.me.role])}</small></div><button class="btn sm ghost" data-a="signout">Sign out</button></div>
    <div class="rail-legal">${legalFooter()}</div>
  </aside><main class="main" id="main" tabindex="-1"></main></div>`;
}
function trialBanner() {
  const s = S.school;
  if (!s || s.status !== 'trial' || !LEADER_ROLES.includes(S.me.role)) return '';
  const days = Math.ceil((new Date(s.trial_ends) - new Date()) / 864e5);
  return `<div class="banner">${days >= 0 ? `Free trial: ${days} day${days === 1 ? '' : 's'} left.` : 'Your free trial has ended.'} Contact ShuleHub to choose a plan.</div>`;
}

/* ---------- screens before the app ---------- */
function setupNeeded() {
  return `<div class="login"><div class="brand"><span class="mark" aria-hidden="true">S</span><div><b>ShuleHub</b><small>Setup needed</small></div></div>
  <div class="card"><h1>Connect ShuleHub to your database</h1><p>Open <code>js/config.js</code> and paste your Supabase project URL and anon (public) key. The README walks through every step.</p></div>${legalFooter()}</div>`;
}
function loginView() {
  return `<main class="login" id="main" tabindex="-1">
   <div class="lhead"><div><div class="brand" style="margin-bottom:22px"><span class="mark" aria-hidden="true">S</span><div><b>${esc(CONFIG.appName || 'ShuleHub')}</b><small>School management for Kenyan schools</small></div></div>
     <h1>Every school, every role, <span>one login.</span></h1>
     <p class="lede">Fees and M-Pesa payments, CBE marks and report cards, attendance, messages, parent meetings and Mwalimu AI, in one place.</p></div>
   <form class="card loginbox" data-f="signin" autocomplete="on" aria-labelledby="signin-h">
     <h2 id="signin-h">Sign in</h2>
     <label class="f" for="login-id">Email, phone number or admission number<input name="id" id="login-id" required autocomplete="username" placeholder="e.g. 0712 345 678"></label>
     <label class="f" for="login-pw">Password<input name="password" id="login-pw" type="password" required autocomplete="current-password"></label>
     <label class="f" for="login-code">School code (learners only)<input name="code" id="login-code" autocomplete="organization" placeholder="e.g. JAC" aria-describedby="code-hint" style="text-transform:uppercase"><small id="code-hint" class="muted">Learners: sign in with your admission number and your school's code.</small></label>
     <button class="btn">Sign in</button>
     <p class="muted small">No account? Your school creates it for you. Forgot your password? Ask your school office to reset it, or <button type="button" class="linkbtn" data-a="forgot">send a reset link to my email</button>.</p>
   </form></div>
   <section aria-labelledby="feat-h"><h2 id="feat-h" class="eyebrow">What schools can do with it</h2><ul class="why">${[
     ['money', 'Fees', 'Fee balances, statements and M-Pesa payments, with SMS reminders to parents'],
     ['clip', 'Results', 'Teachers enter marks; CBE levels (EE, ME, AE, BE) and report cards are worked out from them'],
     ['users', 'Attendance', 'Daily registers, with learners under 85% attendance flagged'],
     ['video', 'Parents', 'Messages, and video or audio meetings with teachers'],
     ['pen', 'Teachers', 'Mwalimu AI drafts exam papers and marking schemes for teachers to check'],
     ['spark', 'Learners', 'Quizzes, and Mwalimu AI hints in English or Kiswahili, when the school and a parent allow it']].map(([i, t, d]) => `<li>${ICON[i]}<span class="s">${t}</span><span class="p">${d}</span></li>`).join('')}</ul></section>
   ${legalFooter()}
  </main>`;
}
function acceptView() {
  const m = S.me; const learner = m.role === 'student';
  const forSchool = ['director', 'principal'].includes(m.role) && S.school && S.school.terms_version !== CONFIG.legalVersion;
  const link = (id, label) => `<a href="#/${id}" target="_blank" rel="noopener">${label}<span class="sr-only"> (opens in a new tab)</span></a>`;
  return `<main class="login narrow" id="main" tabindex="-1"><div class="brand"><span class="mark" aria-hidden="true">S</span><div><b>Welcome, ${esc(first(m.full_name))}</b><small>${esc(S.school?.name || 'ShuleHub')}</small></div></div>
  <form class="card" data-f="accept"><h1>${m.must_change_password ? 'Before you start' : 'Our terms have changed'}</h1>
  ${m.must_change_password ? `<p class="muted">You signed in with a temporary password. Choose one only you know, at least 8 characters.</p>
  <label class="f" for="np1">New password<input type="password" name="p1" id="np1" minlength="8" required autocomplete="new-password"></label>
  <label class="f" for="np2">Type it again<input type="password" name="p2" id="np2" minlength="8" required autocomplete="new-password"></label>` : `<p class="muted">Please read the updated documents and confirm to continue.</p>`}
  ${learner ? `<div class="note"><b>In simple words:</b> your school uses ShuleHub for your marks, attendance and homework. Only you, your parents and your teachers can see them. Be kind in chats, and press Report if anything upsets you. ${link('privacy', 'Read more')}.</div>` : ''}
  <label class="f check"><input type="checkbox" name="agree" required> <span>I have read the ${link('privacy', 'Privacy notice')}${learner ? '' : `, ${link('terms', 'Terms of service')} and ${link('cookies', 'Cookie policy')}`}${learner ? ' and I will follow the school rules for using ShuleHub' : ' and agree to the Terms'}.</span></label>
  ${forSchool ? `<label class="f check"><input type="checkbox" name="school" required> <span>I am authorised to accept the ${link('terms', 'Terms of service')} and ${link('refunds', 'Refund policy')} on behalf of ${esc(S.school.name)}, and the school will obtain parent or guardian consent for every learner before admitting them.</span></label>` : ''}
  <div class="row"><button class="btn">Continue</button><button type="button" class="btn ghost" data-a="signout">Sign out</button></div></form>${legalFooter()}</main>`;
}
function suspendedView() {
  return `<main class="login narrow" id="main" tabindex="-1"><div class="brand"><span class="mark" aria-hidden="true">S</span><div><b>${esc(S.school.name)}</b><small>ShuleHub</small></div></div>
  <div class="card"><h1>Access is paused</h1><p>${esc(S.school.name)}'s ShuleHub account is currently suspended. The school's records have not been deleted. Please contact the school office${S.school.phone ? ` on <b>${esc(S.school.phone)}</b>` : ''}.</p><div><button class="btn ghost" data-a="signout">Sign out</button></div></div>${legalFooter()}</main>`;
}

/* ---------- session ---------- */
async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { S.me = null; return; }
  const me = await q(sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
  if (!me) { await sb.auth.signOut(); toast('This login has no ShuleHub profile. Ask your school to set you up.', 'bad'); S.me = null; return; }
  if (!me.active) { await sb.auth.signOut(); toast('This account has been deactivated. Contact your school.', 'bad'); S.me = null; return; }
  S.me = me;
  if (me.school_id) {
    S.school = await q(sb.from('schools').select('*').eq('id', me.school_id).single());
    if (S.school.status === 'suspended') return;
    S.features = (await q(sb.from('plans').select('features').eq('id', S.school.plan_id).maybeSingle()))?.features || [];
    const [classes, subjects, terms, perms, names, asg] = await Promise.all([
      q(sb.from('classes').select('*').order('grade').order('name')),
      q(sb.from('subjects').select('*').order('sort').order('name')),
      q(sb.from('terms').select('*').order('starts', { ascending: false, nullsFirst: false })),
      q(sb.from('role_permissions').select('perm').eq('role', me.role)),
      q(sb.from('directory').select('*')),
      isStaff() ? q(sb.from('teaching_assignments').select('*').eq('teacher_id', me.id)) : Promise.resolve([]),
    ]);
    Object.assign(S, { classes, subjects, terms, assignments: asg });
    S.perms = new Set(perms.map((p) => p.perm));
    if (me.role === 'director') S.perms = new Set(PERMS.map((p) => p[0]));
    S.names = new Map(names.map((n) => [n.id, n]));
    sb.rpc('touch_school').then(() => {});
    listenForMessages();
  }
}
async function reloadLookups() {
  const [classes, subjects, terms, names] = await Promise.all([
    q(sb.from('classes').select('*').order('grade').order('name')),
    q(sb.from('subjects').select('*').order('sort').order('name')),
    q(sb.from('terms').select('*').order('starts', { ascending: false, nullsFirst: false })),
    q(sb.from('directory').select('*')),
  ]);
  Object.assign(S, { classes, subjects, terms });
  S.names = new Map(names.map((n) => [n.id, n]));
  if (isStaff()) S.assignments = await q(sb.from('teaching_assignments').select('*').eq('teacher_id', S.me.id));
}

let channel = null;
function listenForMessages() {
  channel?.unsubscribe();
  channel = sb.channel('inbox-' + S.me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${S.me.id}` }, (p) => {
      const m = p.new;
      if (S.view === 'messages' && S.params.with === m.sender) { window.dispatchEvent(new CustomEvent('shulehub:message', { detail: m })); return; }
      S.unread++; toast(`New message from ${nameOf(m.sender)}`);
      const nav = document.querySelector('.nav'); if (nav) nav.innerHTML = navHTML(navFor());
    }).subscribe();
  sb.from('messages').select('id', { count: 'exact', head: true }).eq('recipient', S.me.id).is('read_at', null).then(({ count }) => {
    S.unread = count || 0; const nav = document.querySelector('.nav'); if (nav && S.unread) nav.innerHTML = navHTML(navFor());
  });
}

/* ---------- built-in actions ---------- */
ACT.go = (a) => go(a.dataset.v, a.dataset.with ? { with: a.dataset.with } : {});
ACT.reload = () => render();
ACT['close-modal'] = () => closeModal();
ACT.signout = async () => { channel?.unsubscribe(); await sb.auth.signOut(); Object.assign(S, { me: null, school: null, view: null, perms: new Set(), names: new Map(), unread: 0, mine: null, kids: null, child: null, quizzes: null, features: [] }); document.getElementById('app').innerHTML = ''; render(); };
ACT.forgot = async () => {
  const id = document.getElementById('login-id').value.trim();
  if (!id.includes('@')) { toast('Email reset only works for accounts with an email address. Otherwise ask your school office to reset your password.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(id, { redirectTo: location.origin + location.pathname });
  toast(error ? error.message : 'If that email has an account, a reset link is on its way.');
};
FORM.signin = async (d) => {
  const code = (d.code || '').trim().toUpperCase();
  const email = loginEmail(d.id, code);
  if (!email) { toast('Learners: enter your admission number and your school code.', 'bad'); return false; }
  const btn = document.querySelector('form[data-f=signin] .btn'); btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password: d.password });
  if (error) { btn.disabled = false; btn.textContent = 'Sign in'; toast(/invalid/i.test(error.message) ? 'Those details did not match. Check them, or ask your school to reset your password.' : error.message, 'bad'); return false; }
  await boot();
  return false;
};
FORM.accept = async (d) => {
  if (S.me.must_change_password) {
    if (d.p1 !== d.p2) { toast('The two passwords are different. Type the same password in both boxes.', 'bad'); document.getElementById('np2')?.focus(); return false; }
    const { error } = await sb.auth.updateUser({ password: d.p1 });
    if (error) { toast(error.message, 'bad'); return false; }
    await q(sb.rpc('password_changed'));
    S.me.must_change_password = false;
  }
  await q(sb.rpc('accept_terms', { p_version: CONFIG.legalVersion }));
  S.me.terms_version = CONFIG.legalVersion;
  if (d.school) { await q(sb.rpc('accept_school_terms', { p_version: CONFIG.legalVersion })); S.school.terms_version = CONFIG.legalVersion; }
  toast('Thank you. Welcome to ShuleHub!');
  document.getElementById('app').innerHTML = ''; render(); return false;
};

/* ---------- event wiring ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const f = ACT[a.dataset.a]; if (!f) return;
  if (a.tagName === 'A' && a.getAttribute('href') && !a.dataset.prevent) return;
  e.preventDefault();
  Promise.resolve(f(a, e)).catch((err) => toast(err.message, 'bad'));
});
document.addEventListener('change', (e) => {
  const c = e.target.dataset?.c; if (!c || !CHG[c]) return;
  Promise.resolve(CHG[c](e.target, e)).catch((err) => toast(err.message, 'bad'));
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-f]'); if (!f) return;
  e.preventDefault();
  const h = FORM[f.dataset.f]; if (!h) return;
  const d = {}; for (const [k, v] of new FormData(f).entries()) d[k] = typeof v === 'string' ? v : v;
  const btn = f.querySelector('button:not([type=button])'); const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; }
  try {
    const r = await h(d, f);
    if (r !== false) { f.reset?.(); await render(); }
  } catch (err) { toast(err.message, 'bad'); }
  finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = label; } }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/')) return;
  const v = location.hash.slice(2);
  if (legalViews[v]) { render(); return; }
  if (document.querySelector('.legal')) document.getElementById('app').innerHTML = '';   // leaving a legal page
  if (S.me && v && v !== S.view) go(v); else render();
});

/* ---------- start ---------- */
Object.assign(hooks, { go, render, reloadLookups, modal });
async function boot() {
  if (configured) { try { await loadSession(); } catch (e) { toast(e.message, 'bad'); S.me = null; } }
  if (recovering && S.me) S.me.must_change_password = true;
  const v = routeNow(); if (v && !legalViews[v]) S.view = v;
  document.getElementById('app').innerHTML = '';
  render();
}
const recovering = /type=recovery/.test(location.hash);
if (configured) {
  sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' && S.me) { S.me.must_change_password = true; render(); } });
}
boot();