// Learner portal: results, quiz arena, Mwalimu AI, homework.
import { sb, q, fn, esc, r1, avg, toast, head, opt, stat, fmtD, today, modal, closeModal, lvPill, LEVEL, LEVEL_NAME, dateChip, bars, lineChart, md, first, empty } from '../lib.js';
import { S, ACT, FORM, CHG, nameOf, className, subj, refresh, go, hasFeature } from '../state.js';
import { announcementsCard } from './common.js';

/** Mwalimu AI for a learner needs the plan, the school's switch and a parent's permission. */
const aiOk = () => hasFeature('ai') && !!S.school?.learner_ai && !!S.mine?.allow_ai;
async function me() {
  if (!S.mine) S.mine = await q(sb.from('students').select('*').eq('user_id', S.me.id).maybeSingle());
  return S.mine;
}

/* ---------------- shared with the parent portal ---------------- */
export async function learnerResults(st) {
  const exams = await q(sb.from('exams').select('*').eq('status', 'published').order('published_at'));
  const marks = exams.length ? await q(sb.from('marks').select('exam_id, subject_id, score').eq('student_id', st.id)) : [];
  return { exams, marks };
}
export async function reportCard(st, exam, marks) {
  const means = st.class_id ? await q(sb.rpc('class_subject_means', { p_exam: exam.id, p_class: st.class_id })) : [];
  const mine = marks.filter((m) => m.exam_id === exam.id);
  const subjects = S.subjects.filter((s) => mine.some((m) => m.subject_id === s.id) || means.some((m) => m.subject_id === s.id));
  const rows = subjects.map((s) => ({ s, v: mine.find((m) => m.subject_id === s.id)?.score, m: means.find((m) => m.subject_id === s.id)?.mean }));
  const a = avg(rows.map((r) => r.v));
  const scored = rows.filter((r) => r.v !== undefined && r.v !== null).sort((x, y) => y.v - x.v);
  const remark = a === null ? '' : `${first(st.full_name)} is ${LEVEL_NAME[LEVEL(a)].toLowerCase()} overall.${scored[0] ? ` Strongest in ${scored[0].s.name} (${r1(scored[0].v)}).` : ''}${scored.length > 1 && scored[scored.length - 1].v < 50 ? ` Needs more support in ${scored[scored.length - 1].s.name}; regular practice at home will help.` : ''}`;
  return { html: `<div class="printable">
    <div class="rc-head"><div><b>${esc(S.school.name)}</b>${S.school.motto ? `<small class="block"><i>${esc(S.school.motto)}</i></small>` : ''}</div><div class="r"><b>${esc(exam.name)}</b><small class="block">Report card</small></div></div>
    <div class="kv"><span>Learner</span><b>${esc(st.full_name)}</b><span>Adm. no.</span><b class="mono">${esc(st.adm_no)}</b><span>Class</span><b>${esc(className(st.class_id))}</b></div>
    <div class="tw"><table><thead><tr><th>Learning area</th><th class="r">Score</th><th>Level</th><th class="r">Class mean</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.s.name)}</td><td class="r num"><b>${r.v ?? '<span class="muted">not assessed</span>'}</b></td><td>${lvPill(r.v)}</td><td class="r num muted">${r1(r.m)}</td></tr>`).join('')}<tr class="foot"><td>Average</td><td class="r num"><b>${r1(a)}</b></td><td>${lvPill(a)}</td><td class="r num muted">${r1(avg(rows.map((r) => r.m)))}</td></tr></tbody></table></div>
    ${bars(rows.map((r) => ({ label: r.s.short, value: r.v ?? null, ref: r.m ?? null })))}
    <div class="legend"><span><i></i>${esc(first(st.full_name))}</span><span><i class="refk"></i>Class mean</span><span>EE exceeding · ME meeting · AE approaching · BE below expectations</span></div>
    ${remark ? `<p class="note"><b>Remark:</b> ${esc(remark)}</p>` : ''}</div>`, avg: a, rows };
}

/* ---------------- HOME ---------------- */
const home = {
  label: 'Home', icon: 'home',
  async render() {
    const st = await me(); if (!st) return empty('Your learner record is not linked yet. Ask your class teacher.');
    const [{ exams, marks }, rates, hw, attempts] = await Promise.all([
      learnerResults(st), q(sb.rpc('attendance_rates', { p_days: 20 })),
      st.class_id ? q(sb.from('homework').select('*').eq('class_id', st.class_id).gte('due', today()).order('due')) : [],
      q(sb.from('quiz_attempts').select('score').eq('user_id', S.me.id)),
    ]);
    const last = exams[exams.length - 1]; const a = last ? avg(marks.filter((m) => m.exam_id === last.id).map((m) => m.score)) : null;
    const r = rates.find((x) => x.student_id === st.id);
    return head(esc(className(st.class_id)), `Hi ${esc(first(st.full_name))}!`, 'Here is your week at a glance.') +
    `<div class="stats">${stat('Latest average', last ? `${r1(a)} ${lvPill(a)}` : '–', last ? esc(last.name) : 'no results released yet')}${stat('Attendance', r ? r.rate + '%' : '–', 'last 20 school days', r?.rate ?? null)}${stat('Quizzes played', attempts.length, attempts.length ? 'best ' + Math.max(...attempts.map((x) => x.score)) : 'try the arena')}${stat('Homework due', hw.length, hw[0] ? 'next ' + fmtD(hw[0].due) : '')}</div>
    <div class="g2"><div class="card"><header><h2>Homework</h2></header>${hwList(hw)}</div>
    <div class="card"><header><h2>Quiz arena</h2></header><p class="muted">Play timed quizzes, beat your classmates, or make your own quiz for the class.</p><div><button class="btn" data-a="go" data-v="arena">Open the arena</button></div></div></div>
    ${await announcementsCard(3)}`;
  },
};
const hwList = (hw) => hw.length ? `<div class="list">${hw.map((h) => `<div class="li">${dateChip(h.due)}<div class="grow"><b>${esc(h.title)}</b>${h.details ? `<p class="muted small pre">${esc(h.details)}</p>` : ''}<small class="block">${esc(subj(h.subject_id)?.name || '')} · ${esc(nameOf(h.created_by))}</small></div>${aiOk() ? `<button class="btn sm ghost" data-a="ask-ai" data-s="${esc(h.subject_id || '')}" data-q="${esc('Help me get started on this homework: ' + h.title + (h.details ? ' — ' + h.details : ''))}">Get a hint</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">No homework due. Enjoy!</p>';

/* ---------------- RESULTS ---------------- */
const results = {
  label: 'My results', icon: 'chart',
  async render(p) {
    const st = await me(); if (!st) return empty('Your learner record is not linked yet.');
    const { exams, marks } = await learnerResults(st);
    if (!exams.length) return head('Results', 'My results') + empty('No results have been released yet. They appear here once your school publishes them.');
    const ex = exams.find((e) => e.id === p.exam) || exams[exams.length - 1];
    const rc = await reportCard(st, ex, marks);
    const weakest = rc.rows.filter((r) => r.v != null).sort((a, b) => a.v - b.v)[0];
    return head('Results', 'My results', 'Only results your school has released appear here.', `<select data-c="lr-exam" aria-label="Exam">${exams.map((e) => opt(e.id, e.name, ex.id)).join('')}</select><button class="btn ghost" data-a="print">Print</button>`) +
    `<div class="g2"><div class="card">${rc.html}</div><div class="card"><header><h2>My average over time</h2></header>${lineChart(exams.map((e) => ({ label: e.name, value: avg(marks.filter((m) => m.exam_id === e.id).map((m) => m.score)) })))}
    ${weakest && aiOk() ? `<button class="btn ghost" data-a="ask-ai" data-s="${weakest.s.id}" data-q="${esc(`My lowest score in ${ex.name} was ${weakest.s.name} (${r1(weakest.v)}). Can you give me a simple 2-week revision plan?`)}">Ask Mwalimu AI for a revision plan</button>` : ''}</div></div>`;
  },
};
CHG['lr-exam'] = (e) => go('results', { exam: e.value });

/* ---------------- QUIZ ARENA ---------------- */
let play = null; let timer = null; let relaxed = false;   // relaxed = no time limit (accessibility)
const board = (attempts, quizId) => { const best = new Map(); attempts.filter((a) => a.quiz_id === quizId).forEach((a) => { if (!best.has(a.user_id) || a.score > best.get(a.user_id)) best.set(a.user_id, a.score); }); return [...best.entries()].sort((a, b) => b[1] - a[1]); };
const arena = {
  label: 'Quiz arena', icon: 'trophy',
  async render() {
    if (play) return playHTML();
    const st = await me();
    const [quizzes, attempts] = await Promise.all([q(sb.from('quizzes').select('*').order('created_at', { ascending: false }).limit(60)), q(sb.from('quiz_attempts').select('quiz_id, user_id, score').limit(5000))]);
    S.quizzes = quizzes; S.attempts = attempts;
    const classmates = [...S.names.values()].filter((p) => p.role === 'student' && p.id !== S.me.id && p.learner_class_id && p.learner_class_id === st?.class_id);
    return head('Quiz arena', 'Quiz arena', 'Timed quizzes: faster correct answers earn more points. Need more time? Turn off the timer. Every correct answer then scores 100.', `<label class="row small"><input type="checkbox" data-c="relaxed" ${relaxed ? 'checked' : ''}> No timer</label>`) +
    (quizzes.length ? `<div class="grid">${quizzes.map((z) => { const b = board(attempts, z.id); const rank = b.findIndex((x) => x[0] === S.me.id); return `<div class="card"><header><div><h3>${esc(z.title)}</h3><small>${esc(subj(z.subject_id)?.name || 'Mixed')} · ${z.questions.length} questions · by ${z.created_by === S.me.id ? 'you' : esc(nameOf(z.created_by))}</small></div></header><ol class="lb">${b.slice(0, 4).map(([w, s], i) => `<li><span><span class="rank">${i + 1}</span>${w === S.me.id ? '<b>You</b>' : esc(first(nameOf(w)))}</span><span class="num">${s}</span></li>`).join('') || '<li class="muted">No scores yet. Be the first!</li>'}</ol>${rank > 3 ? `<small>You are number ${rank + 1}</small>` : ''}<div class="row"><button class="btn" data-a="play" data-id="${z.id}">Play</button>${z.created_by === S.me.id ? `<button class="btn sm ghost" data-a="del-quiz" data-id="${z.id}">Delete</button>` : ''}</div></div>`; }).join('')}</div>` : empty('No quizzes yet. Make the first one for your class below!')) +
    (classmates.length && quizzes.length ? `<div class="card"><header><h2>Challenge a friend</h2></header><form class="form" data-f="challenge"><label class="f">Quiz<select name="quiz">${quizzes.map((z) => opt(z.id, z.title)).join('')}</select></label><label class="f">Friend<select name="to">${classmates.map((c) => opt(c.id, c.full_name)).join('')}</select></label><div><button class="btn ghost">Send challenge</button></div></form></div>` : '') +
    `<div class="card"><header><h2>Make a quiz for your class</h2><span class="muted small">At least 2 questions, each with 4 answers.</span></header><form data-f="make-quiz" class="stack">
      <div class="form"><label class="f grow2">Quiz title<input name="title" required maxlength="80" placeholder="e.g. Methali za Kiswahili"></label><label class="f">Learning area<select name="subject_id">${S.subjects.map((s) => opt(s.id, s.name)).join('')}</select></label></div>
      ${[1, 2, 3, 4, 5].map((n) => `<fieldset class="fs"><legend>Question ${n}${n > 2 ? ' (optional)' : ''}</legend><input name="q${n}" placeholder="Question" ${n <= 2 ? 'required' : ''} aria-label="Question ${n}"><div class="form">${[0, 1, 2, 3].map((i) => `<input name="q${n}o${i}" placeholder="Answer ${'ABCD'[i]}" ${n <= 2 ? 'required' : ''} aria-label="Question ${n} answer ${'ABCD'[i]}">`).join('')}</div><label class="f check">Correct answer <select name="q${n}a" aria-label="Correct answer for question ${n}">${[0, 1, 2, 3].map((i) => opt(i, 'ABCD'[i])).join('')}</select></label></fieldset>`).join('')}
      <div><button class="btn">Publish quiz</button></div></form></div>`;
  },
};
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
ACT.play = (a) => {
  const z = S.quizzes.find((x) => x.id === a.dataset.id);
  const qs = shuffle(z.questions).map((x) => ({ q: x.q, opts: shuffle(x.options.map((o, i) => ({ o, ok: i === Number(x.answer) }))) }));
  play = { quiz: z, qs, i: 0, score: 0, right: 0, left: 20, answered: null, done: false, relaxed };
  go('arena'); if (!relaxed) tick();
};
function tick() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!play || play.answered !== null || play.done) { clearInterval(timer); return; }
    play.left--; const bar = document.getElementById('tbar'); if (bar) bar.style.width = (play.left / 20) * 100 + '%';
    const tl = document.getElementById('tleft'); if (tl) tl.textContent = play.left + 's';
    if (play.left <= 0) answer(-1);
  }, 1000);
}
function answer(k) {
  if (!play || play.answered !== null) return; play.answered = k; clearInterval(timer);
  if (k >= 0 && play.qs[play.i].opts[k].ok) { play.right++; play.score += play.relaxed ? 100 : 100 + play.left * 5; }
  refresh().then(() => document.getElementById('next-q')?.focus());
}
ACT.ans = (a) => answer(+a.dataset.k);
ACT['next-q'] = async () => {
  if (play.i + 1 < play.qs.length) { play.i++; play.answered = null; play.left = 20; await refresh(); document.querySelector('.opt')?.focus(); if (!play.relaxed) tick(); return; }
  play.done = true;
  await q(sb.from('quiz_attempts').insert({ quiz_id: play.quiz.id, school_id: S.me.school_id, user_id: S.me.id, score: play.score, correct: play.right, total: play.qs.length }));
  S.attempts = await q(sb.from('quiz_attempts').select('quiz_id, user_id, score').eq('quiz_id', play.quiz.id));
  refresh();
};
ACT['quit-play'] = () => { clearInterval(timer); play = null; refresh(); };
function playHTML() {
  const z = play.quiz;
  if (play.done) {
    const b = board(S.attempts, z.id), rank = b.findIndex((x) => x[0] === S.me.id) + 1;
    return head('Quiz arena', esc(z.title)) + `<div class="card qcard"><div class="eyebrow">Finished</div><div class="qq">${play.score} points</div><p>${play.right} of ${play.qs.length} correct. You are <b>number ${rank}</b> on the leaderboard.</p>
    <ol class="lb narrow">${b.slice(0, 6).map(([w, s], i) => `<li><span><span class="rank">${i + 1}</span>${w === S.me.id ? '<b>You</b>' : esc(first(nameOf(w)))}</span><span class="num">${s}</span></li>`).join('')}</ol>
    <div class="row"><button class="btn" data-a="play" data-id="${z.id}">Play again</button><button class="btn ghost" data-a="quit-play">Back to the arena</button></div></div>`;
  }
  const qn = play.qs[play.i], ans = play.answered, correct = qn.opts.find((o) => o.ok)?.o;
  const ok = ans !== null && ans >= 0 && qn.opts[ans].ok;
  return head('Quiz arena', esc(z.title), `Question ${play.i + 1} of ${play.qs.length} · ${play.score} points`, '<button class="btn ghost" data-a="quit-play">Quit</button>') +
  `<div class="card qcard"><div class="row spread"><span class="eyebrow">${esc(subj(z.subject_id)?.name || '')}</span>${play.relaxed ? '<span class="muted small">No timer</span>' : `<span class="mono" id="tleft" aria-label="Seconds left">${play.left}s</span>`}</div>${play.relaxed ? '' : `<div class="timer" aria-hidden="true"><i id="tbar" style="width:${(play.left / 20) * 100}%"></i></div>`}
  <div class="qq">${esc(qn.q)}</div><div class="opts">${qn.opts.map((o, k) => `<button class="opt ${ans !== null && o.ok ? 'right' : ''} ${ans === k && !o.ok ? 'wrong' : ''}" data-a="ans" data-k="${k}" ${ans !== null ? 'disabled' : ''}><span class="key">${'ABCD'[k]}</span>${esc(o.o)}</button>`).join('')}</div>
  ${ans !== null ? `<div class="row spread"><b role="status" class="${ok ? 'good-t' : 'bad-t'}">${ok ? `Correct! +${play.relaxed ? 100 : 100 + play.left * 5}` : ans < 0 ? `Time is up. The answer is ${esc(correct)}.` : `Not quite. The answer is ${esc(correct)}.`}</b><div class="row">${!ok && aiOk() ? `<button class="btn ghost" data-a="ask-ai" data-s="${esc(z.subject_id || '')}" data-q="${esc(`In a quiz I was asked: "${qn.q}". The correct answer is "${correct}". Can you explain why, simply?`)}">Why? Ask Mwalimu AI</button>` : ''}<button class="btn" id="next-q" data-a="next-q">${play.i + 1 < play.qs.length ? 'Next question' : 'See results'}</button></div></div>` : ''}</div>`;
}
CHG.relaxed = (e) => { relaxed = e.checked; };
FORM['make-quiz'] = async (d) => {
  const st = await me();
  const qs = [1, 2, 3, 4, 5].map((n) => ({ q: (d['q' + n] || '').trim(), options: [0, 1, 2, 3].map((i) => (d[`q${n}o${i}`] || '').trim()), answer: +d[`q${n}a`] })).filter((x) => x.q && x.options.every(Boolean));
  if (qs.length < 2) throw new Error('Add at least two complete questions.');
  await q(sb.from('quizzes').insert({ school_id: S.me.school_id, class_id: st?.class_id || null, subject_id: d.subject_id || null, title: d.title.trim(), questions: qs, created_by: S.me.id }));
  toast('Your quiz is live for the class!');
};
ACT['del-quiz'] = async (a) => { await q(sb.from('quizzes').delete().eq('id', a.dataset.id)); refresh(); };
FORM.challenge = async (d) => {
  const z = S.quizzes.find((x) => x.id === d.quiz);
  await q(sb.from('messages').insert({ school_id: S.me.school_id, sender: S.me.id, recipient: d.to, body: `I challenge you to "${z.title}" in the Quiz arena! Can you beat my score?` }));
  toast('Challenge sent to ' + first(nameOf(d.to))); return false;
};

