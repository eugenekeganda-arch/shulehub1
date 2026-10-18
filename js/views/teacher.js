// Teaching tools: register, gradebook, exam builder, homework, parent meetings.
// Also shown to school leaders who teach.
import { sb, q, fn, esc, r1, avg, toast, head, opt, stat, fmtD, today, modal, closeModal, setModalBody, lvPill, dateChip, empty, first, md } from '../lib.js';
import { S, ACT, FORM, CHG, can, nameOf, className, subj, currentTerm, refresh, go, myClasses, hasFeature } from '../state.js';
import { announcementsCard, meetingRow, toEAT } from './common.js';

const classesFor = () => myClasses(can('learners') || can('results'));
const combos = () => {
  if (can('results')) return S.classes.flatMap((c) => S.subjects.map((s) => ({ class_id: c.id, subject_id: s.id })));
  return S.assignments.map((a) => ({ class_id: a.class_id, subject_id: a.subject_id }));
};

/* =============================== TODAY =============================== */
const todayView = {
  label: 'Today', icon: 'home',
  async render() {
    const [meets, draft, hw] = await Promise.all([
      q(sb.from('meetings').select('*').eq('teacher_id', S.me.id).in('status', ['requested', 'confirmed']).gte('starts_at', new Date(Date.now() - 3 * 3600e3).toISOString()).order('starts_at')),
      q(sb.from('exams').select('*').eq('status', 'draft').order('created_at', { ascending: false }).limit(1)),
      q(sb.from('homework').select('*').eq('created_by', S.me.id).gte('due', today()).order('due')),
    ]);
    let missing = [];
    if (draft[0] && S.assignments.length) {
      const subs = await q(sb.from('mark_submissions').select('class_id, subject_id').eq('exam_id', draft[0].id));
      missing = S.assignments.filter((a) => !subs.some((s) => s.class_id === a.class_id && s.subject_id === a.subject_id));
    }
    const ct = S.classes.filter((c) => c.class_teacher === S.me.id);
    return head(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), `Habari, ${esc(first(S.me.full_name) === 'Mr' ? S.me.full_name : S.me.full_name.split(' ').slice(0, 2).join(' '))}`,
      `${S.assignments.length ? [...new Set(S.assignments.map((a) => subj(a.subject_id)?.name))].join(', ') : 'No classes assigned yet'}${ct.length ? ' · class teacher of ' + ct.map((c) => esc(c.name)).join(', ') : ''}`) +
    (!S.assignments.length && !ct.length ? `<p class="note">You have not been assigned any classes yet. Ask your principal or deputy to assign you under Staff & roles.</p>` : '') +
    `<div class="stats">${stat('Classes', new Set(S.assignments.map((a) => a.class_id)).size, `${S.assignments.length} class-subject pairs`)}${draft[0] ? stat('Marks to submit', missing.length, esc(draft[0].name), S.assignments.length ? 100 - missing.length / S.assignments.length * 100 : null) : ''}${stat('Meetings', meets.length, meets.filter((m) => m.status === 'requested').length + ' waiting for you')}${stat('Homework out', hw.length)}</div>
    ${missing.length ? `<div class="card accent"><header><div><h2>${esc(draft[0].name)}: ${missing.length} mark set${missing.length > 1 ? 's' : ''} still to submit</h2><p class="muted">${missing.map((m) => `${esc(subj(m.subject_id)?.short)} ${esc(className(m.class_id))}`).join(' · ')}</p></div><button class="btn" data-a="go" data-v="gradebook">Open gradebook</button></header></div>` : ''}
    <div class="g2"><div class="card"><header><h2>Parent meetings</h2><button class="btn sm ghost" data-a="go" data-v="meetings">All</button></header><div class="list">${meets.map((m) => meetingRow(m, 'teacher')).join('') || '<p class="muted">Nothing booked.</p>'}</div></div>
    <div class="card"><header><h2>Homework due</h2><button class="btn sm ghost" data-a="go" data-v="homework">Set homework</button></header><div class="list">${hw.map((h) => `<div class="li">${dateChip(h.due)}<div class="grow"><b>${esc(h.title)}</b><small class="block">${esc(className(h.class_id))}</small></div></div>`).join('') || '<p class="muted">None due.</p>'}</div></div></div>
    ${await announcementsCard(3)}`;
  },
};

