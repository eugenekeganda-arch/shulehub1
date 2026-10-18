// manage-users: create schools and accounts, reset passwords, change roles.
// Every account is created here (never by public sign-up), so the school
// controls exactly who gets in.
import { serve, json, caller, body, HttpError, requirePerm, loginEmail, normalizePhone,
  tempPassword, sendSms, STAFF_ROLES, type Profile } from "../_shared/util.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

type Person = { full_name: string; email?: string; phone?: string; role: string };

const APP_URL = () => Deno.env.get("APP_URL") ?? "the ShuleHub website";

/** Create a login + profile. Returns the credentials to hand over. */
async function createAccount(db: SupabaseClient, schoolId: string | null, schoolName: string, p: Person, loginId: string, email: string) {
  const password = tempPassword();
  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: p.full_name, role: p.role },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) throw new HttpError(409, `${loginId} already has a ShuleHub account.`);
    throw new HttpError(400, error.message);
  }
  const uid = data.user!.id;
  const phone = p.phone ? normalizePhone(p.phone) : null;
  const { error: e2 } = await db.from("profiles").insert({
    id: uid, school_id: schoolId, role: p.role, full_name: p.full_name.trim(),
    phone, email: p.email?.toLowerCase() || null, login_id: loginId, must_change_password: true,
  });
  if (e2) { await db.auth.admin.deleteUser(uid); throw new HttpError(400, e2.message); }
  let sms = null;
  if (phone) sms = await sendSms(db, schoolId, [phone],
    `Welcome to ShuleHub, ${schoolName}. Sign in at ${APP_URL()} with ${loginId} and password ${password}. You will be asked to change it.`,
    `Welcome to ShuleHub, ${schoolName}. [sign-in details sent; password not logged]`);
  return { user_id: uid, login: loginId, password, sms_sent: !!sms?.sent };
}

function identityFor(p: { email?: string; phone?: string }) {
  if (p.email?.trim()) return { loginId: p.email.trim().toLowerCase(), email: loginEmail(p.email) };
  const ph = p.phone ? normalizePhone(p.phone) : null;
  if (!ph) throw new HttpError(400, "Give an email address or a Kenyan phone number (07xx or 01xx).");
  return { loginId: "0" + ph.slice(3), email: loginEmail(ph) };
}

async function targetProfile(db: SupabaseClient, me: Profile, userId: string) {
  const { data } = await db.from("profiles").select("*").eq("id", userId).single();
  if (!data) throw new HttpError(404, "That person was not found.");
  if (me.role !== "super_admin" && data.school_id !== me.school_id) throw new HttpError(403, "That person is not in your school.");
  return data as Profile;
}

/** Leaders need 'staff' for staff accounts and 'learners' for learner/parent accounts. */
async function requireManage(db: SupabaseClient, me: Profile, role: string) {
  await requirePerm(db, me, STAFF_ROLES.includes(role) ? "staff" : "learners");
}

