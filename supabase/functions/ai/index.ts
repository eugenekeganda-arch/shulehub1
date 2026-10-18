// ai: Mwalimu AI tutor for learners and the exam-paper builder for teachers.
// Uses the Claude API; the key stays on the server (ANTHROPIC_API_KEY).
import { serve, json, caller, body, HttpError, planHas, STAFF_ROLES } from "../_shared/util.ts";

const LIMITS: Record<string, number> = { tutor: 60, exam: 25 };   // per person per day

async function claude(model: string, system: string, messages: { role: string; content: string }[], maxTokens: number) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  // deno-lint-ignore no-explicit-any
  const out: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Claude API error", r.status, out);
    throw new HttpError(502, r.status === 429 ? "Mwalimu AI is busy. Try again in a minute." : "Mwalimu AI is not available right now.");
  }
  // deno-lint-ignore no-explicit-any
  return (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
}

serve(async (req) => {
  const { db, profile: me } = await caller(req);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new HttpError(503, "Mwalimu AI has not been switched on yet (ANTHROPIC_API_KEY is missing).");
  if (!me.school_id || !(await planHas(db, me.school_id, "ai"))) throw new HttpError(403, "Mwalimu AI is part of the Premium plan. Ask your school to upgrade.");
  // deno-lint-ignore no-explicit-any
  const b = await body<Record<string, any>>(req);
  const kind = b.mode === "exam" ? "exam" : "tutor";

  if (kind === "exam" && !STAFF_ROLES.includes(me.role)) throw new HttpError(403, "Only staff can build exam papers.");
  if (kind === "tutor" && !["student", ...STAFF_ROLES].includes(me.role)) throw new HttpError(403, "Mwalimu AI is for learners and teachers.");
  if (kind === "tutor" && me.role === "student") {
    // Learners need the school's switch AND a parent's permission.
    const { data: st } = await db.from("students").select("allow_ai, schools(learner_ai)").eq("user_id", me.id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    if (!st || !st.allow_ai || !(st as any).schools?.learner_ai)
      throw new HttpError(403, "Mwalimu AI is switched off for you. It needs your school to turn it on and a parent to allow it.");
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("kind", kind).gte("created_at", since);
  if ((count ?? 0) >= LIMITS[kind]) throw new HttpError(429, "You have reached today's limit for Mwalimu AI. Try again tomorrow.");
  await db.from("ai_usage").insert({ school_id: me.school_id, user_id: me.id, kind });

  if (kind === "tutor") {
    const subject = String(b.subject ?? "General").slice(0, 60);
    const grade = String(b.grade ?? "Junior School").slice(0, 40);
    const hint = b.hint !== false;
    // No name or other identifying details are sent: only the grade and learning area.
    const system = `You are "Mwalimu AI", a warm, patient tutor for a ${grade} learner at a Kenyan school following the Competency-Based Education (CBE) curriculum. Current learning area: ${subject}.
Rules:
- Use short, simple sentences. Use Kenyan examples (shillings, matatus, shambas, local names) where they help.
- ${hint ? "Do NOT give the final answer straight away. Give one hint or the first step only, then ask the learner to try the next step. If they have tried, check their work and give the next hint. Give the full worked answer only if they ask for it after trying at least once." : "Explain the full solution clearly, step by step, then give ONE similar practice question for them to try."}
- If the learner writes in Kiswahili, reply in Kiswahili.
- Stay on school learning. Politely decline anything unrelated or unsafe and steer back to studies.
- Never ask for, and do not repeat, personal details (full name, phone, address, school, photos). If the learner shares them, remind them gently not to.
- If the learner seems upset, unsafe or mentions harm, respond kindly and encourage them to talk to their class teacher, a parent or another trusted adult right away. In an emergency in Kenya they can call 116 (Childline Kenya, free).
- Use **bold** for key words. Keep each reply under 150 words. No tables.`;
    const msgs = (Array.isArray(b.messages) ? b.messages : [])
      // deno-lint-ignore no-explicit-any
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-12)
      // deno-lint-ignore no-explicit-any
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new HttpError(400, "Ask a question first.");
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    const text = await claude(Deno.env.get("AI_MODEL_TUTOR") ?? "claude-haiku-5-5", system, msgs, 600);
    return json({ text });
  }

  // ---------------------------------------------------------------- exam builder
  const n = Math.max(3, Math.min(25, Number(b.n) || 8));
  const type = b.type === "mcq" ? "All must be multiple choice." : b.type === "structured" ? "All must be structured (short written answer)." : "Make roughly half multiple choice and half structured.";
  const system = "You are an experienced Kenyan teacher who sets clear, fair, curriculum-aligned assessments. You reply with JSON only.";
  const prompt = `Set a ${String(b.title ?? "class assessment").slice(0, 60)} for ${String(b.class_name ?? "Junior School").slice(0, 40)} learners under Kenya's Competency-Based Education curriculum.
Learning area: ${String(b.subject).slice(0, 60)}. Strand / topic: ${String(b.topic).slice(0, 120)}. Difficulty: ${String(b.difficulty ?? "Average").slice(0, 20)}.
Write exactly ${n} questions. ${type}
Use Kenyan contexts (KSh, local names and places) where natural, at the right level for the grade. Multiple choice questions have exactly 4 options and one correct answer.
Reply with only a JSON array. Each item: {"q": string, "type": "mcq" | "structured", "options": string[] (4 for mcq, [] otherwise), "answer": string (mcq: the exact text of the correct option; structured: a short marking scheme), "marks": integer 1-5}.`;
  const text = await claude(Deno.env.get("AI_MODEL_EXAM") ?? "claude-sonnet-5-5", system, [{ role: "user", content: prompt }], 4000);
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  let questions: unknown[] = [];
  try { questions = JSON.parse(text.slice(start, end + 1)); } catch { throw new HttpError(502, "The draft came back in the wrong format. Please try again."); }
  const clean = questions
    // deno-lint-ignore no-explicit-any
    .filter((q: any) => q && typeof q.q === "string")
    // deno-lint-ignore no-explicit-any
    .map((q: any) => {
      const mcq = q.type === "mcq" && Array.isArray(q.options) && q.options.length === 4;
      return { q: q.q, type: mcq ? "mcq" : "structured", options: mcq ? q.options.map(String) : [], answer: String(q.answer ?? ""), marks: Math.max(1, Math.min(10, parseInt(q.marks) || 1)) };
    });
  return json({ questions: clean });
});
