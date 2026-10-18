// mpesa-callback: Safaricom calls this URL (no user login), so every call is checked:
//  - the secret key in the URL must match MPESA_CALLBACK_SECRET
//  - STK results are confirmed with Safaricom (STK query) before a payment is saved
//  - M-Pesa receipt numbers are unique, so a repeated callback never double-counts
import { admin, env } from "../_shared/util.ts";
import { settingsFor, stkQuery } from "../_shared/daraja.ts";

const ok = (desc = "Accepted") =>
  new Response(JSON.stringify({ ResultCode: 0, ResultDesc: desc }), { headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== env("MPESA_CALLBACK_SECRET")) return new Response("Forbidden", { status: 403 });
  const type = url.searchParams.get("type");
  const schoolId = url.searchParams.get("school") ?? "";
  // deno-lint-ignore no-explicit-any
  const b: any = await req.json().catch(() => ({}));
  const db = admin();

  try {
    // ---------------------------------------------------- STK push result
    if (type === "stk") {
      const cb = b?.Body?.stkCallback;
      if (!cb?.CheckoutRequestID) return ok("Ignored");
      const { data: rq } = await db.from("mpesa_requests").select("*")
        .eq("checkout_request_id", cb.CheckoutRequestID).eq("school_id", schoolId).maybeSingle();
      if (!rq || rq.status !== "pending") return ok("Already handled");

      if (Number(cb.ResultCode) !== 0) {
        await db.from("mpesa_requests").update({ status: "failed", result_desc: cb.ResultDesc }).eq("checkout_request_id", rq.checkout_request_id);
        return ok();
      }
      // Confirm with Safaricom that this really succeeded
      const s = await settingsFor(db, schoolId);
      const q = await stkQuery(s, rq.checkout_request_id);
      if (String(q.ResultCode) !== "0") {
        await db.from("mpesa_requests").update({ status: "failed", result_desc: q.ResultDesc ?? "Not confirmed by M-Pesa" }).eq("checkout_request_id", rq.checkout_request_id);
        return ok();
      }
      // deno-lint-ignore no-explicit-any
      const meta: Record<string, any> = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i: any) => [i.Name, i.Value]));
      const receipt = String(meta.MpesaReceiptNumber ?? "");
      const amount = Math.round(Number(meta.Amount ?? rq.amount));
      if (!receipt) return ok("No receipt");
      const { error } = await db.from("payments").insert({
        school_id: rq.school_id, student_id: rq.student_id, amount, method: "M-Pesa", reference: receipt,
        mpesa_receipt: receipt,
      });
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
      await db.from("mpesa_requests").update({ status: "paid", receipt, result_desc: cb.ResultDesc }).eq("checkout_request_id", rq.checkout_request_id);
      return ok();
    }

    // ---------------------------------------------------- Paybill validation (accept everything; we match after)
    if (type === "validate") return ok();

    // ---------------------------------------------------- Paybill confirmation (parent paid manually)
    if (type === "c2b") {
      const transId = String(b.TransID ?? "");
      const amount = Math.round(Number(b.TransAmount ?? 0));
      if (!transId || !amount) return ok("Ignored");
      const s = await settingsFor(db, schoolId);
      if (String(b.BusinessShortCode) !== String(s.shortcode)) return ok("Wrong shortcode");
      const ref = String(b.BillRefNumber ?? "").trim();
      const norm = ref.toLowerCase().replace(/[^a-z0-9]/g, "");
      const { data: learners } = await db.from("students").select("id, adm_no").eq("school_id", schoolId);
      const match = (learners ?? []).find((l) => l.adm_no.toLowerCase().replace(/[^a-z0-9]/g, "") === norm);
      const payer = [b.FirstName, b.MiddleName, b.LastName].filter(Boolean).join(" ");
      if (match) {
        const { error } = await db.from("payments").insert({
          school_id: schoolId, student_id: match.id, amount, method: "M-Pesa", reference: `${transId} · ${payer}`.trim(),
          mpesa_receipt: transId,
        });
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      } else {
        await db.from("mpesa_unmatched").upsert({ trans_id: transId, school_id: schoolId, amount, bill_ref: ref, msisdn: String(b.MSISDN ?? ""), payer_name: payer });
      }
      return ok();
    }
    return ok("Unknown type");
  } catch (e) {
    console.error(e);
    // Tell Safaricom we received it; the error is in the function logs for the developer.
    return ok("Received");
  }
});
