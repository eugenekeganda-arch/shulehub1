-- =====================================================================
-- ShuleHub · Row Level Security
-- Rule of thumb: you see your own school only; leaders act within the
-- permissions their role has been given; teachers act on the classes
-- they teach; learners and parents see only their own learner(s).
-- The platform owner (super_admin) sees every school.
-- =====================================================================

do $$ declare t text; begin
  foreach t in array array['plans','schools','platform_invoices','platform_payments','profiles','role_permissions','terms',
    'classes','subjects','teaching_assignments','students','guardians','exams','marks','mark_submissions','attendance',
    'exam_papers','homework','fee_items','fee_charges','payments','mpesa_requests','mpesa_settings','mpesa_unmatched','announcements',
    'events','messages','message_reports','meetings','sms_log','quizzes','quiz_attempts','ai_usage']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- ---------- platform -------------------------------------------------
create policy plans_read  on plans for select to authenticated using (true);
create policy plans_write on plans for all    to authenticated using (is_super()) with check (is_super());

create policy schools_read  on schools for select to authenticated
  using (is_super() or id = (select school_id from profiles where id = auth.uid()));
create policy schools_write on schools for all to authenticated using (is_super()) with check (is_super());

create policy pinv_read  on platform_invoices for select to authenticated using (is_super() or (school_id = my_school() and has_perm('fees')));
create policy pinv_write on platform_invoices for all to authenticated using (is_super()) with check (is_super());
create policy ppay_read  on platform_payments for select to authenticated using (is_super() or (school_id = my_school() and has_perm('fees')));
create policy ppay_write on platform_payments for all to authenticated using (is_super()) with check (is_super());

-- ---------- people ---------------------------------------------------
-- Your own profile always (so a suspended school can still show its notice);
-- staff see everyone in their school; the owner sees all.
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or is_super() or (school_id = my_school() and is_staff()));
-- Accounts are created and changed by server functions (service role), not the browser.
create policy profiles_super on profiles for update to authenticated using (is_super()) with check (is_super());

create policy perms_read  on role_permissions for select to authenticated using (school_id = my_school() or is_super());
create policy perms_write on role_permissions for all to authenticated
  using (school_id = my_school() and has_perm('staff') and role <> 'director')
  with check (school_id = my_school() and has_perm('staff') and role <> 'director');

-- ---------- academic structure --------------------------------------
create policy terms_read  on terms for select to authenticated using (school_id = my_school());
create policy terms_write on terms for all to authenticated
  using (school_id = my_school() and has_perm('settings')) with check (school_id = my_school() and has_perm('settings'));

create policy classes_read  on classes for select to authenticated using (school_id = my_school());
create policy classes_write on classes for all to authenticated
  using (school_id = my_school() and has_perm('settings')) with check (school_id = my_school() and has_perm('settings'));

create policy subjects_read  on subjects for select to authenticated using (school_id = my_school());
create policy subjects_write on subjects for all to authenticated
  using (school_id = my_school() and has_perm('settings')) with check (school_id = my_school() and has_perm('settings'));

create policy ta_read  on teaching_assignments for select to authenticated using (school_id = my_school());
create policy ta_write on teaching_assignments for all to authenticated
  using (school_id = my_school() and has_perm('staff')) with check (school_id = my_school() and has_perm('staff'));

create policy students_read on students for select to authenticated
  using (school_id = my_school() and (is_staff() or id in (select my_student_ids())));
create policy students_write on students for update to authenticated
  using (school_id = my_school() and has_perm('learners')) with check (school_id = my_school() and has_perm('learners'));
-- New learners are admitted through the manage-users server function (it also creates logins).

create policy guardians_read on guardians for select to authenticated
  using (school_id = my_school() and (is_staff() or parent_id = auth.uid() or student_id in (select my_student_ids())));
create policy guardians_write on guardians for delete to authenticated
  using (school_id = my_school() and has_perm('learners'));

-- ---------- assessment ----------------------------------------------
create policy exams_read  on exams for select to authenticated using (school_id = my_school());
create policy exams_write on exams for all to authenticated
  using (school_id = my_school() and has_perm('results')) with check (school_id = my_school() and has_perm('results'));

create policy marks_read on marks for select to authenticated
  using (school_id = my_school() and (
    is_staff()
    or (student_id in (select my_student_ids())
        and exists (select 1 from exams e where e.id = exam_id and e.status = 'published'))));
create policy marks_insert on marks for insert to authenticated
  with check (school_id = my_school() and can_enter_mark(exam_id, student_id, subject_id));
create policy marks_update on marks for update to authenticated
  using (school_id = my_school() and can_enter_mark(exam_id, student_id, subject_id))
  with check (school_id = my_school() and can_enter_mark(exam_id, student_id, subject_id));
create policy marks_delete on marks for delete to authenticated
  using (school_id = my_school() and can_enter_mark(exam_id, student_id, subject_id));

create policy subs_read on mark_submissions for select to authenticated using (school_id = my_school() and is_staff());
create policy subs_write on mark_submissions for all to authenticated
  using (school_id = my_school() and (teaches(class_id, subject_id) or has_perm('results')))
  with check (school_id = my_school() and (teaches(class_id, subject_id) or has_perm('results'))
              and exists (select 1 from exams e where e.id = exam_id and e.status = 'draft'));

create policy att_read on attendance for select to authenticated
  using (school_id = my_school() and (is_staff() or student_id in (select my_student_ids())));
create policy att_write on attendance for all to authenticated
  using (school_id = my_school() and (has_perm('learners')
         or teaches_class((select class_id from students s where s.id = student_id))))
  with check (school_id = my_school() and (has_perm('learners')
         or teaches_class((select class_id from students s where s.id = student_id))));