/* ---------------- MWALIMU AI ---------------- */
const T = { subject: null, hint: true, turns: [], busy: false, draft: '' };
const STARTERS = { Mathematics: ['How do I add fractions with different denominators?', 'Explain how to solve 3x − 7 = 11', 'What is the difference between area and perimeter?'], 'Integrated Science': ['How does the heart pump blood?', 'What is photosynthesis?', 'Why do metals conduct electricity?'], English: ['When do I use "has" and "have"?', 'How do I write a good composition introduction?', 'What is a simile?'], Kiswahili: ['Nieleze ngeli ya KI-VI', 'Methali ni nini? Nipe mifano mitatu', 'Insha ya maelezo huandikwaje?'] };
const tutor = {
  label: 'Mwalimu AI', icon: 'spark',
  async render() {
    const st = await me();
    if (!hasFeature('ai')) return head('Mwalimu AI', 'Mwalimu AI') + empty('Mwalimu AI is not part of your school\'s plan. You can ask your teacher for help instead.');
    if (!S.school?.learner_ai || !st?.allow_ai) return head('Mwalimu AI', 'Mwalimu AI') + empty(`Mwalimu AI is switched off for you. It needs ${!S.school?.learner_ai ? 'your school to switch it on, and then ' : ''}a parent or guardian to allow it from their ShuleHub account.`);
    if (!T.subject) T.subject = S.subjects[0]?.id;
    const sname = subj(T.subject)?.name || 'your studies';
    return head('Mwalimu AI', 'Mwalimu AI', 'Your study helper. In "Hints first" mode it guides you step by step so you learn to solve it yourself.',
      `<select data-c="t-subj" aria-label="Learning area">${S.subjects.map((s) => opt(s.id, s.name, T.subject)).join('')}</select><div class="seg" role="group" aria-label="Mode"><button class="plain ${T.hint ? 'on' : ''}" data-a="t-mode" data-m="1">Hints first</button><button class="plain ${!T.hint ? 'on' : ''}" data-a="t-mode" data-m="0">Explain fully</button></div>`) +
    `<div class="chat tutor single"><div class="thread-wrap"><div class="thread-head"><div><b>${esc(sname)}</b><small class="block">${T.hint ? 'Hints first: you do the thinking' : 'Full worked explanations'} · English or Kiswahili</small></div>${T.turns.length ? '<button class="btn sm ghost" data-a="t-clear">New chat</button>' : ''}</div>
    <div class="thread" id="thread">${T.turns.length ? T.turns.map((t) => t.role === 'user' ? `<div class="bub me">${esc(t.content)}</div>` : `<div class="ai-bub ${t.error ? 'err' : ''}"><span class="who-ai">Mwalimu AI</span>${md(t.content)}</div>`).join('') : `<div class="ai-bub"><span class="who-ai">Mwalimu AI</span>Habari ${esc(first(st?.full_name || S.me.full_name))}! Ask me anything you find hard in ${esc(sname)}. Type your question, or try one of these:</div><div class="chips">${(STARTERS[sname] || ['Explain this topic simply', 'Give me 3 practice questions']).map((x) => `<button class="chip" data-a="t-ask" data-q="${esc(x)}"${sname === 'Kiswahili' ? ' lang="sw"' : ''}>${esc(x)}</button>`).join('')}</div>`}
    ${T.busy ? '<div class="ai-bub"><span class="who-ai">Mwalimu AI</span><span class="thinking"><i></i><i></i><i></i></span></div>' : ''}</div>
    <form class="compose" data-f="t-send"><input name="text" id="t-in" aria-label="Your question" placeholder="Type your question…" autocomplete="off" required maxlength="1500" value="${esc(T.draft)}" ${T.busy ? 'disabled' : ''}><button class="btn" ${T.busy ? 'disabled' : ''}>Ask</button></form></div></div>
    <p class="muted small">Mwalimu AI can make mistakes. Check important answers with your teacher. Do not type your name, phone number or address here.</p>`;
  },
  after() { const t = document.getElementById('thread'); if (t) t.scrollTop = t.scrollHeight; if (!T.busy) document.getElementById('t-in')?.focus(); },
};
async function ask(text) {
  if (!text.trim() || T.busy) return;
  const st = await me();
  T.turns.push({ role: 'user', content: text.trim() }); T.draft = ''; T.busy = true; refresh();
  try {
    const r = await fn('ai', { mode: 'tutor', subject: subj(T.subject)?.name, grade: className(st?.class_id).split(' ').slice(0, 2).join(' '), hint: T.hint, messages: T.turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content })) });
    T.turns.push({ role: 'assistant', content: r.text });
  } catch (e) { T.turns.push({ role: 'assistant', content: e.message, error: true }); }
  T.busy = false; if (S.view === 'tutor') refresh();
}
FORM['t-send'] = (d) => { ask(d.text); return false; };
ACT['t-ask'] = (a) => ask(a.dataset.q);
ACT['t-mode'] = (a) => { T.hint = a.dataset.m === '1'; refresh(); };
ACT['t-clear'] = () => { T.turns = []; refresh(); };
CHG['t-subj'] = (e) => { T.subject = e.value; T.turns = []; refresh(); };
ACT['ask-ai'] = (a) => { clearInterval(timer); play = null; if (a.dataset.s && subj(a.dataset.s)) T.subject = a.dataset.s; T.turns = []; T.draft = a.dataset.q || ''; go('tutor'); };

/* ---------------- HOMEWORK ---------------- */
const homework = {
  label: 'Homework', icon: 'book',
  async render() {
    const st = await me(); if (!st?.class_id) return head('Homework', 'Homework') + empty('You are not in a class yet.');
    const hw = await q(sb.from('homework').select('*').eq('class_id', st.class_id).gte('due', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).order('due'));
    return head('Homework', 'Homework', aiOk() ? 'Stuck? Tap "Get a hint" and Mwalimu AI will guide you without giving the answer away.' : '') + `<div class="card">${hwList(hw)}</div>`;
  },
};

export const learnerViews = { home, results, arena, tutor, homework };
