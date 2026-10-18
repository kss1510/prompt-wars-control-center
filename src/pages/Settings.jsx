import React, { useState } from 'react';
import { ROUNDS } from '../data';
import { toCsv, roundFor } from '../lib/rules';
import { PageHead, Field, Empty, fmtDate, downloadFile } from '../components/ui';
import { Download, Eye, EyeOff, Save } from 'lucide-react';

// datetime-local wants local "YYYY-MM-DDTHH:mm".
const toLocalInput = v => { const d = new Date(v); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export function SettingsPage({ctx}){
  const {d,api,act,saving}=ctx;
  const s=d.settings;
  const [form,setForm]=useState({event_name:s.event_name,venue:s.venue,starts_at:toLocalInput(s.starts_at),ends_at:toLocalInput(s.ends_at),team_min_size:s.team_min_size,team_max_size:s.team_max_size,tie_break_rule:s.tie_break_rule||''});
  const [who,setWho]=useState('');
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  function save(e){
    e.preventDefault();
    act(()=>api.updateSettings({...form,starts_at:new Date(form.starts_at).toISOString(),ends_at:new Date(form.ends_at).toISOString(),team_min_size:Number(form.team_min_size),team_max_size:Number(form.team_max_size),tie_break_rule:form.tie_break_rule.trim()||null}),'Event settings saved.');
  }
  function backup(){
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    downloadFile(`prompt-wars-backup-${stamp}.json`,JSON.stringify({exported_at:new Date().toISOString(),mode:ctx.demo?'demo':'supabase',...d,board:ctx.board},null,2),'application/json');
  }
  function exportResults(){
    downloadFile('prompt-wars-results.csv',toCsv([['Rank','Team','Total',...ROUNDS.map(r=>`R${r.id}`),...ROUNDS.map(r=>`R${r.id} platform`),'Tied'],
      ...ctx.board.map(t=>[t.rank,t.name,t.score,...ROUNDS.map(r=>t.rounds[r.id]),...ROUNDS.map(r=>ctx.platformName(d.selections.find(x=>x.team_id===t.id&&x.round_id===r.id)?.platform_id)),t.tied?'yes':''])]));
  }
  const people=d.profiles.filter(p=>`${p.full_name} ${p.email}`.toLowerCase().includes(who.toLowerCase()));
  return <><PageHead eyebrow="HOST" title="Event settings" desc="Official timing, team size, standings visibility, roles, exports and audit trail."/>
    <section className="panel"><div className="panel-title"><div><h2>Event</h2><p className="muted">Confirmed: 23 October 2026, 3:00–5:00 PM IST, ICT Classroom.</p></div></div>
      <form onSubmit={save}><div className="form-grid"><Field label="Event name"><input value={form.event_name} onChange={e=>set('event_name',e.target.value)}/></Field><Field label="Venue"><input value={form.venue} onChange={e=>set('venue',e.target.value)}/></Field></div>
        <div className="form-grid"><Field label="Starts"><input type="datetime-local" value={form.starts_at} onChange={e=>set('starts_at',e.target.value)}/></Field><Field label="Ends"><input type="datetime-local" value={form.ends_at} onChange={e=>set('ends_at',e.target.value)}/></Field></div>
        <div className="form-grid"><Field label="Minimum team size"><input type="number" min="1" max="10" value={form.team_min_size} onChange={e=>set('team_min_size',e.target.value)}/></Field><Field label="Maximum team size"><input type="number" min="1" max="10" value={form.team_max_size} onChange={e=>set('team_max_size',e.target.value)}/></Field></div>
        <Field label="Tie-break rule (shown to everyone)" hint="Confirmed 18 Oct: Round 4 → 3 → 2 → 1. The leaderboard applies this order automatically; changing the order itself needs a code change."><input maxLength="500" value={form.tie_break_rule} onChange={e=>set('tie_break_rule',e.target.value)} placeholder="e.g. Higher Round 4 score, then higher Round 3 score"/></Field>
        <div className="modal-actions"><button className="button primary" disabled={saving}><Save size={16}/> Save settings</button></div></form></section>
    <section className="panel"><div className="panel-title"><div><h2>Standings visibility</h2><p className="muted">{s.leaderboard_visible?'Students can see the leaderboard and their scores.':'Students cannot see standings or scores. Staff still can.'}</p></div>
      <button className="button" disabled={saving} onClick={()=>act(()=>api.updateSettings({leaderboard_visible:!s.leaderboard_visible}),s.leaderboard_visible?'Leaderboard hidden from students.':'Leaderboard visible to students.')}>{s.leaderboard_visible?<><EyeOff size={16}/> Hide from students</>:<><Eye size={16}/> Show to students</>}</button></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Backups and exports</h2><p className="muted">Download a backup before announcing winners. Exports contain participant names and emails — store them privately.</p></div></div>
      <div className="head-actions"><button className="button primary" onClick={backup}><Download size={16}/> Full JSON backup</button><button className="button" onClick={exportResults}><Download size={16}/> Results with platforms (CSV)</button></div></section>
    <section className="panel"><div className="panel-title"><div><h2>People and roles</h2><p className="muted">Promote judges here. Hosts cannot change their own role. Team members must be removed from their team before becoming staff.</p></div></div>
      <input className="search" aria-label="Search people" placeholder="Search name or email…" value={who} onChange={e=>setWho(e.target.value)}/>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Role</th></tr></thead><tbody>{people.map(p=>{const team=d.memberships.find(m=>m.user_id===p.id);return <tr key={p.id}><td><b>{p.full_name||'—'}</b></td><td>{p.email}</td><td>{team?ctx.teamName(team.team_id):'—'}</td><td><select aria-label={`Role for ${p.full_name||p.email}`} value={p.role} disabled={saving||p.id===ctx.profile.id} onChange={e=>window.confirm(`Change ${p.full_name||p.email} to ${e.target.value}?`)&&act(()=>api.setRole(p.id,e.target.value),'Role updated.')}><option value="student">student</option><option value="judge">judge</option><option value="host">host</option></select></td></tr>;})}</tbody></table></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Audit log</h2><p className="muted">Latest 200 changes to teams, platforms, submissions, scores, rounds and roles.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>{d.audit.map(a=><tr key={a.id}><td>{fmtDate(a.created_at)}</td><td>{ctx.personName(a.actor)}<small>{a.actor_role||'maintenance'}</small></td><td>{a.action} {a.table_name}</td><td><small>{describe(a,ctx)}{a.reason?` — reason: ${a.reason}`:''}</small></td></tr>)}{!d.audit.length&&<tr><td colSpan="4"><Empty text="No changes recorded yet."/></td></tr>}</tbody></table></div></section></>;
}

function describe(a,ctx){
  const row=a.new_data||a.old_data||{};
  if(a.table_name==='team_round_platforms') return `${ctx.teamName(row.team_id)} · Round ${row.round_id} → ${ctx.platformName(row.platform_id)}`;
  if(a.table_name==='scores') return `Submission ${row.submission_id} · criterion ${Number(row.criterion_index)+1}: ${a.old_data?.points??'—'} → ${a.new_data?.points??'—'}`;
  if(a.table_name==='submissions') return `${ctx.teamName(row.team_id)} · Round ${row.round_id} (${roundFor(row.round_id)?.name}) · ${a.old_data?.status&&a.old_data.status!==row.status?`${a.old_data.status} → `:''}${row.status}`;
  if(a.table_name==='profiles') return `${row.full_name||row.email}: ${a.old_data?.role} → ${a.new_data?.role}`;
  if(a.table_name==='team_members') return `${ctx.teamName(row.team_id)} · ${ctx.personName(row.user_id)}`;
  return row.name||'';
}
