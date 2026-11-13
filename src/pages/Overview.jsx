import React, { useEffect, useRef, useState } from 'react';
import { ROUNDS, MAX_TOTAL } from '../data';
import { readinessChecks, isRoundAccepting, roundFor, normalizeNames, teamRegistrationError } from '../lib/rules';
import { PageHead, Stat, Empty, StatusBadge, RoundState, Field } from '../components/ui';
import { PlatformPicker } from '../components/modals';
import { Activity, ArrowUpRight, CheckCircle2, CircleAlert, ClipboardList, FilePlus2, Trophy, UserCheck, Users } from 'lucide-react';

export function Overview({ctx}){
  const {d,profile,isHost,isStaff}=ctx;
  const first=profile?.full_name?.split(' ')[0];
  return <>
    <PageHead eyebrow="EVENT DASHBOARD" title={`Welcome${first?', '+first:''}`} desc="Track the four rounds, your submissions and the standings."
      actions={!isStaff&&ctx.myTeamId?<button className="button primary" onClick={()=>ctx.setModal({type:'submit'})}><FilePlus2 size={16}/> New submission</button>:null}/>
    {isHost&&<HostReadiness ctx={ctx}/>}
    {isStaff?<StaffSummary ctx={ctx}/>:<MyTeam ctx={ctx}/>}
    <section className="panel"><div className="panel-title"><div><h2>Leaderboard preview</h2><p className="muted">Only fully scored, non-rejected submissions count.</p></div><button className="text-button" onClick={()=>ctx.setPage('leaderboard')}>Full leaderboard <ArrowUpRight size={15}/></button></div>
      {d.settings.leaderboard_visible||isStaff?<MiniBoard board={ctx.board.slice(0,5)}/>:<Empty text="Standings are hidden by the host until the results announcement."/>}</section>
  </>;
}

function HostReadiness({ctx}){
  const checks=readinessChecks({settings:ctx.d.settings,platforms:ctx.d.platforms,teams:ctx.d.teams,memberships:ctx.d.memberships,profiles:ctx.d.profiles,rounds:ctx.d.rounds.length?ctx.d.rounds:ROUNDS});
  const open=checks.filter(c=>!c.ok).length;
  return <section className="panel"><div className="panel-title"><div><h2>Event readiness</h2><p className="muted">{open?`${open} item${open>1?'s':''} need attention before the event.`:'Everything is ready.'}</p></div></div>
    <ul className="checklist">{checks.map(c=><li key={c.label} className={c.ok?'ok':'todo'}>{c.ok?<CheckCircle2 size={16}/>:<CircleAlert size={16}/>}<div><b>{c.label}</b><p className="muted">{c.detail}</p></div></li>)}</ul></section>;
}

function StaffSummary({ctx}){
  const {d}=ctx;
  const active=d.submissions.filter(s=>s.status!=='Rejected');
  const awaiting=active.filter(s=>s.status!=='Scored');
  const people=d.teams.reduce((n,t)=>n+(t.member_names||[]).length,0);
  return <>
    <div className="stats">
      <Stat label="Participants" value={people} foot={`${d.memberships.length} of ${d.teams.length} teams have their account linked`} icon={Users}/>
      <Stat label="Teams" value={d.teams.length} foot={d.settings.teams_locked?'Finalized':'Not finalized yet'} icon={Users}/>
      <Stat label="Awaiting judging" value={awaiting.length} foot={`${active.length} active submissions`} icon={ClipboardList}/>
      <Stat label="Leader" value={ctx.board[0]?.score??0} foot={ctx.board[0]?.score?`${ctx.board[0].name}${ctx.board[0].tied?' (tied)':''}`:'No scored submissions yet'} icon={Trophy}/>
    </div>
    <div className="content-grid">
      <section className="panel"><div className="panel-title"><div><h2>Rounds</h2><p className="muted">Submissions per round · cumulative points</p></div><button className="text-button" onClick={()=>ctx.setPage('tracker')}>Round tracker <ArrowUpRight size={15}/></button></div>
        <div className="round-list">{ROUNDS.map(r=>{const n=active.filter(s=>s.round_id===r.id).length;return <div className="round-row" key={r.id}><span className="round-number">{String(r.id).padStart(2,'0')}</span><div><b>{r.name}</b><p className="muted">{n}/{d.teams.length} teams submitted · <RoundState round={ctx.roundRow(r.id)}/></p></div><strong>{r.max} pts</strong></div>;})}</div></section>
      <section className="panel"><div className="panel-title"><div><h2>Judging queue</h2><p className="muted">Oldest first</p></div></div>
        {[...awaiting].reverse().slice(0,6).map(s=><button className="activity-row as-button" key={s.id} onClick={()=>ctx.setModal({type:'review',submissionId:s.id})}><span className="activity-icon"><Activity size={16}/></span><div><b>{ctx.teamName(s.team_id)}</b><p className="muted">Round {s.round_id} · {roundFor(s.round_id).name} · {ctx.platformName(s.platform_id)}</p></div><StatusBadge status={s.status}/></button>)}
        {!awaiting.length&&<Empty text="Nothing waiting for judges."/>}</section>
    </div>
  </>;
}

