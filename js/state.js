// Shared app state and action registries (kept separate so views and app.js can both import it).
import { LEADER_ROLES, STAFF_ROLES } from './lib.js';

export const S = { me: null, school: null, perms: new Set(), classes: [], subjects: [], terms: [], names: new Map(), assignments: [], unread: 0, view: null, params: {}, features: [] };
export const ACT = {};   // data-a="name"  → click handlers
export const FORM = {};  // data-f="name"  → form submit handlers (return false to keep the page as is)
export const CHG = {};   // data-c="name"  → change handlers

/** Filled in by app.js at start-up. */
export const hooks = { go: null, render: null, reloadLookups: null, modal: null };
export const go = (view, params) => hooks.go(view, params);
export const refresh = () => hooks.render();
export const reloadLookups = () => hooks.reloadLookups();

export const can = (p) => S.me?.role === 'super_admin' || S.me?.role === 'director' || S.perms.has(p);
export const isStaff = () => STAFF_ROLES.includes(S.me?.role);
export const isLeader = () => LEADER_ROLES.includes(S.me?.role);
export const nameOf = (id) => S.names.get(id)?.full_name || 'Someone';
export const className = (id) => S.classes.find((c) => c.id === id)?.name || 'No class';
export const subj = (id) => S.subjects.find((s) => s.id === id);
export const currentTerm = () => S.terms.find((t) => t.is_current) || S.terms[0] || null;
export const teachesAnything = () => S.assignments.length > 0 || S.classes.some((c) => c.class_teacher === S.me?.id);
/** Classes this person teaches or is class teacher of (leaders with 'learners' see all). */
export const myClasses = (all = false) => all ? S.classes : S.classes.filter((c) => c.class_teacher === S.me?.id || S.assignments.some((a) => a.class_id === c.id));
/** Is a plan feature switched on for this school? Trials get everything. */
export const hasFeature = (f) => S.school?.status === 'trial' || (S.features || []).includes(f);

/** An in-page confirmation step (browsers' confirm() is unreliable and not accessible enough). */
let pending = null;
export function confirmAction({ title, body, confirmLabel, danger = true, onConfirm }) {
  pending = onConfirm;
  hooks.modal(title, `${body}<div class="row"><button class="btn ${danger ? 'danger' : ''}" data-a="confirm-yes">${confirmLabel}</button><button class="btn ghost" data-a="close-modal">Cancel</button></div>`);
}
ACT['confirm-yes'] = async (a) => {
  const f = pending; if (!f) return;
  const box = a.closest('.mbody'); const extra = {};
  box?.querySelectorAll('input,select').forEach((i) => { if (i.name) extra[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
  a.disabled = true;
  try { await f(extra); pending = null; } finally { a.disabled = false; }
};
