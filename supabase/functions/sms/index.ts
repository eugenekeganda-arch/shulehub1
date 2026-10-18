// sms: text parents and staff through Africa's Talking.
//  - announcement:  send a posted announcement to its audience
//  - fee_reminders: remind parents of learners with a balance
//  - meeting:       tell a parent about a confirmed meeting
import { serve, json, caller, body, HttpError, requirePerm, sendSms, smsConfigured, STAFF_ROLES } from "../_shared/util.ts";

const ksh = (n: number) => "KSh " + Math.round(n).toLocaleString("en-KE");

serve(async (req) => {
  const { db, profile: me } = await caller(req);
  // deno-lint-ignore no-explicit-any
  const b = await body<Record<string, any>>(req);
  const schoolId = me.school_id!;
  const school = me.schools!;
  if (!smsConfigured()) throw new HttpError(503, "SMS is not set up yet. The ShuleHub owner needs to add Africa's Talking keys.");

  if (b.action === "announcement") {
    await requirePerm(db, me, "announce");
    const { data: a } = await db.from("announcements").select("*").eq("id", b.announcement_id).eq("school_id", schoolId).single();
    if (!a) throw new HttpError(404, "Announcement not found.");
    const phones: string[] = [];
    if (a.audience === "everyone" || a.audience === "parents") {
      const { data } = await db.from("profiles").select("phone").eq("school_id", schoolId).eq("role", "parent").eq("active", true);
      phones.push(...(data ?? []).map((p) => p.phone).filter(Boolean));
    }
    if (a.audience === "everyone" || a.audience === "staff") {
      const { data } = await db.from("profiles").select("phone").eq("school_id", schoolId).in("role", STAFF_ROLES).eq("active", true);
      phones.push(...(data ?? []).map((p) => p.phone).filter(Boolean));
    }
    const text = `${school.name}: ${a.title}. ${a.body}`.slice(0, 459);
    return json(await sendSms(db, schoolId, phones, text));
  }

  if (b.action === "fee_reminders") {
    await requirePerm(db, me, "fees");
    const { data: bal } = await db.from("student_balances").select("student_id, full_name, adm_no, balance").eq("school_id", schoolId).gt("balance", 0);
    const ids = (bal ?? []).map((x) => x.student_id);
    if (!ids.length) return json({ sent: 0, note: "No learner has a balance." });
    const { data: g } = await db.from("guardians").select("student_id, profiles(phone)").in("student_id", ids);
    let sent = 0;
    for (const x of bal ?? []) {
      // deno-lint-ignore no-explicit-any
      const phones = (g ?? []).filter((r) => r.student_id === x.student_id).map((r: any) => r.profiles?.phone).filter(Boolean);
      if (!phones.length) continue;
      const pay = school.paybill ? ` Pay via M-Pesa Paybill ${school.paybill}, account ${x.adm_no}.` : "";
      const r = await sendSms(db, schoolId, phones, `${school.name}: Dear parent, ${x.full_name.split(" ")[0]}'s fee balance is ${ksh(x.balance)}.${pay} Thank you.`);
      sent += r.sent;
    }
    return json({ sent, learners: ids.length });
  }

  if (b.action === "meeting") {
    const { data: m } = await db.from("meetings").select("*, profiles!meetings_parent_id_fkey(phone)").eq("id", b.meeting_id).single();
    if (!m || m.school_id !== schoolId || m.teacher_id !== me.id) throw new HttpError(404, "Meeting not found.");
    const when = new Date(m.starts_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    // deno-lint-ignore no-explicit-any
    return json(await sendSms(db, schoolId, [(m as any).profiles?.phone], `${school.name}: ${me.full_name} has booked a ${m.mode} call with you on ${when} about "${m.topic}". Join from the Meetings page on ShuleHub.`));
  }

  throw new HttpError(400, "Unknown action.");
});
