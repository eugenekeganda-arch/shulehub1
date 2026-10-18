// Views and helpers every role uses: messages, calendar, account, meetings, announcements.
import { sb, q, fn, esc, toast, head, opt, dateChip, fmtD, fmtDT, fmtT, initials, first, empty, modal, closeModal, ROLE_LABEL, STAFF_ROLES, LEADER_ROLES, CONFIG, showPhone } from '../lib.js';
import { S, ACT, FORM, CHG, can, isStaff, nameOf, className, go, refresh } from '../state.js';

/* ---------------- announcements card ---------------- */
export async function announcementsCard(limit = 4) {
  const xs = await q(sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(limit));
  return `<div class="card"><header><h2>Notices</h2></header>${xs.length ? `<div class="list">${xs.map((a) => `<div class="li">${dateChip(a.created_at)}<div class="grow"><b>${esc(a.title)}</b><p class="muted pre">${esc(a.body)}</p><small>${esc(nameOf(a.created_by))} · ${esc(a.audience)}${a.sms ? ' · also sent by SMS' : ''}</small></div></div>`).join('')}</div>` : '<p class="muted">No notices yet.</p>'}</div>`;
}

/* ---------------- meetings ---------------- */
export const toEAT = (date, time) => new Date(`${date}T${time}:00+03:00`).toISOString();
export function meetingRow(m, viewer) {
  const other = viewer === 'parent' ? nameOf(m.teacher_id) : nameOf(m.parent_id);
  const tone = { confirmed: 'good', requested: 'warn', cancelled: 'bad', done: '' }[m.status];
  const isTeacher = m.teacher_id === S.me.id;
  const upcoming = new Date(m.starts_at) > new Date(Date.now() - 2 * 3600e3);
  return `<div class="li">${dateChip(m.starts_at)}<div class="grow"><b>${esc(m.topic)}</b><small class="block">${esc(other)}${m.student_id && m.student_name ? ` · about ${esc(first(m.student_name))}` : ''} · ${fmtT(m.starts_at)} · ${m.mode === 'video' ? 'Video call' : 'Audio call'}</small></div>
  <div class="row col-end"><span class="pill ${tone}">${m.status}</span>
   ${m.status === 'confirmed' && upcoming ? `<button class="btn sm" data-a="join-meeting" data-id="${m.id}" data-room="${esc(m.room)}" data-mode="${m.mode}">${m.mode === 'video' ? 'Join video' : 'Join audio'}</button>` : ''}
   ${isTeacher && m.status === 'requested' ? `<button class="btn sm good" data-a="meeting-status" data-id="${m.id}" data-s="confirmed">Confirm</button>` : ''}
   ${m.status === 'confirmed' && !upcoming && isTeacher ? `<button class="btn sm ghost" data-a="meeting-status" data-id="${m.id}" data-s="done">Mark done</button>` : ''}
   ${['requested', 'confirmed'].includes(m.status) && upcoming ? `<button class="btn sm ghost" data-a="meeting-status" data-id="${m.id}" data-s="cancelled">Cancel</button>` : ''}</div></div>`;
}
ACT['meeting-status'] = async (a) => {
  await q(sb.from('meetings').update({ status: a.dataset.s }).eq('id', a.dataset.id));
  toast({ confirmed: 'Meeting confirmed. The parent can now join.', cancelled: 'Meeting cancelled.', done: 'Marked as done.' }[a.dataset.s]);
  if (a.dataset.s === 'confirmed') fn('sms', { action: 'meeting', meeting_id: a.dataset.id }).catch(() => {});
  refresh();
};
ACT['join-meeting'] = (a) => {
  const domain = CONFIG.jitsiDomain || 'meet.jit.si';
  const room = 'ShuleHub-' + a.dataset.room;
  const audio = a.dataset.mode === 'audio';
  if (CONFIG.jitsiEmbed) {
    const body = modal(audio ? 'Audio call' : 'Video call', `<div id="jitsi" class="jitsi"></div><p class="muted" style="font-size:.84rem">Allow your microphone${audio ? '' : ' and camera'} when the browser asks. Close this window to leave the call.</p>`, { wide: true, onClose: () => window._jitsi?.dispose() });
    const start = () => {
      window._jitsi = new window.JitsiMeetExternalAPI(domain, { roomName: (CONFIG.jitsiAppId ? CONFIG.jitsiAppId + '/' : '') + room, parentNode: body.querySelector('#jitsi'),
        userInfo: { displayName: S.me.full_name }, configOverwrite: { startWithVideoMuted: audio, startAudioOnly: audio, prejoinPageEnabled: false } });
    };
    if (window.JitsiMeetExternalAPI) start();
    else { const s = document.createElement('script'); s.src = `https://${domain}/external_api.js`; s.onload = start; s.onerror = () => toast('The call service could not load. Check your connection.', 'bad'); document.head.appendChild(s); }
  } else {
    const url = `https://${domain}/${room}#userInfo.displayName=${encodeURIComponent(JSON.stringify(S.me.full_name))}${audio ? '&config.startAudioOnly=true&config.startWithVideoMuted=true' : ''}`;
    window.open(url, '_blank', 'noopener');
  }
};

