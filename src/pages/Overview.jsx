import React from 'react';
import { ROUNDS, MAX_TOTAL } from '../data';
import { readinessChecks, isRoundAccepting, roundFor } from '../lib/rules';
import { PageHead, Stat, Empty, StatusBadge, RoundState } from '../components/ui';
import { PlatformPicker } from '../components/modals';
import { Activity, ArrowUpRight, CheckCircle2, CircleAlert, ClipboardList, Crown, FilePlus2, Medal, Trophy, Users } from 'lucide-react';

export function Overview({ctx}){
  const {d,profile,isHost,isStaff}=ctx;
  const first=profile?.full_name?.split(' ')[0];
  return <>
    <PageHead eyebrow="EVENT DASHBOARD" title={`Welcome${first?', '+first:''}`} desc={`${d.settings.event_name} · ${new Date(d.settings.starts_at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}–${new Date(d.settings.ends_at).toLocaleTimeString([], {timeStyle:'short'})} · ${d.settings.venue}`}
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
  const students=d.profiles.filter(p=>p.role==='student');
  return <>
    <div className="stats">
      <Stat label="Participants" value={students.length} foot={`${d.memberships.length} assigned to teams`} icon={Users}/>
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
  if(!myTeam) return <section className="panel"><Empty text="You are not on a team yet. Ask the event host to assign you — your account is registered."/></section>;
  return <>
    <section className="panel"><div className="panel-title"><div><h2>{myTeam.name}</h2><p className="muted">{d.roster.length} members · same team for all four rounds</p></div><span className="tag">TEAM</span></div>
      <div className="member-chips">{d.roster.map(m=><span key={m.user_id} className="chip">{m.is_captain&&<Crown size={13} aria-label="Captain"/>}{m.full_name||'Member'}{m.is_captain&&<small> · captain</small>}</span>)}</div></section>
    <div className="alert info"><b>AI platform rule:</b> your team must use a <b>different approved AI platform in every round</b>. Choose it before submitting; once you submit (or the round closes) it is locked.</div>
    <div className="round-cards">{ROUNDS.map(r=>{
      const live=ctx.roundRow(r.id);
      const sub=d.submissions.find(s=>s.team_id===myTeamId&&s.round_id===r.id&&s.status!=='Rejected');
      const rejected=d.submissions.find(s=>s.team_id===myTeamId&&s.round_id===r.id&&s.status==='Rejected');
      const accepting=isRoundAccepting(live);
      return <article className="round-card" key={r.id} data-testid={`round-card-${r.id}`}>
        <div className="round-card-top"><span className="tag">ROUND {r.id} · {r.max} PTS</span><RoundState round={live}/></div>
        <h3>{r.name}</h3><p>{r.desc}</p>
        <PlatformPicker ctx={ctx} teamId={myTeamId} roundId={r.id} compact/>
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
