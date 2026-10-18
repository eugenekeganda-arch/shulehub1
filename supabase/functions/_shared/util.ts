// Shared helpers for ShuleHub server functions (Supabase Edge Functions, Deno).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Wrap a handler with CORS + consistent error replies. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await handler(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, status);
    }
  });
}

export const env = (k: string, fallback?: string) => {
  const v = Deno.env.get(k) ?? fallback;
  if (v === undefined) throw new HttpError(500, `Server setting ${k} is missing. Ask the ShuleHub owner to set it.`);
  return v;
};

/** Service-role client: bypasses security rules, so only use after checking permissions. */
export function admin(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export type Profile = {
  id: string; school_id: string | null; role: string; full_name: string; phone: string | null;
  email: string | null; active: boolean;
  schools?: { id: string; name: string; code: string; status: string; plan_id: string; paybill: string | null } | null;
};

/** Who is calling? Verifies the JWT and loads their profile. */
export async function caller(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in again.");
  const db = admin();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  const { data: profile } = await db.from("profiles")
    .select("id, school_id, role, full_name, phone, email, active, schools(id, name, code, status, plan_id, paybill)")
    .eq("id", user.id).single();
  if (!profile || !profile.active) throw new HttpError(403, "This account is not active.");
  const p = profile as unknown as Profile;
  if (p.role !== "super_admin" && p.schools?.status === "suspended")
    throw new HttpError(403, "This school's ShuleHub access is suspended. Please contact the school office.");
  return { db, user, profile: p };
}

export const LEADER_ROLES = ["director", "principal", "deputy_principal", "head_teacher", "bursar"];
export const STAFF_ROLES = [...LEADER_ROLES, "teacher"];

export async function hasPerm(db: SupabaseClient, p: Profile, perm: string) {
  if (p.role === "super_admin") return true;
  if (!p.school_id || !LEADER_ROLES.includes(p.role)) return false;
  if (p.role === "director") return true;
  const { data } = await db.from("role_permissions").select("perm")
    .eq("school_id", p.school_id).eq("role", p.role).eq("perm", perm).maybeSingle();
  return !!data;
}

export async function requirePerm(db: SupabaseClient, p: Profile, perm: string) {
  if (!(await hasPerm(db, p, perm))) throw new HttpError(403, "Your role does not allow this. Ask your principal to change your permissions.");
}

export async function planHas(db: SupabaseClient, schoolId: string, feature: string) {
  const { data } = await db.from("schools").select("status, plans(features)").eq("id", schoolId).single();
  // deno-lint-ignore no-explicit-any
  const s = data as any;
  if (!s) return false;
  if (s.status === "trial") return true;               // trials get every feature
  return (s.plans?.features ?? []).includes(feature);
}

// ---------- sign-in identities ----------------------------------------
// Must match js/auth.js in the web app.
export function normalizePhone(input: string): string | null {
  const d = (input ?? "").replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(d)) return "254" + d.slice(1);
  if (/^254[17]\d{8}$/.test(d)) return d;
  return null;
}
export function loginEmail(identifier: string, schoolCode?: string): string {
  const id = identifier.trim();
  if (id.includes("@")) return id.toLowerCase();
  const ph = normalizePhone(id);
  if (ph) return `${ph}@phone.shulehub.app`;
  if (!schoolCode) throw new HttpError(400, "A school code is needed for admission-number logins.");
  const adm = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!adm) throw new HttpError(400, "Admission number is empty.");
  return `${adm}.${schoolCode.toLowerCase()}@learner.shulehub.app`;
}

const WORDS = ["Simba", "Twiga", "Ndovu", "Chui", "Kifaru", "Nyati", "Duma", "Pundamilia", "Swara", "Kiboko"];
export function tempPassword() {
  const n = crypto.getRandomValues(new Uint32Array(2));
  return `${WORDS[n[0] % WORDS.length]}-${String(1000 + (n[1] % 9000))}`;
}

// ---------- SMS (Africa's Talking) -------------------------------------
export function smsConfigured() { return !!Deno.env.get("AT_API_KEY") && !!Deno.env.get("AT_USERNAME"); }

/** Send an SMS. `logAs` replaces the text saved in sms_log (used so passwords are never stored). */
export async function sendSms(db: SupabaseClient, schoolId: string | null, phones: string[], message: string, logAs?: string) {
  const to = [...new Set(phones.map((p) => normalizePhone(p ?? "")).filter(Boolean) as string[])];
  if (!to.length) return { sent: 0, skipped: phones.length };
  if (!smsConfigured()) return { sent: 0, skipped: to.length, note: "SMS is not set up yet (AT_USERNAME / AT_API_KEY)." };
  const username = env("AT_USERNAME");
  const base = username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  let sent = 0;
  for (let i = 0; i < to.length; i += 100) {             // send in batches of 100
    const batch = to.slice(i, i + 100);
    const body = new URLSearchParams({ username, to: batch.map((p) => "+" + p).join(","), message });
    const from = Deno.env.get("AT_SENDER_ID");
    if (from) body.set("from", from);
    const r = await fetch(`${base}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: env("AT_API_KEY"), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    // deno-lint-ignore no-explicit-any
    const out: any = await r.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const recips: any[] = out?.SMSMessageData?.Recipients ?? [];
    await db.from("sms_log").insert(batch.map((p) => {
      const rec = recips.find((x) => String(x.number).replace(/\D/g, "") === p);
      return { school_id: schoolId, to_phone: p, body: logAs ?? message, status: rec?.status ?? (r.ok ? "Sent" : "Failed"), provider_id: rec?.messageId ?? null };
    }));
    sent += recips.filter((x) => x.status === "Success").length || (r.ok ? batch.length : 0);
  }
  return { sent, skipped: phones.length - to.length };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return await req.json(); } catch { throw new HttpError(400, "The request was not valid JSON."); }
}