create policy papers_read on exam_papers for select to authenticated using (school_id = my_school() and is_staff());
create policy papers_write on exam_papers for all to authenticated
  using (school_id = my_school() and created_by = auth.uid())
  with check (school_id = my_school() and created_by = auth.uid() and is_staff());

create policy hw_read on homework for select to authenticated
  using (school_id = my_school() and (is_staff() or class_id in (select my_class_ids())));
create policy hw_write on homework for all to authenticated
  using (school_id = my_school() and (created_by = auth.uid() or has_perm('learners')))
  with check (school_id = my_school() and is_staff() and (teaches_class(class_id) or has_perm('learners')));

-- ---------- fees ----------------------------------------------------
create policy fi_read  on fee_items for select to authenticated using (school_id = my_school());
create policy fi_write on fee_items for all to authenticated
  using (school_id = my_school() and has_perm('fees')) with check (school_id = my_school() and has_perm('fees'));

create policy fc_read on fee_charges for select to authenticated
  using (school_id = my_school() and (has_perm('fees') or student_id in (select my_student_ids())));
create policy fc_write on fee_charges for all to authenticated
  using (school_id = my_school() and has_perm('fees')) with check (school_id = my_school() and has_perm('fees'));

create policy pay_read on payments for select to authenticated
  using (school_id = my_school() and (has_perm('fees') or student_id in (select my_student_ids())));
create policy pay_insert on payments for insert to authenticated
  with check (school_id = my_school() and has_perm('payments') and recorded_by = auth.uid());
create policy pay_delete on payments for delete to authenticated
  using (school_id = my_school() and has_perm('payments') and mpesa_receipt is null);

create policy mreq_read on mpesa_requests for select to authenticated
  using (school_id = my_school() and (requested_by = auth.uid() or has_perm('fees')));
create policy unmatched_read on mpesa_unmatched for select to authenticated
  using (school_id = my_school() and has_perm('fees'));
create policy unmatched_delete on mpesa_unmatched for delete to authenticated
  using (school_id = my_school() and has_perm('payments'));
-- mpesa_settings: no policies at all, so nothing in the browser can read the secrets.

-- ---------- communication -------------------------------------------
create policy ann_read on announcements for select to authenticated
  using (school_id = my_school() and (
       audience = 'everyone'
    or (audience = 'staff'    and is_staff())
    or (audience = 'parents'  and (my_role() = 'parent' or is_staff()))
    or (audience = 'learners' and (my_role() = 'student' or is_staff()))));
create policy ann_write on announcements for all to authenticated
  using (school_id = my_school() and has_perm('announce'))
  with check (school_id = my_school() and has_perm('announce') and created_by = auth.uid());

create policy events_read  on events for select to authenticated using (school_id = my_school());
create policy events_write on events for all to authenticated
  using (school_id = my_school() and has_perm('calendar')) with check (school_id = my_school() and has_perm('calendar'));

create policy msg_read on messages for select to authenticated
  using (school_id = my_school() and (sender = auth.uid() or recipient = auth.uid()));
create policy msg_send on messages for insert to authenticated
  with check (school_id = my_school() and sender = auth.uid() and can_message(recipient));
create policy msg_mark_read on messages for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());

create policy rep_insert on message_reports for insert to authenticated
  with check (school_id = my_school() and reporter = auth.uid());
create policy rep_read on message_reports for select to authenticated
  using (school_id = my_school() and (reporter = auth.uid() or has_perm('welfare')));
create policy rep_update on message_reports for update to authenticated
  using (school_id = my_school() and has_perm('welfare')) with check (school_id = my_school() and has_perm('welfare'));

create policy meet_read on meetings for select to authenticated
  using (school_id = my_school() and (teacher_id = auth.uid() or parent_id = auth.uid() or has_perm('welfare')));
create policy meet_insert on meetings for insert to authenticated
  with check (school_id = my_school() and created_by = auth.uid() and (
       (teacher_id = auth.uid() and is_staff())
    or (parent_id = auth.uid() and my_role() = 'parent' and status = 'requested'
        and (student_id is null or student_id in (select my_student_ids())))));
create policy meet_update on meetings for update to authenticated
  using (school_id = my_school() and (teacher_id = auth.uid() or parent_id = auth.uid()))
  with check (school_id = my_school() and (teacher_id = auth.uid() or parent_id = auth.uid()));

create policy sms_read on sms_log for select to authenticated using (is_super() or (school_id = my_school() and has_perm('announce')));

-- ---------- learning ------------------------------------------------
create policy quiz_read on quizzes for select to authenticated
  using (school_id = my_school() and (is_staff() or class_id is null or class_id in (select my_class_ids())));
create policy quiz_insert on quizzes for insert to authenticated
  with check (school_id = my_school() and created_by = auth.uid()
              and my_role() in ('student','teacher','director','principal','deputy_principal','head_teacher')
              and (class_id is null or is_staff() or class_id in (select my_class_ids())));
create policy quiz_delete on quizzes for delete to authenticated
  using (school_id = my_school() and (created_by = auth.uid() or has_perm('welfare')));

create policy qa_read   on quiz_attempts for select to authenticated using (school_id = my_school());
create policy qa_insert on quiz_attempts for insert to authenticated
  with check (school_id = my_school() and user_id = auth.uid());
-- ai_usage: written only by the ai server function.

-- ---------- realtime for chat ---------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages;
  end if;
exception when duplicate_object then null; end $$;

-- ---------- explicit grants on views ---------------------------------
revoke all on directory, student_balances, school_billing from anon;
grant select on directory, student_balances, school_billing to authenticated;