/* =============================== REGISTER =============================== */
const register = {
  label: 'Register', icon: 'users',
  async render(p) {
    const cls = classesFor(); if (!cls.length) return head('Register', 'Daily register') + empty('You are not assigned to any class yet.');
    const c = cls.find((x) => x.id === p.cls) || cls[0]; const day = p.day || today();
    const learners = await q(sb.from('students').select('id, full_name, adm_no').eq('class_id', c.id).eq('active', true).order('full_name'));
    const ids = learners.map((l) => l.id);
    const [att, rates] = await Promise.all([
      ids.length ? q(sb.from('attendance').select('student_id, status').eq('day', day).in('student_id', ids)) : [],
      q(sb.rpc('attendance_rates', { p_days: 20 })),
    ]);
    const st = new Map(att.map((a) => [a.student_id, a.status])); const rt = new Map(rates.map((r) => [r.student_id, r]));
    const n = { P: 0, L: 0, A: 0 }; learners.forEach((l) => { const s = st.get(l.id); if (s) n[s]++; });
    S.params.cls = c.id; S.params.day = day;
    return head('Register', 'Daily register', 'Tap P (present), L (late) or A (absent). Learners under 85% over the last 20 days are flagged to the class teacher and deputy.',
      `<select data-c="reg-cls" aria-label="Class">${cls.map((x) => opt(x.id, x.name, c.id)).join('')}</select><input type="date" data-c="reg-day" value="${day}" max="${today()}" aria-label="Date">`) +
    `<div class="stats">${stat('Present', n.P)}${stat('Late', n.L)}${stat('Absent', n.A)}${stat('Not marked', learners.length - n.P - n.L - n.A)}</div>
    <div class="card"><header><h2>${esc(c.name)} · ${fmtD(day)}</h2><button class="btn sm ghost" data-a="all-present">Mark the rest present</button></header>
    <div class="tw"><table><thead><tr><th>Learner</th><th>Today</th><th class="r">Last 20 days</th></tr></thead><tbody>${learners.map((l) => { const r = rt.get(l.id); return `<tr><td><b>${esc(l.full_name)}</b><span class="sub mono">${esc(l.adm_no)}</span></td><td><div class="seg" role="group" aria-label="Attendance for ${esc(l.full_name)}">${['P', 'L', 'A'].map((v) => `<button class="${st.get(l.id) === v ? 'on' : ''}" data-v="${v}" data-a="att" data-id="${l.id}" aria-pressed="${st.get(l.id) === v}">${v}</button>`).join('')}</div></td><td class="r">${r ? `<span class="pill ${r.rate < 85 ? 'warn' : 'good'}">${r.rate}%</span>` : '–'}</td></tr>`; }).join('') || '<tr><td colspan="3" class="muted">No learners in this class.</td></tr>'}</tbody></table></div></div>`;
  },
};
CHG['reg-cls'] = (e) => go('register', { ...S.params, cls: e.value });
CHG['reg-day'] = (e) => go('register', { ...S.params, day: e.value });
ACT.att = async (a) => {
  await q(sb.from('attendance').upsert({ student_id: a.dataset.id, day: S.params.day, status: a.dataset.v, school_id: S.me.school_id, marked_by: S.me.id }));
  a.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === a); b.setAttribute('aria-pressed', b === a); });
};
ACT['all-present'] = async () => {
  const unmarked = [...document.querySelectorAll('.seg')].filter((g) => !g.querySelector('.on')).map((g) => g.querySelector('button').dataset.id);
  if (!unmarked.length) { toast('Everyone is already marked.'); return; }
  await q(sb.from('attendance').upsert(unmarked.map((id) => ({ student_id: id, day: S.params.day, status: 'P', school_id: S.me.school_id, marked_by: S.me.id }))));
  toast(`${unmarked.length} marked present`); refresh();
};

