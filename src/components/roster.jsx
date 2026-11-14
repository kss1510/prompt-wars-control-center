import React from 'react';
import { DEFAULT_ROLE_ORDER, TEAM_ROLES, rosterArrays } from '../lib/rules.js';

/** Editable rows ({name, role}) for a team, sized to the maximum team size. */
export function rosterRows(names = [], roles = [], max = 5, { suggest = true } = {}) {
  const size = Math.max(max, names.length);
  const hasRoles = roles.some(Boolean);
  return Array.from({ length: size }, (_, i) => ({
    name: names[i] || '',
    role: roles[i] || (!hasRoles && suggest ? DEFAULT_ROLE_ORDER[i] || '' : '')
  }));
}
export { rosterArrays };

export const ROLE_SUMMARY = 'Pilot · 2 Prompt Crafters · Debugger/Verifier · Strategist/Scribe';

/**
 * Name + role for every team member. `firstLabel` names the first row (the representative);
 * `firstName` (when given) replaces that row's name input with a fixed value.
 */
export function RosterEditor({ rows, onChange, firstLabel, firstName, optionalRoles = false, hint }) {
  const set = (i, key, value) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  return <fieldset className="roster">
    <legend>Team members and roles</legend>
    <p className="hint roster-summary">Roles: {ROLE_SUMMARY}</p>
    {rows.map((r, i) => {
      const label = i === 0 && firstLabel ? firstLabel : `Member ${i + 1}`;
      return <div className="roster-row" key={i}>
        <label className="field"><span>{label}</span>
          {i === 0 && firstName !== undefined
            ? <input aria-label={`Member ${i + 1} name`} value={firstName} readOnly placeholder="Your full name (above)"/>
            : <input aria-label={`Member ${i + 1} name`} maxLength="80" value={r.name} onChange={e => set(i, 'name', e.target.value)} placeholder={i === 0 ? 'Full name' : 'Teammate’s full name'}/>}
        </label>
        <label className="field"><span>Role</span>
          <select aria-label={`Member ${i + 1} role`} value={r.role} onChange={e => set(i, 'role', e.target.value)}>
            <option value="">{optionalRoles ? 'No role' : 'Choose a role…'}</option>
            {TEAM_ROLES.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
        </label>
      </div>;
    })}
    {hint && <small className="hint">{hint}</small>}
  </fieldset>;
}

/** Member chips: "Name · Role". */
export function MemberChips({ names = [], roles = [], empty = 'No member names yet.' }) {
  return <div className="member-chips">
    {names.map((n, i) => <span key={n} className="chip">{n}{roles[i] && <small className="muted"> · {roles[i]}</small>}</span>)}
    {!names.length && <span className="muted">{empty}</span>}
  </div>;
}