/* ---------------- messages ---------------- */
async function allowedContacts() {
  const all = [...S.names.values()].filter((p) => p.id !== S.me.id);
  const r = S.me.role;
  if (STAFF_ROLES.includes(r)) {
    // Learners can only be messaged if the school and a parent have switched chat on for them.
    const ok = S.school?.learner_chat ? new Set((await q(sb.from('students').select('user_id').eq('allow_chat', true).not('user_id', 'is', null))).map((x) => x.user_id)) : new Set();
    return all.filter((p) => p.role !== 'student' || ok.has(p.id));
  }
  const staffOfClasses = async (classIds) => {
    if (!classIds.length) return new Set();
    const ta = await q(sb.from('teaching_assignments').select('teacher_id').in('class_id', classIds));
    const ids = new Set(ta.map((t) => t.teacher_id));
    S.classes.filter((c) => classIds.includes(c.id) && c.class_teacher).forEach((c) => ids.add(c.class_teacher));
    return ids;
  };
  if (r === 'student') {
    const me = (await q(sb.from('students').select('allow_chat').eq('user_id', S.me.id).maybeSingle()));
    if (!S.school?.learner_chat || !me?.allow_chat) return [];
    const mine = S.names.get(S.me.id)?.learner_class_id;
    const teachers = await staffOfClasses(mine ? [mine] : []);
    return all.filter((p) => (p.role === 'student' && p.learner_class_id && p.learner_class_id === mine) || teachers.has(p.id) || ['principal', 'deputy_principal', 'head_teacher'].includes(p.role));
  }
  if (r === 'parent') {
    const kids = await q(sb.from('students').select('class_id'));
    const teachers = await staffOfClasses([...new Set(kids.map((k) => k.class_id).filter(Boolean))]);
    return all.filter((p) => teachers.has(p.id) || LEADER_ROLES.includes(p.role));
  }
  return [];
}
const roleLine = (p) => p.role === 'student' ? `Learner · ${className(p.learner_class_id)}` : ROLE_LABEL[p.role];