function MyTeam({ctx}){
  const {d,myTeam,myTeamId}=ctx;
  if(!myTeam) return <RegisterTeam ctx={ctx}/>;
  const names=myTeam.member_names||[];
  return <>
    <TeamDetails ctx={ctx} team={myTeam} names={names}/>
    <div className="alert info"><b>AI platform rule:</b> your team must use a <b>different approved AI platform in every round</b>. Choose it before submitting; once you submit (or the round closes) it is locked.</div>
    <div className="round-cards">{ROUNDS.map(r=>{
      const live=ctx.roundRow(r.id);
      const sub=d.submissions.find(s=>s.team_id===myTeamId&&s.round_id===r.id&&s.status!=='Rejected');
      const rejected=d.submissions.find(s=>s.team_id===myTeamId&&s.round_id===r.id&&s.status==='Rejected');
      const accepting=isRoundAccepting(live);
      return <article className="round-card" key={r.id} data-testid={`round-card-${r.id}`}>
        <div className="round-card-top"><span className="tag">ROUND {r.id} · {r.max} PTS</span><RoundState round={live}/></div>
        <h3>{r.name}</h3><p>{r.desc}</p>
        {ctx.briefFor(r.id)?.brief&&<div className="task-box"><div className="rubric-label">YOUR TASK</div><p>{ctx.briefFor(r.id).brief}</p>{r.id===4&&ctx.briefFor(r.id).update_text&&<div className="update-box"><b>Surprise update:</b> {ctx.briefFor(r.id).update_text}</div>}</div>}
        {r.id===2&&accepting&&d.chatConfig&&<button className="button small" onClick={()=>ctx.setPage('chatbot')}>Open the Round 2 chatbot</button>}
        <PlatformPicker ctx={ctx} teamId={myTeamId} roundId={r.id} compact/>
        {sub&&d.settings.ai_judging&&['pending','scoring','failed'].includes(sub.ai_status)&&!ctx.isFullyScored(sub)&&<p className="hint">{sub.ai_status==='scoring'?'The AI judge is scoring this round…':'Submitted. The AI judge scores every team when the round closes.'}</p>}
        {sub?<div className="round-sub"><StatusBadge status={sub.status}/>{ctx.isFullyScored(sub)&&<b>{ctx.subTotal(sub.id)} / {r.max}</b>}
            <button className="button small" onClick={()=>ctx.setModal({type:'review',submissionId:sub.id})}>View</button>
            {accepting&&sub.status==='Submitted'&&<button className="button small" onClick={()=>ctx.setModal({type:'submit',submissionId:sub.id})}>Edit</button>}</div>
          :<div className="round-sub">{rejected&&<span className="warn-text">Previous entry rejected{rejected.rejection_reason?`: ${rejected.rejection_reason}`:''}.</span>}
            <button className="button small primary" disabled={!accepting} onClick={()=>ctx.setModal({type:'submit',roundId:r.id})}>{accepting?'Submit work':live?.status==='upcoming'?'Opens soon':'Closed'}</button></div>}
      </article>;})}</div>
  </>;
}

function MiniBoard({board}){return <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>Progress</th></tr></thead><tbody>{board.map(t=><tr key={t.id}><td>{t.rank===1&&t.score>0?'🏆':String(t.rank).padStart(2,'0')}{t.tied&&<small> (tied)</small>}</td><td><b>{t.name}</b></td><td><b>{t.score} / {MAX_TOTAL}</b></td><td><div className="progress"><span style={{width:`${Math.min(100,t.score/MAX_TOTAL*100)}%`}}/></div></td></tr>)}{!board.length&&<tr><td colSpan="4"><Empty text="No teams yet."/></td></tr>}</tbody></table></div>}
export { MiniBoard };