/* =============================== GRADEBOOK =============================== */
const gradebook = {
  label: 'Gradebook', icon: 'chart',
  async render(p) {
    const exams = await q(sb.from('exams').select('*').order('created_at', { ascending: false }));
    if (!exams.length) return head('Gradebook', 'Gradebook') + empty('No exams have been created yet. The principal or deputy creates exams under Results.');
    const cs = combos(); if (!cs.length) return head('Gradebook', 'Gradebook') + empty('You are not assigned to teach any class yet.');
    const ex = exams.find((e) => e.id === p.exam) || exams.find((e) => e.status === 'draft') || exams[0];
    const key = (x) => x.class_id + '|' + x.subject_id;
    const cur = cs.find((x) => key(x) === p.combo) || cs[0];
    S.params.exam = ex.id; S.params.combo = key(cur);
    const [learners, marks, sub, others] = await Promise.all([
      q(sb.from('students').select('id, full_name, adm_no').eq('class_id', cur.class_id).eq('active', true).order('full_name')),
      q(sb.from('marks').select('student_id, score').eq('exam_id', ex.id).eq('subject_id', cur.subject_id)),
      q(sb.from('mark_submissions').select('*').eq('exam_id', ex.id).eq('class_id', cur.class_id).eq('subject_id', cur.subject_id).maybeSingle()),
      q(sb.from('marks').select('exam_id, student_id, score').eq('subject_id', cur.subject_id).neq('exam_id', ex.id)),
    ]);
    const mk = new Map(marks.map((m) => [m.student_id, Number(m.score)]));
    const prev = exams.filter((e) => e.id !== ex.id).slice(0, 2);
    const locked = ex.status === 'published';
    const entered = learners.filter((l) => mk.has(l.id)).length;
    return head('Gradebook', 'Gradebook', 'Type a score out of 100. The CBE level fills in by itself: EE 75 and above, ME 50–74, AE 25–49, BE below 25. Scores save as you type.',
      `<select data-c="gb-exam" aria-label="Exam">${exams.map((e) => opt(e.id, e.name + (e.status === 'published' ? ' (published)' : ''), ex.id)).join('')}</select><select data-c="gb-combo" aria-label="Class and learning area">${cs.map((x) => opt(key(x), `${className(x.class_id)} · ${subj(x.subject_id)?.name}`, key(cur))).join('')}</select>`) +
    `<div class="card"><header><div class="row"><h2>${esc(className(cur.class_id))} · ${esc(subj(cur.subject_id)?.name)}</h2>${locked ? '<span class="pill good">published, locked</span>' : sub ? '<span class="pill info">submitted</span>' : '<span class="pill warn">draft</span>'}</div>
      <div class="row"><span class="muted">Class mean <b class="num" id="gb-mean">${r1(avg([...mk.values()]))}</b> · <span id="gb-count">${entered}</span>/${learners.length}</span>${locked ? '' : `<button class="btn" data-a="gb-submit" ${entered < learners.length ? 'title="Some learners have no score yet"' : ''}>${sub ? 'Resubmit' : 'Submit to principal'}</button>`}</div></header>
    <div class="tw"><table><thead><tr><th>Learner</th><th class="r">Score</th><th>Level</th>${prev.map((e) => `<th class="r">${esc(e.name)}</th>`).join('')}</tr></thead><tbody>${learners.map((l) => `<tr><td><b>${esc(l.full_name)}</b><span class="sub mono">${esc(l.adm_no)}</span></td><td class="r"><input class="mk" type="number" min="0" max="100" step="0.5" inputmode="decimal" aria-label="Score for ${esc(l.full_name)}" value="${mk.has(l.id) ? mk.get(l.id) : ''}" data-c="mark" data-id="${l.id}" ${locked ? 'disabled' : ''}></td><td class="lvc">${lvPill(mk.get(l.id))}</td>${prev.map((e) => `<td class="r num muted">${r1(others.find((o) => o.exam_id === e.id && o.student_id === l.id)?.score)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="5" class="muted">No learners in this class.</td></tr>'}</tbody></table></div>
    ${locked ? '<p class="note">These results are published, so they are locked. Ask the principal to unpublish if a score must change.</p>' : ''}</div>`;
  },
};
CHG['gb-exam'] = (e) => go('gradebook', { ...S.params, exam: e.value });
CHG['gb-combo'] = (e) => go('gradebook', { ...S.params, combo: e.value });
CHG.mark = async (e) => {
  const [, subject] = S.params.combo.split('|');
  const raw = e.value.trim();
  if (raw === '') await q(sb.from('marks').delete().match({ exam_id: S.params.exam, student_id: e.dataset.id, subject_id: subject }));
  else {
    const v = Math.max(0, Math.min(100, Math.round(Number(raw) * 2) / 2)); e.value = v;
    await q(sb.from('marks').upsert({ exam_id: S.params.exam, student_id: e.dataset.id, subject_id: subject, school_id: S.me.school_id, score: v, entered_by: S.me.id, updated_at: new Date().toISOString() }));
  }
  e.closest('tr').querySelector('.lvc').innerHTML = lvPill(raw === '' ? null : Number(e.value));
  const vals = [...document.querySelectorAll('input.mk')].map((i) => i.value).filter((v) => v !== '').map(Number);
  document.getElementById('gb-mean').textContent = r1(avg(vals)); document.getElementById('gb-count').textContent = vals.length;
};
ACT['gb-submit'] = async () => {
  const [class_id, subject_id] = S.params.combo.split('|');
  await q(sb.from('mark_submissions').upsert({ exam_id: S.params.exam, class_id, subject_id, school_id: S.me.school_id, submitted_by: S.me.id, submitted_at: new Date().toISOString() }));
  toast('Submitted. The principal can now approve and publish.'); refresh();
};

/* =============================== EXAM BUILDER =============================== */
let paper = null;
function paperHTML(p, ms) {
  const tot = p.questions.reduce((a, x) => a + (x.marks || 1), 0); const L = 'ABCD';
  return `<div class="paper printable"><div class="ptop"><b>${esc(S.school.name.toUpperCase())}</b>${S.school.motto ? `<i>${esc(S.school.motto)}</i><br>` : ''}<span>${esc(p.title)} · ${esc(currentTerm()?.name || '')}</span><br><span>${esc(className(p.class_id))} · ${esc(subj(p.subject_id)?.name || '')}${p.topic ? ' · ' + esc(p.topic) : ''}</span><br><span>Time: ${Math.max(30, Math.round(tot * 1.5 / 5) * 5)} minutes · Total: ${tot} marks</span></div>
  <div class="fill"><span>Name:</span><span>Adm No:</span><span>Class:</span><span>Date:</span></div><p class="small"><i>Answer all questions in the spaces provided. Show all your working where necessary.</i></p>
  <ol>${p.questions.map((x, i) => `<li><span class="mk">(${x.marks} mk${x.marks > 1 ? 's' : ''})</span>${esc(x.q)}${x.type === 'mcq' ? `<div class="mcq">${x.options.map((o, k) => `<span>${L[k]}. ${esc(o)}</span>`).join('')}</div>` : '<div class="ans"></div><div class="ans"></div>'}${ms ? `<div class="ms">Answer: ${esc(x.answer)}</div>` : ''}<button class="btn sm ghost noprint" data-a="pq-del" data-i="${i}" aria-label="Remove question ${i + 1}">Remove</button></li>`).join('')}</ol></div>`;
}
const exambuilder = {
  label: 'Exam builder', icon: 'pen',
  async render(p) {
    const cs = combos(); const saved = await q(sb.from('exam_papers').select('id, title, class_id, subject_id, topic, created_at, questions').eq('created_by', S.me.id).order('created_at', { ascending: false }).limit(30));
    if (p.paper) paper = saved.find((x) => x.id === p.paper) || paper;
    const ai = hasFeature('ai');
    return head('Exam builder', 'Exam builder', 'Describe the paper. Mwalimu AI drafts questions with a marking scheme; you check them, remove any you do not like, add your own, then print or publish as an online practice quiz.') +
    `<div class="card"><form class="form" data-f="gen-paper">
      <label class="f grow2">Class and learning area<select name="combo">${cs.map((x) => opt(x.class_id + '|' + x.subject_id, `${className(x.class_id)} · ${subj(x.subject_id)?.name}`)).join('')}</select></label>
      <label class="f grow2">Strand / topic<input name="topic" required placeholder="e.g. Algebraic expressions"></label>
      <label class="f">Questions<select name="n">${[5, 8, 10, 15, 20].map((n) => opt(n, n, 10)).join('')}</select></label>
      <label class="f">Type<select name="type">${opt('mixed', 'Multiple choice + structured')}${opt('mcq', 'Multiple choice only')}${opt('structured', 'Structured only')}</select></label>
      <label class="f">Difficulty<select name="difficulty">${['Easy', 'Average', 'Challenging'].map((d) => opt(d, d, 'Average')).join('')}</select></label>
      <label class="f">Paper<select name="title">${['End-Term Assessment', 'Mid-Term Assessment', 'Weekly CAT', 'KJSEA Revision', 'Holiday Assignment'].map((d) => opt(d, d)).join('')}</select></label>
      <div class="row"><button class="btn" ${ai ? '' : 'disabled title="Mwalimu AI is part of the Premium plan"'}>Draft with Mwalimu AI</button><button type="button" class="btn ghost" data-a="paper-blank">Start a blank paper</button></div></form>
      ${ai ? '' : '<p class="note">Mwalimu AI drafting is part of the Premium plan. You can still build papers by hand.</p>'}</div>
    ${paper ? `<div class="card"><header><h2>${esc(paper.title)}</h2><div class="row noprint"><label class="row small"><input type="checkbox" data-c="pq-ms" ${S.params.ms ? 'checked' : ''}> Marking scheme</label><button class="btn ghost" data-a="print">Print</button>${paper.questions.some((x) => x.type === 'mcq') ? '<button class="btn ghost" data-a="paper-quiz">Publish MCQs as practice quiz</button>' : ''}<button class="btn" data-a="paper-save">${paper.id ? 'Save changes' : 'Save paper'}</button></div></header>
      ${paperHTML(paper, S.params.ms)}
      <details class="noprint"><summary class="btn sm ghost">Add a question</summary><form class="form" data-f="pq-add" style="margin-top:10px"><label class="f full">Question<textarea name="q" required></textarea></label><label class="f">Marks<input type="number" name="marks" min="1" max="20" value="2"></label><label class="f">Type<select name="type">${opt('structured', 'Structured')}${opt('mcq', 'Multiple choice')}</select></label><label class="f full">Options (multiple choice, one per line, correct one first)<textarea name="options" placeholder="Correct answer&#10;Wrong&#10;Wrong&#10;Wrong"></textarea></label><label class="f full">Answer / marking scheme<input name="answer"></label><div><button class="btn ghost">Add</button></div></form></details></div>` : ''}
    ${saved.length ? `<div class="card"><header><h2>Your saved papers</h2></header><div class="list">${saved.map((x) => `<div class="li"><div class="grow"><b>${esc(x.title)}</b><small class="block">${esc(className(x.class_id))} · ${esc(subj(x.subject_id)?.name || '')}${x.topic ? ' · ' + esc(x.topic) : ''} · ${x.questions.length} questions · ${fmtD(x.created_at)}</small></div><button class="btn sm ghost" data-a="paper-open" data-id="${x.id}">Open</button></div>`).join('')}</div></div>` : ''}`;
  },
};
FORM['gen-paper'] = async (d, f) => {
  const [class_id, subject_id] = d.combo.split('|');
  const btn = f.querySelector('.btn'); btn.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span> Drafting…';
  const r = await fn('ai', { mode: 'exam', class_name: className(class_id).split(' ').slice(0, 2).join(' '), subject: subj(subject_id)?.name, topic: d.topic, n: +d.n, type: d.type, difficulty: d.difficulty, title: d.title });
  if (!r.questions?.length) throw new Error('No questions came back. Try a more specific topic.');
  paper = { class_id, subject_id, topic: d.topic, title: d.title, questions: r.questions };
  S.params.paper = null; toast(`${r.questions.length} questions drafted. Check them before you use them.`);
};
ACT['paper-blank'] = () => { const [class_id, subject_id] = document.querySelector('[name=combo]').value.split('|'); paper = { class_id, subject_id, topic: document.querySelector('[name=topic]').value, title: document.querySelector('[name=title]').value, questions: [] }; refresh(); };
ACT['paper-open'] = (a) => go('exambuilder', { paper: a.dataset.id });
CHG['pq-ms'] = (e) => { S.params.ms = e.checked; refresh(); };
ACT['pq-del'] = (a) => { paper.questions.splice(+a.dataset.i, 1); refresh(); };
FORM['pq-add'] = async (d) => {
  const opts = (d.options || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const mcq = d.type === 'mcq' && opts.length === 4;
  if (d.type === 'mcq' && !mcq) throw new Error('Multiple choice needs exactly 4 options, correct one first.');
  paper.questions.push({ q: d.q.trim(), type: mcq ? 'mcq' : 'structured', options: mcq ? opts : [], answer: mcq ? opts[0] : d.answer, marks: +d.marks || 1 });
};
ACT['paper-save'] = async () => {
  const row = { school_id: S.me.school_id, class_id: paper.class_id, subject_id: paper.subject_id, title: paper.title, topic: paper.topic, questions: paper.questions, created_by: S.me.id };
  if (paper.id) await q(sb.from('exam_papers').update(row).eq('id', paper.id)); else paper = await q(sb.from('exam_papers').insert(row).select().single());
  toast('Paper saved'); refresh();
};
ACT['paper-quiz'] = async () => {
  const qs = paper.questions.filter((x) => x.type === 'mcq').map((x) => ({ q: x.q, options: x.options, answer: Math.max(0, x.options.findIndex((o) => o === x.answer)) }));
  if (qs.length < 2) throw new Error('A quiz needs at least 2 multiple-choice questions.');
  await q(sb.from('quizzes').insert({ school_id: S.me.school_id, class_id: paper.class_id, subject_id: paper.subject_id, title: `${subj(paper.subject_id)?.name}: ${paper.topic || paper.title}`, questions: qs, created_by: S.me.id }));
  toast(`Practice quiz with ${qs.length} questions is live for ${className(paper.class_id)}`);
};

/* =============================== HOMEWORK =============================== */
const homework = {
  label: 'Homework', icon: 'book',
  async render() {
    const cs = combos(); const hw = await q(sb.from('homework').select('*').eq('created_by', S.me.id).order('due', { ascending: false }).limit(60));
    return head('Homework', 'Homework', 'Learners see homework on their home page, with a "Get a hint" button that opens Mwalimu AI.') +
    `<div class="card"><form class="form" data-f="add-hw"><label class="f grow2">Class and learning area<select name="combo">${cs.map((x) => opt(x.class_id + '|' + x.subject_id, `${className(x.class_id)} · ${subj(x.subject_id)?.name}`)).join('')}</select></label><label class="f grow2">Task<input name="title" required maxlength="200" placeholder="e.g. Exercise 8.1, questions 1–12"></label><label class="f full">Details (optional)<textarea name="details" maxlength="1000"></textarea></label><label class="f">Due<input type="date" name="due" required min="${today()}"></label><div><button class="btn">Give homework</button></div></form></div>
    <div class="card"><header><h2>Set by you</h2></header><div class="list">${hw.map((h) => `<div class="li">${dateChip(h.due)}<div class="grow"><b>${esc(h.title)}</b><small class="block">${esc(className(h.class_id))} · ${esc(subj(h.subject_id)?.name || '')} · due ${fmtD(h.due)}</small></div><button class="btn sm ghost" data-a="del-hw" data-id="${h.id}">Remove</button></div>`).join('') || '<p class="muted">Nothing set yet.</p>'}</div></div>`;
  },
};
FORM['add-hw'] = async (d) => { const [class_id, subject_id] = d.combo.split('|'); await q(sb.from('homework').insert({ school_id: S.me.school_id, class_id, subject_id, title: d.title, details: d.details || null, due: d.due, created_by: S.me.id })); toast('Homework sent to ' + className(class_id)); };
ACT['del-hw'] = async (a) => { await q(sb.from('homework').delete().eq('id', a.dataset.id)); refresh(); };

/* =============================== MEETINGS =============================== */
const meetings = {
  label: 'Parent meetings', icon: 'video',
  async render() {
    const cls = classesFor().map((c) => c.id);
    const [mine, learners] = await Promise.all([
      q(sb.from('meetings').select('*').eq('teacher_id', S.me.id).order('starts_at', { ascending: false }).limit(80)),
      cls.length ? q(sb.from('students').select('id, full_name, class_id').in('class_id', cls).eq('active', true).order('full_name')) : [],
    ]);
    const guards = learners.length ? await q(sb.from('guardians').select('student_id, parent_id, relationship').in('student_id', learners.map((l) => l.id))) : [];
    const stuName = new Map(learners.map((l) => [l.id, l.full_name]));
    mine.forEach((m) => (m.student_name = stuName.get(m.student_id)));
    const up = mine.filter((m) => ['requested', 'confirmed'].includes(m.status) && new Date(m.starts_at) > new Date(Date.now() - 3 * 3600e3)).reverse();
    const past = mine.filter((m) => !up.includes(m)).slice(0, 15);
    return head('Meetings', 'Parent meetings', 'Video or audio calls open in the phone or computer browser. Parents get an SMS when you book or confirm.') +
    `<div class="card"><header><h2>Upcoming</h2></header><div class="list">${up.map((m) => meetingRow(m, 'teacher')).join('') || '<p class="muted">Nothing booked.</p>'}</div></div>
    <div class="card"><header><h2>Book a meeting</h2></header>${guards.length ? `<form class="form" data-f="book-meeting"><label class="f grow2">Parent (and learner)<select name="pair" required>${guards.map((g) => opt(g.student_id + '|' + g.parent_id, `${nameOf(g.parent_id)} · ${g.relationship} of ${stuName.get(g.student_id)}`)).join('')}</select></label><label class="f">Date<input type="date" name="date" required min="${today()}"></label><label class="f">Time<input type="time" name="time" required value="16:00"></label><label class="f">Call<select name="mode">${opt('video', 'Video call')}${opt('audio', 'Audio call (less data)')}</select></label><label class="f grow2">Topic<input name="topic" required maxlength="120" placeholder="e.g. End-term results"></label><div><button class="btn">Book and notify parent</button></div></form>` : '<p class="muted">No parents are linked to learners in your classes yet.</p>'}</div>
    ${past.length ? `<div class="card"><header><h2>Past and cancelled</h2></header><div class="list">${past.map((m) => meetingRow(m, 'teacher')).join('')}</div></div>` : ''}`;
  },
};
FORM['book-meeting'] = async (d) => {
  const [student_id, parent_id] = d.pair.split('|');
  const m = await q(sb.from('meetings').insert({ school_id: S.me.school_id, teacher_id: S.me.id, parent_id, student_id, starts_at: toEAT(d.date, d.time), mode: d.mode, topic: d.topic, status: 'confirmed', created_by: S.me.id }).select().single());
  fn('sms', { action: 'meeting', meeting_id: m.id }).catch(() => {});
  toast('Booked. The parent can join from their Meetings page.');
};

export const teacherViews = { today: todayView, register, gradebook, exambuilder, homework, meetings };