export const commonViews = {
  messages: {
    label: 'Messages', icon: 'chat',
    async render(params) {
      const msgs = await q(sb.from('messages').select('*').or(`sender.eq.${S.me.id},recipient.eq.${S.me.id}`).order('created_at', { ascending: false }).limit(400));
      const partners = []; const last = new Map();
      for (const m of msgs) { const o = m.sender === S.me.id ? m.recipient : m.sender; if (!last.has(o)) { last.set(o, m); partners.push(o); } }
      const allowed = await allowedContacts();
      const w = params.with || partners[0] || null;
      if (w !== S.params.with) S.params.with = w;
      const thread = w ? msgs.filter((m) => m.sender === w || m.recipient === w).reverse() : [];
      const unreadFrom = new Set(msgs.filter((m) => m.recipient === S.me.id && !m.read_at).map((m) => m.sender));
      if (w && unreadFrom.has(w)) { sb.from('messages').update({ read_at: new Date().toISOString() }).eq('sender', w).eq('recipient', S.me.id).is('read_at', null).then(() => {}); S.unread = Math.max(0, S.unread - msgs.filter((m) => m.sender === w && m.recipient === S.me.id && !m.read_at).length); }
      const canWrite = w && allowed.some((p) => p.id === w);
      if (S.me.role === 'student' && !allowed.length && !partners.length) return head('Messages', 'Messages') + `<div class="empty"><p>Messages are switched off for you. They need ${S.school?.learner_chat ? '' : 'your school to switch them on, and then '}a parent or guardian to allow them from their ShuleHub account.</p></div>`;
      const sub = S.me.role === 'student' ? 'Private chats with classmates and teachers. Be kind. If anything makes you uncomfortable, tap "Report" and a teacher will help.' : 'Private messages. They are kept by the school.';
      return head('Messages', 'Messages', sub) + `
      <div class="chat"><div class="contacts">
        <div class="newmsg"><select data-c="new-chat" aria-label="Start a new conversation"><option value="">New message to…</option>${allowed.sort((a, b) => a.full_name.localeCompare(b.full_name)).map((p) => opt(p.id, `${p.full_name} · ${roleLine(p)}`)).join('')}</select></div>
        ${partners.map((id) => { const m = last.get(id); return `<button class="contact ${id === w ? 'on' : ''}" data-a="go" data-v="messages" data-with="${id}"><div class="av">${initials(nameOf(id))}</div><div class="ct"><b>${esc(nameOf(id))}${unreadFrom.has(id) && id !== w ? ' <span class="dot-new"></span>' : ''}</b><small>${esc(m.body)}</small></div></button>`; }).join('') || '<p class="muted pad">No conversations yet. Choose someone above.</p>'}
      </div>
      <div class="thread-wrap">${w ? `<div class="thread-head"><div><b>${esc(nameOf(w))}</b><small class="block">${esc(roleLine(S.names.get(w) || {}))}</small></div>${S.me.role === 'student' ? `<button class="btn sm ghost" data-a="report-chat" data-id="${w}">Report</button>` : ''}</div>
        <div class="thread" id="thread" aria-live="polite">${thread.map(bubble).join('') || '<p class="muted center">Say hello to start the conversation.</p>'}</div>
        ${canWrite ? `<form class="compose" data-f="send-message"><input name="body" id="msg-input" aria-label="Message" placeholder="Type a message" autocomplete="off" required maxlength="2000"><button class="btn">Send</button></form>` : '<p class="note" style="margin:12px">You can read this conversation but cannot reply.</p>'}`
        : '<div class="center muted pad">Pick a conversation or start a new one.</div>'}</div></div>`;
    },
    after() { const t = document.getElementById('thread'); if (t) t.scrollTop = t.scrollHeight; },
  },

  calendar: {
    label: 'Calendar', icon: 'cal',
    async render() {
      const ev = await q(sb.from('events').select('*').order('day'));
      const t = new Date().toISOString().slice(0, 10);
      const up = ev.filter((e) => e.day >= t), past = ev.filter((e) => e.day < t).reverse().slice(0, 10);
      const row = (e) => `<div class="li">${dateChip(e.day)}<div class="grow"><b>${esc(e.title)}</b><small class="block">${fmtD(e.day)}</small></div><span class="pill acc">${esc(e.kind)}</span>${can('calendar') ? `<button class="btn sm ghost" data-a="del-event" data-id="${e.id}" aria-label="Delete ${esc(e.title)}">Remove</button>` : ''}</div>`;
      return head('Calendar', 'School calendar', 'Term dates, exams and events for everyone at the school.') +
        `<div class="card"><header><h2>Coming up</h2></header>${up.length ? `<div class="list">${up.map(row).join('')}</div>` : '<p class="muted">Nothing scheduled yet.</p>'}</div>
        ${can('calendar') ? `<div class="card"><header><h2>Add an event</h2></header><form class="form" data-f="add-event"><label class="f">Date<input type="date" name="day" required></label><label class="f grow2">Title<input name="title" required maxlength="120" placeholder="e.g. Half-term break begins"></label><label class="f">Type<select name="kind">${['Term', 'Exams', 'Event', 'Parents', 'Staff', 'Holiday', 'Sports'].map((k) => opt(k, k)).join('')}</select></label><div><button class="btn">Add event</button></div></form></div>` : ''}
        ${past.length ? `<div class="card"><header><h2>Recent</h2></header><div class="list">${past.map(row).join('')}</div></div>` : ''}`;
    },
  },

  account: {
    label: 'My account', icon: 'user',
    async render() {
      const m = S.me;
      return head('Account', esc(m.full_name), `${ROLE_LABEL[m.role]}${S.school ? ' · ' + esc(S.school.name) : ''}`) +
        `<div class="grid"><div class="card"><header><h2>Sign-in details</h2></header>
          <div class="kv"><span>Sign in with</span><b class="mono">${esc(m.login_id || m.email || '')}</b>${m.role === 'student' ? `<span>School code</span><b class="mono">${esc(S.school?.code)}</b>` : ''}<span>Phone</span><b class="mono">${esc(showPhone(m.phone)) || '–'}</b></div>
          <p class="small muted">Your phone number is used only for ShuleHub SMS (sign-in details, school notices, fee and meeting reminders), never for marketing.</p>
          <form class="form" data-f="my-phone"><label class="f">Update phone (for SMS)<input name="phone" type="tel" value="${esc(showPhone(m.phone))}" placeholder="07xx xxx xxx"></label><div><button class="btn ghost">Save phone</button></div></form></div>
        <div class="card"><header><h2>Change password</h2></header><form class="form one" data-f="change-password"><label class="f">New password<input type="password" name="p1" minlength="8" required autocomplete="new-password"></label><label class="f">Type it again<input type="password" name="p2" minlength="8" required autocomplete="new-password"></label><div><button class="btn">Change password</button></div></form></div></div>
        <div class="card"><header><h2>Your data</h2></header>
          <p>Download a copy of the information ShuleHub holds about you${m.role === 'parent' ? ' and your children' : ''}. To correct or delete anything, contact ${m.role === 'super_admin' ? 'the person responsible for the database' : 'your school office'}. You accepted the terms and privacy notice dated ${esc(m.terms_version || '–')}.</p>
          <div class="row"><button class="btn ghost" data-a="download-my-data">Download my data</button><a class="btn ghost" href="#/privacy">Read the Privacy notice</a></div></div>`;
    },
  },
};