serve(async (req) => {
  const { db, profile: me } = await caller(req);
  // deno-lint-ignore no-explicit-any
  const b = await body<Record<string, any>>(req);
  const school = me.schools;

  switch (b.action) {
    // ---------------------------------------------------------------- platform owner
    case "create_school": {
      if (me.role !== "super_admin") throw new HttpError(403, "Only the ShuleHub owner can add schools.");
      const code = String(b.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length < 2 || code.length > 8) throw new HttpError(400, "School code must be 2 to 8 letters or numbers, e.g. JAC.");
      if (!b.name?.trim()) throw new HttpError(400, "School name is required.");
      const adminRole = ["director", "principal"].includes(b.admin?.role) ? b.admin.role : "principal";
      if (!b.admin?.full_name?.trim()) throw new HttpError(400, "Give the name of the school's first administrator.");
      const id = identityFor(b.admin);
      const { data: s, error } = await db.from("schools").insert({
        name: b.name.trim(), code, county: b.county || null, phone: normalizePhone(b.phone ?? "") ?? b.phone ?? null,
        email: b.email || null, plan_id: b.plan_id || "standard", status: "trial",
      }).select().single();
      if (error) throw new HttpError(400, /duplicate|unique/i.test(error.message) ? `The code ${code} is already used by another school.` : error.message);
      const { error: e2 } = await db.rpc("setup_school_defaults", { p_school: s.id });
      if (e2) console.error(e2);
      try {
        const creds = await createAccount(db, s.id, s.name, { ...b.admin, role: adminRole }, id.loginId, id.email);
        return json({ school: s, admin: creds });
      } catch (e) {
        await db.from("schools").delete().eq("id", s.id);
        throw e;
      }
    }

    // ---------------------------------------------------------------- staff
    case "create_staff": {
      const role = String(b.role);
      if (!STAFF_ROLES.includes(role)) throw new HttpError(400, "Choose a staff role.");
      const schoolId = me.role === "super_admin" ? b.school_id : me.school_id;
      if (!schoolId) throw new HttpError(400, "Which school?");
      await requirePerm(db, me, "staff");
      if (role === "director" && !["director", "super_admin"].includes(me.role)) throw new HttpError(403, "Only a director can add another director.");
      if (!b.full_name?.trim()) throw new HttpError(400, "Name is required.");
      const id = identityFor(b);
      const { data: sc } = await db.from("schools").select("name").eq("id", schoolId).single();
      const creds = await createAccount(db, schoolId, sc?.name ?? "", { full_name: b.full_name, email: b.email, phone: b.phone, role }, id.loginId, id.email);
      return json(creds);
    }

    // ---------------------------------------------------------------- learners (+ parent)
    case "create_learner": {
      await requirePerm(db, me, "learners");
      const schoolId = me.school_id!;
      if (!b.full_name?.trim() || !b.adm_no?.trim()) throw new HttpError(400, "Learner name and admission number are required.");
      // Data Protection Act s.33: a parent or guardian must have consented before a child's data is processed.
      if (b.consent_confirmed !== true || !String(b.consent_method ?? "").trim())
        throw new HttpError(400, "Confirm that a parent or guardian has given consent, and how, before admitting the learner.");
      const { data: st, error } = await db.from("students").insert({
        school_id: schoolId, class_id: b.class_id || null, full_name: b.full_name.trim(), adm_no: b.adm_no.trim(),
        consent_recorded_at: new Date().toISOString(), consent_recorded_by: me.id, consent_method: String(b.consent_method).slice(0, 120),
      }).select().single();
      if (error) throw new HttpError(400, /duplicate|unique/i.test(error.message) ? `Admission number ${b.adm_no} is already in use.` : error.message);

      const out: Record<string, unknown> = { student: st };
      try {
        if (b.learner_login) {
          const loginId = b.adm_no.trim();
          const creds = await createAccount(db, schoolId, school!.name, { full_name: b.full_name, role: "student" },
            loginId, loginEmail(loginId, school!.code));
          await db.from("students").update({ user_id: creds.user_id }).eq("id", st.id);
          out.learner = { ...creds, school_code: school!.code };
        }
        if (b.parent?.full_name && (b.parent.phone || b.parent.email)) out.parent = await linkParent(db, me, st.id, b.parent);
      } catch (e) {
        out.warning = e instanceof Error ? e.message : String(e);
      }
      return json(out);
    }

    case "add_guardian": {
      await requirePerm(db, me, "learners");
      const { data: st } = await db.from("students").select("id, school_id").eq("id", b.student_id).single();
      if (!st || st.school_id !== me.school_id) throw new HttpError(404, "Learner not found.");
      return json(await linkParent(db, me, st.id, b.parent));
    }

    case "learner_login": {   // give an existing learner a login
      await requirePerm(db, me, "learners");
      const { data: st } = await db.from("students").select("*").eq("id", b.student_id).single();
      if (!st || st.school_id !== me.school_id) throw new HttpError(404, "Learner not found.");
      if (st.user_id) throw new HttpError(409, "This learner already has a login. Use reset password instead.");
      const creds = await createAccount(db, me.school_id, school!.name, { full_name: st.full_name, role: "student" },
        st.adm_no, loginEmail(st.adm_no, school!.code));
      await db.from("students").update({ user_id: creds.user_id }).eq("id", st.id);
      return json({ ...creds, school_code: school!.code });
    }

    // ---------------------------------------------------------------- account changes
    case "reset_password": {
      const t = await targetProfile(db, me, b.user_id);
      if (t.role === "super_admin") throw new HttpError(403, "Not allowed.");
      if (me.role !== "super_admin") await requireManage(db, me, t.role);
      const password = tempPassword();
      const { error } = await db.auth.admin.updateUserById(t.id, { password });
      if (error) throw new HttpError(400, error.message);
      await db.from("profiles").update({ must_change_password: true }).eq("id", t.id);
      const { data: full } = await db.from("profiles").select("login_id, phone").eq("id", t.id).single();
      if (full?.phone) await sendSms(db, t.school_id, [full.phone], `Your ShuleHub password has been reset. Sign in with ${full.login_id} and ${password}.`, "Password reset notice [password not logged]");
      return json({ login: full?.login_id, password, school_code: t.role === "student" ? school?.code : undefined });
    }

    case "set_active": {
      const t = await targetProfile(db, me, b.user_id);
      if (t.id === me.id) throw new HttpError(400, "You cannot deactivate your own account.");
      if (me.role !== "super_admin") await requireManage(db, me, t.role);
      const active = !!b.active;
      await db.auth.admin.updateUserById(t.id, { ban_duration: active ? "none" : "876000h" });
      await db.from("profiles").update({ active }).eq("id", t.id);
      return json({ ok: true, active });
    }

    case "set_role": {
      const t = await targetProfile(db, me, b.user_id);
      const role = String(b.role);
      if (!STAFF_ROLES.includes(role) || !STAFF_ROLES.includes(t.role)) throw new HttpError(400, "Roles can only be changed between staff roles.");
      if (t.id === me.id) throw new HttpError(400, "You cannot change your own role.");
      await requirePerm(db, me, "staff");
      if ((role === "director" || t.role === "director") && !["director", "super_admin"].includes(me.role))
        throw new HttpError(403, "Only a director can give or remove the director role.");
      await db.from("profiles").update({ role }).eq("id", t.id);
      return json({ ok: true });
    }

    case "update_person": {
      const t = await targetProfile(db, me, b.user_id);
      if (t.id !== me.id) { if (me.role !== "super_admin") await requireManage(db, me, t.role); }
      const patch: Record<string, unknown> = {};
      if (b.full_name?.trim()) patch.full_name = b.full_name.trim();
      if (b.phone !== undefined) patch.phone = b.phone ? normalizePhone(b.phone) : null;
      await db.from("profiles").update(patch).eq("id", t.id);
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- deletion (right to erasure)
    case "delete_learner": {
      await requirePerm(db, me, "learners");
      const { data: st } = await db.from("students").select("id, school_id, user_id, full_name").eq("id", b.student_id).single();
      if (!st || st.school_id !== me.school_id) throw new HttpError(404, "Learner not found.");
      const { data: gs } = await db.from("guardians").select("parent_id").eq("student_id", st.id);
      if (st.user_id) await db.auth.admin.deleteUser(st.user_id);          // removes the learner's login and profile
      const { error } = await db.from("students").delete().eq("id", st.id); // marks, attendance, fees, guardians go with it
      if (error) throw new HttpError(400, error.message);
      let parentsRemoved = 0;
      if (b.delete_lone_parents) {
        for (const g of gs ?? []) {
          const { count } = await db.from("guardians").select("student_id", { count: "exact", head: true }).eq("parent_id", g.parent_id);
          if (!count) { await db.auth.admin.deleteUser(g.parent_id); parentsRemoved++; }
        }
      }
      return json({ ok: true, parents_removed: parentsRemoved });
    }

    case "delete_account": {   // a staff member or parent
      const t = await targetProfile(db, me, b.user_id);
      if (t.id === me.id) throw new HttpError(400, "You cannot delete your own account here. Ask another leader or ShuleHub.");
      if (t.role === "super_admin" || t.role === "student") throw new HttpError(400, "Use the learner's page to delete a learner.");
      if (me.role !== "super_admin") {
        await requireManage(db, me, t.role);
        if (t.role === "director" && me.role !== "director") throw new HttpError(403, "Only a director can delete a director.");
      }
      const { error } = await db.auth.admin.deleteUser(t.id);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    case "delete_school": {   // platform owner: end of contract
      if (me.role !== "super_admin") throw new HttpError(403, "Only the ShuleHub owner can delete a school.");
      const { data: sc } = await db.from("schools").select("id, code, name").eq("id", b.school_id).single();
      if (!sc) throw new HttpError(404, "School not found.");
      if (String(b.confirm_code ?? "").toUpperCase() !== sc.code) throw new HttpError(400, "Type the school code to confirm.");
      const { data: people } = await db.from("profiles").select("id").eq("school_id", sc.id);
      for (const p of people ?? []) await db.auth.admin.deleteUser(p.id);
      const { error } = await db.from("schools").delete().eq("id", sc.id);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true, accounts_removed: people?.length ?? 0 });
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});

/** Find or create the parent's account and link them to the learner. */
async function linkParent(db: SupabaseClient, me: Profile, studentId: string, parent: Record<string, string>) {
  const id = identityFor(parent);
  const { data: existing } = await db.from("profiles").select("id, school_id, role").eq("login_id", id.loginId).maybeSingle();
  let parentId: string; let creds: Record<string, unknown> | null = null;
  if (existing) {
    if (existing.school_id !== me.school_id || existing.role !== "parent")
      throw new HttpError(409, `${id.loginId} is already used by another ShuleHub account, so the parent was not linked.`);
    parentId = existing.id;
  } else {
    creds = await createAccount(db, me.school_id, me.schools!.name, { full_name: parent.full_name, email: parent.email, phone: parent.phone, role: "parent" }, id.loginId, id.email);
    parentId = creds.user_id as string;
  }
  await db.from("guardians").upsert({ student_id: studentId, parent_id: parentId, relationship: parent.relationship || "Parent", school_id: me.school_id });
  return creds ? { ...creds, existing: false } : { user_id: parentId, login: id.loginId, existing: true };
}
