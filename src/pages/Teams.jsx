import React, { useState } from 'react';
import { teamSizeIssues, toCsv } from '../lib/rules';
import { PageHead, Stat, Empty, Field, downloadFile } from '../components/ui';
import { Crown, Download, Lock, Pencil, Trash2, Unlock, Upload, Users, X } from 'lucide-react';

export function TeamsPage({ctx}){
  const {d,api,act,saving}=ctx;
  const {team_min_size:min,team_max_size:max,teams_locked:locked}=d.settings;
  const students=d.profiles.filter(p=>p.role==='student');
  const free=students.filter(p=>!d.memberships.some(m=>m.user_id===p.id));
  const issues=teamSizeIssues(d.teams,d.memberships,min,max);
  function exportRoster(){
    downloadFile('prompt-wars-roster.csv',toCsv([['Team','Member','Email','Captain'],...d.teams.flatMap(t=>d.memberships.filter(m=>m.team_id===t.id).map(m=>{const p=d.profiles.find(x=>x.id===m.user_id);return [t.name,p?.full_name,p?.email,t.captain_id===m.user_id?'yes':''];})),...free.map(p=>['(unassigned)',p.full_name,p.email,''])]));
  }
  return <><PageHead eyebrow="WORKSPACE / TEAMS" title="Teams" desc={`Teams of ${min}–${max}. The team count follows actual registrations — nothing is fixed.`} actions={<>
    <button className="button" onClick={exportRoster}><Download size={16}/> Export roster</button>
    <button className="button" disabled={locked} onClick={()=>ctx.setModal({type:'import'})}><Upload size={16}/> Import roster</button>
    <button className="button primary" disabled={locked} onClick={()=>ctx.setModal({type:'team'})}><Users size={16}/> Create team</button></>}/>
    <div className="stats"><Stat label="Registered students" value={students.length} foot="Accounts with student role" icon={Users}/><Stat label="Assigned" value={students.length-free.length} foot={`${free.length} unassigned`} icon={Users}/><Stat label="Teams" value={d.teams.length} foot={issues.length?`${issues.length} outside ${min}–${max}`:'All sizes valid'} icon={Users}/>
      <div className="stat"><div className="stat-top"><span>Membership</span>{locked?<Lock size={18}/>:<Unlock size={18}/>}</div><div className="stat-value">{locked?'Final':'Open'}</div>
        <button className="button small" disabled={saving} onClick={()=>window.confirm(locked?'Unlock teams? Membership changes will be allowed again.':'Finalize teams? Membership will be frozen until a host unlocks it.')&&act(()=>api.setTeamsLocked(!locked),locked?'Teams unlocked.':'Teams finalized.')}>{locked?'Unlock teams':'Finalize teams'}</button></div></div>
    {issues.length>0&&<div className="alert info">Before finalizing: {issues.map(i=>i.message).join(' ')}</div>}
    <div className="team-grid">{d.teams.map(t=><TeamCard key={t.id} ctx={ctx} team={t} free={free}/>)}{!d.teams.length&&<Empty text="No teams yet. Create a team or import the roster."/>}</div></>;
}

function TeamCard({ctx,team,free}){
  const {d,api,act,saving}=ctx;
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(team.name);
  const members=d.memberships.filter(m=>m.team_id===team.id);
  const {team_min_size:min,team_max_size:max,teams_locked:locked}=d.settings;
  const ok=members.length>=min&&members.length<=max;
  return <article className="team-card" data-testid={`team-${team.name}`}>
    <div className="team-card-head"><span className={`tag ${ok?'':'warn'}`}>{members.length}/{max} MEMBERS</span>
      {editing?<form className="inline-form" onSubmit={async e=>{e.preventDefault();if(await act(()=>api.renameTeam(team.id,name),'Team renamed.'))setEditing(false);}}><input aria-label="Team name" value={name} maxLength="60" onChange={e=>setName(e.target.value)}/><button className="button small">Save</button></form>
        :<b>{team.name}</b>}
      <span className="card-actions"><button className="icon-button" title="Rename team" aria-label={`Rename ${team.name}`} onClick={()=>setEditing(!editing)}><Pencil size={14}/></button>
        <button className="icon-button" title="Delete team" aria-label={`Delete ${team.name}`} disabled={locked||saving} onClick={()=>window.confirm(`Delete ${team.name}? Only teams without submissions can be deleted.`)&&act(()=>api.deleteTeam(team.id),'Team deleted.')}><Trash2 size={14}/></button></span></div>
    <p className="muted">{d.submissions.filter(s=>s.team_id===team.id&&s.status!=='Rejected').length} submissions{!ok?` · needs ${min}–${max} members`:''}</p>
    <div className="member-list">{members.map(m=>{const p=d.profiles.find(x=>x.id===m.user_id);const captain=team.captain_id===m.user_id;return <div key={m.user_id}>
      <span>{captain&&<Crown size={13} aria-label="Captain"/>} {p?.full_name||p?.email||m.user_id}</span>
      <span><button className="text-button" disabled={saving} title={captain?'Remove captain':'Make captain'} onClick={()=>act(()=>api.setCaptain(team.id,captain?null:m.user_id),captain?'Captain cleared.':'Captain set.')}>{captain?'Captain':'Make captain'}</button>
        <button className="text-button danger" disabled={locked||saving} onClick={()=>act(()=>api.removeMember(team.id,m.user_id),'Member removed.')} title="Remove member" aria-label={`Remove ${p?.full_name}`}><X size={14}/></button></span></div>;})}</div>
    {!locked&&members.length<max&&<Field label="Assign a student"><select defaultValue="" disabled={saving} onChange={e=>{const v=e.target.value;e.target.value='';if(v)act(()=>api.addMember(team.id,v),'Member assigned.');}}><option value="">Choose registered student…</option>{free.map(u=><option key={u.id} value={u.id}>{u.full_name||u.email}</option>)}</select></Field>}
  </article>;
}