/** Shown to a signed-in representative whose team is not registered yet. */
function RegisterTeam({ctx}){
  const {d,api,act,saving,profile,userMeta}=ctx;
  const {team_min_size:min,team_max_size:max,teams_locked:locked}=d.settings;
  const organizer=userMeta.account_type==='organizer';
  const [showForm,setShowForm]=useState(!organizer);
  const [repName,setRepName]=useState(profile?.full_name||'');
  const [teamName,setTeamName]=useState(userMeta.team_name||'');
  const [othersText,setOthersText]=useState((userMeta.other_members||[]).join('\n'));
  const [problem,setProblem]=useState('');
  const tried=useRef(false);
  const names=[repName.trim(),...normalizeNames(othersText)].filter(Boolean);
  async function register(e){
    e?.preventDefault();
    const error=teamRegistrationError({teamName,names,min,max,takenNames:d.teams.map(t=>t.name)});
    setProblem(error||'');
    if(error) return;
    await act(()=>api.registerTeam(teamName.trim(),names),'Team registered. You are its representative.');
  }
  // Teams entered at sign-up are registered automatically on first sign-in.
  useEffect(()=>{
    const exists=d.teams.some(t=>t.name.toLowerCase()===String(userMeta.team_name||'').trim().toLowerCase());
    if(!locked&&!organizer&&userMeta.team_name&&!exists&&!tried.current){ tried.current=true; register(); }
  },[]);
  if(locked) return <section className="panel"><Empty text="Team registration is closed because teams are finalized. Contact the event host if your team is missing."/></section>;
  if(!showForm) return <section className="panel"><Empty text="Organizer account: the host will give you judge or host access. You don’t need to register a team."/><p className="hint">Actually representing a team? <button className="text-button" onClick={()=>setShowForm(true)}>Register a team</button></p></section>;
  return <section className="panel" aria-label="Register your team"><div className="panel-title"><div><h2>Register your team</h2><p className="muted">You are the team’s one account: you choose the AI platform and submit for everyone. Teammates don’t sign up.</p></div><span className="tag">STEP 1</span></div>
    <form onSubmit={register} noValidate>
      <div className="form-grid"><Field label="Team name"><input maxLength="60" value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="e.g. Prompt Pioneers"/></Field>
        <Field label="Your name (as it should appear)"><input maxLength="80" value={repName} onChange={e=>setRepName(e.target.value)}/></Field></div>
      <Field label="Other team members — one name per line" hint={`Team size: ${names.length} including you (needs ${min}–${max}).`}><textarea rows="3" value={othersText} onChange={e=>setOthersText(e.target.value)} placeholder={'Bilal Khan\nChitra Iyer'}/></Field>
      {problem&&<div className="alert error" role="alert">{problem}</div>}
      <div className="modal-actions"><span className="muted">Organizer or judge? Don’t register — ask the host for access.</span><button className="button primary" disabled={saving}>{saving?'Registering…':'Register team'}</button></div>
    </form></section>;
}

/** The representative's team card; details stay editable until the host finalizes teams. */
function TeamDetails({ctx,team,names}){
  const {d,api,act,saving}=ctx;
  const {team_min_size:min,team_max_size:max,teams_locked:locked}=d.settings;
  const [editing,setEditing]=useState(false);
  const [teamName,setTeamName]=useState(team.name);
  const [namesText,setNamesText]=useState(names.join('\n'));
  const [problem,setProblem]=useState('');
  const draft=normalizeNames(namesText);
  async function save(e){
    e.preventDefault();
    const error=teamRegistrationError({teamName,names:draft,min,max,takenNames:d.teams.filter(t=>t.id!==team.id).map(t=>t.name)});
    setProblem(error||'');
    if(error) return;
    if(await act(()=>api.updateMyTeam(teamName.trim(),draft),'Team details saved.')) setEditing(false);
  }
  return <section className="panel"><div className="panel-title"><div><h2>{team.name}</h2><p className="muted">{names.length} member{names.length===1?'':'s'} · same team for all four rounds{locked?' · finalized':''}</p></div><span className="tag">TEAM</span></div>
    {editing?<form onSubmit={save} noValidate>
        <Field label="Team name"><input maxLength="60" value={teamName} onChange={e=>setTeamName(e.target.value)}/></Field>
        <Field label={`Members, including you — one name per line (${draft.length}, needs ${min}–${max})`}><textarea rows="4" value={namesText} onChange={e=>setNamesText(e.target.value)}/></Field>
        {problem&&<div className="alert error" role="alert">{problem}</div>}
        <div className="inline-form"><button className="button small primary" disabled={saving}>Save team details</button><button type="button" className="button small" onClick={()=>{setEditing(false);setProblem('');setTeamName(team.name);setNamesText(names.join('\n'));}}>Cancel</button></div></form>
      :<><div className="member-chips">{names.map(n=><span key={n} className="chip">{n}</span>)}{!names.length&&<span className="muted">No member names yet.</span>}</div>
        {!locked&&<button className="button small" onClick={()=>{setTeamName(team.name);setNamesText(names.join('\n'));setEditing(true);}}>Edit team details</button>}</>}
    <p className="hint"><UserCheck size={13}/> You are signed in as your team’s <b>representative</b>: this one account chooses the AI platform and submits for the whole team.</p></section>;
}
