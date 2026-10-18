// mpesa: fee payments through Safaricom Daraja.
//  - stk:          send an M-Pesa PIN prompt to a parent's phone (Lipa na M-Pesa Online)
//  - status:       check a prompt's result (used by the app while waiting)
//  - register_c2b: register the school's paybill so manual Paybill payments are receipted automatically
import { serve, json, caller, body, HttpError, requirePerm, normalizePhone, env } from "../_shared/util.ts";
import { settingsFor, token, stamp, darajaBase } from "../_shared/daraja.ts";

const callbackUrl = (schoolId: string, type: string) =>
  `${env("SUPABASE_URL")}/functions/v1/mpesa-callback?type=${type}&school=${schoolId}&key=${encodeURIComponent(env("MPESA_CALLBACK_SECRET"))}`;

serve(async (req) => {
  const { db, profile: me } = await caller(req);
  // deno-lint-ignore no-explicit-any
  const b = await body<Record<string, any>>(req);

  if (b.action === "stk") {
    const amount = Math.round(Number(b.amount));
    if (!(amount >= 1 && amount <= 250000)) throw new HttpError(400, "Enter an amount between KSh 1 and KSh 250,000.");
    const phone = normalizePhone(String(b.phone ?? ""));
    if (!phone) throw new HttpError(400, "Enter a Safaricom number like 0712 345 678.");
    const { data: st } = await db.from("students").select("id, school_id, adm_no, full_name").eq("id", b.student_id).single();
    if (!st || st.school_id !== me.school_id) throw new HttpError(404, "Learner not found.");
    // Parents may only pay for their own children; staff need the fees permission.
    if (me.role === "parent") {
      const { data: g } = await db.from("guardians").select("student_id").eq("student_id", st.id).eq("parent_id", me.id).maybeSingle();
      if (!g) throw new HttpError(403, "You can only pay for your own children.");
    } else await requirePerm(db, me, "fees");

    const s = await settingsFor(db, st.school_id);
    const t = await token(s); const { ts, password } = stamp(s);
    const r = await fetch(`${darajaBase(s)}/mpesa/stkpush/v1/processrequest`, {
      method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: s.shortcode, Password: password, Timestamp: ts,
        TransactionType: s.shortcode_type === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: amount, PartyA: phone, PartyB: s.shortcode, PhoneNumber: phone,
        CallBackURL: callbackUrl(st.school_id, "stk"),
        AccountReference: st.adm_no.replace(/[^A-Za-z0-9]/g, "").slice(0, 12),
        TransactionDesc: "School fees",
      }),
    });
    // deno-lint-ignore no-explicit-any
    const out: any = await r.json().catch(() => ({}));
    if (!r.ok || out.ResponseCode !== "0") throw new HttpError(502, out.errorMessage || out.ResponseDescription || "M-Pesa did not accept the request.");
    await db.from("mpesa_requests").insert({
      checkout_request_id: out.CheckoutRequestID, school_id: st.school_id, student_id: st.id,
      phone, amount, requested_by: me.id,
    });
    return json({ checkout_request_id: out.CheckoutRequestID, message: "Check your phone and enter your M-Pesa PIN." });
  }

  if (b.action === "status") {
    const { data: rq } = await db.from("mpesa_requests").select("*").eq("checkout_request_id", b.checkout_request_id).single();
    if (!rq || (rq.requested_by !== me.id && rq.school_id !== me.school_id)) throw new HttpError(404, "Payment request not found.");
    return json({ status: rq.status, receipt: rq.receipt, result: rq.result_desc });
  }

  if (b.action === "register_c2b") {
    await requirePerm(db, me, "settings");
    const s = await settingsFor(db, me.school_id!);
    if (s.shortcode_type !== "paybill") throw new HttpError(400, "Automatic receipting of manual payments needs a Paybill number.");
    const t = await token(s);
    const r = await fetch(`${darajaBase(s)}/mpesa/c2b/v1/registerurl`, {
      method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ShortCode: s.shortcode, ResponseType: "Completed",
        ConfirmationURL: callbackUrl(me.school_id!, "c2b"), ValidationURL: callbackUrl(me.school_id!, "validate") }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(502, out.errorMessage || "M-Pesa did not accept the registration.");
    return json({ ok: true, response: out });
  }

  throw new HttpError(400, "Unknown action.");
});
