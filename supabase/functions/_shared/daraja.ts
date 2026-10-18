// Safaricom Daraja helpers shared by the mpesa and mpesa-callback functions.
import { HttpError, env } from "./util.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export type Settings = { school_id: string; environment: string; shortcode: string; shortcode_type: string; passkey: string; consumer_key: string; consumer_secret: string };

export const darajaBase = (s: Settings) => s.environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

export async function settingsFor(db: SupabaseClient, schoolId: string): Promise<Settings> {
  const { data } = await db.from("mpesa_settings").select("*").eq("school_id", schoolId).maybeSingle();
  if (data) return data as Settings;
  // Optional platform-wide fallback (useful for testing with the Daraja sandbox)
  const key = Deno.env.get("MPESA_CONSUMER_KEY");
  if (!key) throw new HttpError(400, "M-Pesa is not set up for this school yet. The bursar or principal can add it under Fees > M-Pesa settings.");
  return { school_id: schoolId, environment: Deno.env.get("MPESA_ENV") ?? "sandbox", shortcode: env("MPESA_SHORTCODE"),
    shortcode_type: Deno.env.get("MPESA_SHORTCODE_TYPE") ?? "paybill", passkey: env("MPESA_PASSKEY"), consumer_key: key, consumer_secret: env("MPESA_CONSUMER_SECRET") };
}

export async function token(s: Settings) {
  const r = await fetch(`${darajaBase(s)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + btoa(`${s.consumer_key}:${s.consumer_secret}`) },
  });
  if (!r.ok) throw new HttpError(502, "Could not connect to M-Pesa. Check the consumer key and secret.");
  return (await r.json()).access_token as string;
}

export function stamp(s: Settings) {
  const d = new Date(Date.now() + 3 * 3600 * 1000);   // East Africa Time
  const ts = d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return { ts, password: btoa(s.shortcode + s.passkey + ts) };
}

export async function stkQuery(s: Settings, checkoutId: string) {
  const t = await token(s); const { ts, password } = stamp(s);
  const r = await fetch(`${darajaBase(s)}/mpesa/stkpushquery/v1/query`, {
    method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ BusinessShortCode: s.shortcode, Password: password, Timestamp: ts, CheckoutRequestID: checkoutId }),
  });
  return await r.json();
}
