import React, { useState } from 'react';
import { teamSizeIssues, teamsWithoutRepresentative, normalizeNames, memberNamesError, toCsv } from '../lib/rules';
import { PageHead, Stat, Empty, Field, downloadFile } from '../components/ui';
import { Download, Lock, Pencil, Trash2, Unlock, Upload, UserCheck, Users, X } from 'lucide-react';

/** One account per team: a representative signs in and submits; everyone is listed by name. */
export function TeamsPage({ctx}){
  const {d,api,act,saving}=ctx;
  const {team_min_size:min,team_max_size:max,teams_locked:locked}=d.settings;
  const students=d.profiles.filter(p=>p.role==='student');
  const free=students.filter(p=>!d.memberships.some(m=>m.user_id===p.id));
  const issues=[...teamSizeIssues(d.teams,min,max).map(i=>i.message),...teamsWithoutRepresentative(d.teams,d.memberships).map(t=>`${t.name} has no representative account.`)];
  const people=d.teams.reduce((n,t)=>n+(t.member_names||[]).length,0);
  function exportRoster(){
    downloadFile('prompt-wars-roster.csv',toCsv([['team','name','email'],...d.teams.flatMap(t=>{
      const rep=d.profiles.find(p=>p.id===d.memberships.find(m=>m.team_id===t.id)?.user_id);
      const names=t.member_names||[];
      // The representative's email goes on the first line, matching the import format.
      return names.length?names.map((n,i)=>[t.name,n,i===0?rep?.email||'':'']):[[t.name,'',rep?.email||'']];
    })]));
  }
  return <><PageHead eyebrow="WORKSPACE / TEAMS" title="Teams" desc={`Teams of ${min}–${max} members. Only one person per team signs up — the representative, who submits for the team.`} actions={<>
    <button className="button" onClick={exportRoster}><Download size={16}/> Export roster</button>
    <button className="button" disabled={locked} onClick={()=>ctx.setModal({type:'import'})}><Upload size={16}/> Import roster</button>
    <button className="button primary" disabled={locked} onClick={()=>ctx.setModal({type:'team'})}><Users size={16}/> Create team</button></>}/>
    <div className="stats"><Stat label="Teams" value={d.teams.length} foot={issues.length?`${issues.length} need attention`:'All teams complete'} icon={Users}/><Stat label="Participants" value={people} foot="Member names across all teams" icon={Users}/><Stat label="Representative accounts" value={`${d.memberships.length}/${d.teams.length}`} foot={`${free.length} signed-up account(s) not linked`} icon={UserCheck}/>
      <div className="stat"><div className="stat-top"><span>Team status</span>{locked?<Lock size={18}/>:<Unlock size={18}/>}</div><div className="stat-value">{locked?'Final':'Open'}</div>
        <button className="button small" disabled={saving} onClick={()=>window.confirm(locked?'Unlock teams? Changes to teams will be allowed again.':'Finalize teams? Teams, members and representatives will be frozen until a host unlocks them.')&&act(()=>api.setTeamsLocked(!locked),locked?'Teams unlocked.':'Teams finalized.')}>{locked?'Unlock teams':'Finalize teams'}</button></div></div>
    {issues.length>0&&<div className="alert info">Before finalizing: {issues.join(' ')}</div>}
    <div className="team-grid">{d.teams.map(t=><TeamCard key={t.id} ctx={ctx} team={t} free={free}/>)}{!d.teams.length&&<Empty text="No teams yet. Create a team or import the roster."/>}</div></>;
}

function TeamCard({ctx,team,free}){
  const {d,api,act,saving}=ctx;
  const {team_min_size:min,team_max_size:max,teams_locked:locked}=d.settings;
  const [renaming,setRenaming]=useState(false);
  const [name,setName]=useState(team.name);
  const [editing,setEditing]=useState(false);
  const [namesText,setNamesText]=useState((team.member_names||[]).join('\n'));
  const names=team.member_names||[];
  const membership=d.memberships.find(m=>m.team_id===team.id);
  const rep=membership&&d.profiles.find(p=>p.id===membership.user_id);
  const draft=normalizeNames(namesText);
  const problem=memberNamesError(draft,max);
  const ok=names.length>=min&&names.length<=max&&Boolean(rep);
  return <article className="team-card" data-testid={`team-${team.name}`}>
    <div className="team-card-head"><span className={`tag ${ok?'':'warn'}`}>{names.length}/{max} MEMBERS</span>
      {renaming?<form className="inline-form" onSubmit={async e=>{e.preventDefault();if(await act(()=>api.renameTeam(team.id,name),'Team renamed.'))setRenaming(false);}}><input aria-label="Team name" value={name} maxLength="60" onChange={e=>setName(e.target.value)}/><button className="button small">Save</button></form>
        :<b>{team.name}</b>}
      <span className="card-actions"><button className="icon-button" title="Rename team" aria-label={`Rename ${team.name}`} onClick={()=>setRenaming(!renaming)}><Pencil size={14}/></button>
        <button className="icon-button" title="Delete team" aria-label={`Delete ${team.name}`} disabled={locked||saving} onClick={()=>window.confirm(`Delete ${team.name}? Only teams without submissions can be deleted.`)&&act(()=>api.deleteTeam(team.id),'Team deleted.')}><Trash2 size={14}/></button></span></div>
    <p className="muted">{d.submissions.filter(s=>s.team_id===team.id&&s.status!=='Rejected').length} submissions{names.length<min||names.length>max?` · needs ${min}–${max} members`:''}</p>

    <div className="rubric-label">REPRESENTATIVE ACCOUNT</div>
    {rep?<div className="member-list"><div><span><UserCheck size={13}/> {rep.full_name||rep.email} <small className="muted">{rep.email}</small></span>
      <button className="text-button danger" disabled={locked||saving} onClick={()=>act(()=>api.removeMember(team.id,rep.id),'Representative unlinked.')} title="Unlink account" aria-label={`Unlink ${rep.full_name||rep.email}`}><X size={14}/></button></div></div>
      :!locked?<Field label="Link representative account"><select defaultValue="" disabled={saving} onChange={e=>{const v=e.target.value;e.target.value='';if(v)act(()=>api.addMember(team.id,v),'Representative linked.');}}><option value="">Choose a signed-up account…</option>{free.map(u=><option key={u.id} value={u.id}>{u.full_name||u.email}{u.full_name?` — ${u.email}`:''}</option>)}</select></Field>
      :<p className="warn-text">No account linked.</p>}

    <div className="rubric-label">MEMBERS</div>
    {editing?<form onSubmit={async e=>{e.preventDefault();if(problem)return;if(await act(()=>api.setMemberNames(team.id,draft),'Members saved.'))setEditing(false);}}>
        <Field label={`Members — one name per line (${draft.length}/${max})`}><textarea rows="5" value={namesText} onChange={e=>setNamesText(e.target.value)}/></Field>
        {problem&&<p className="warn-text" role="alert">{problem}</p>}
        <div className="inline-form"><button className="button small primary" disabled={saving||Boolean(problem)}>Save members</button><button type="button" className="button small" onClick={()=>{setEditing(false);setNamesText(names.join('\n'));}}>Cancel</button></div></form>
      :<><div className="member-chips">{names.map(n=><span key={n} className="chip">{n}</span>)}{!names.length&&<span className="muted">No members listed yet.</span>}</div>
        {!locked&&<button className="button small" onClick={()=>{setNamesText(names.join('\n'));setEditing(true);}}>Edit members</button>}</>}
  </article>;
}