const bubble = (m) => `<div class="bub ${m.sender === S.me.id ? 'me' : 'them'}">${esc(m.body)}<small>${fmtDT(m.created_at)}</small></div>`;

CHG['new-chat'] = (e) => { if (e.value) go('messages', { with: e.value }); };
FORM['send-message'] = async (d) => {
  const w = S.params.with; if (!w || !d.body.trim()) return false;
  const row = await q(sb.from('messages').insert({ school_id: S.me.school_id, sender: S.me.id, recipient: w, body: d.body.trim() }).select().single());
  const t = document.getElementById('thread'); t.querySelector('.center')?.remove(); t.insertAdjacentHTML('beforeend', bubble(row)); t.scrollTop = t.scrollHeight;
  const inp = document.getElementById('msg-input'); inp.value = ''; inp.focus();
  return false;
};
window.addEventListener('shulehub:message', (e) => {
  const t = document.getElementById('thread'); if (!t) return;
  t.querySelector('.center')?.remove(); t.insertAdjacentHTML('beforeend', bubble(e.detail)); t.scrollTop = t.scrollHeight;
  sb.from('messages').update({ read_at: new Date().toISOString() }).eq('id', e.detail.id).then(() => {});
});
ACT['report-chat'] = (a) => {
  modal('Report a problem', `<form data-f="report-chat" class="form one"><input type="hidden" name="who" value="${esc(a.dataset.id)}"><p>Tell a teacher what happened in your chat with <b>${esc(nameOf(a.dataset.id))}</b>. Only the school welfare team will see this.</p><label class="f">What happened? (optional)<textarea name="note" maxlength="600"></textarea></label><div><button class="btn">Send report</button></div></form>`);
};
FORM['report-chat'] = async (d) => {
  await q(sb.from('message_reports').insert({ school_id: S.me.school_id, reporter: S.me.id, reported_user: d.who, note: d.note || null }));
  closeModal(); toast('Thank you. A teacher on the welfare team will look into it.'); return false;
};
FORM['add-event'] = async (d) => { await q(sb.from('events').insert({ school_id: S.me.school_id, day: d.day, title: d.title, kind: d.kind, created_by: S.me.id })); toast('Event added'); };
ACT['del-event'] = async (a) => { await q(sb.from('events').delete().eq('id', a.dataset.id)); toast('Event removed'); refresh(); };
FORM['change-password'] = async (d) => {
  if (d.p1 !== d.p2) throw new Error('The two passwords are different.');
  const { error } = await sb.auth.updateUser({ password: d.p1 }); if (error) throw new Error(error.message);
  toast('Password changed');
};
ACT['download-my-data'] = async (a) => {
  a.disabled = true;
  const out = { exported_at: new Date().toISOString(), profile: S.me };
  const [msgs, meets] = await Promise.all([
    q(sb.from('messages').select('*').or(`sender.eq.${S.me.id},recipient.eq.${S.me.id}`)),
    S.me.school_id ? q(sb.from('meetings').select('*').or(`teacher_id.eq.${S.me.id},parent_id.eq.${S.me.id}`)) : [],
  ]);
  out.messages = msgs; out.meetings = meets;
  if (['student', 'parent'].includes(S.me.role)) {
    const kids = await q(sb.from('students').select('*'));
    const ids = kids.map((k) => k.id); const has = ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
    const [marks, att, charges, pays] = await Promise.all(['marks', 'attendance', 'fee_charges', 'payments'].map((t) => q(sb.from(t).select('*').in('student_id', has))));
    Object.assign(out, { learners: kids, marks, attendance: att, fee_charges: charges, payments: pays });
    if (S.me.role === 'student') out.quiz_attempts = await q(sb.from('quiz_attempts').select('*').eq('user_id', S.me.id));
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'my-shulehub-data.json'; document.body.appendChild(link); link.click(); link.remove();
  a.disabled = false; toast('Download started');
};
FORM['my-phone'] = async (d) => {
  await fn('manage-users', { action: 'update_person', user_id: S.me.id, phone: d.phone });
  S.me = await q(sb.from('profiles').select('*').eq('id', S.me.id).single()); toast('Phone saved');
};
export { isStaff };
