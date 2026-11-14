import React, { useMemo, useState } from 'react';
import { RosterEditor, rosterRows, rosterArrays } from './roster.jsx';
import { ROUNDS } from '../data';
import { missingDeliverables, platformOptions, scoreError, isRoundAccepting, isRoundClosed, roundFor, parseRosterCsv, memberNamesError, teamRolesError } from '../lib/rules';
import { autoChecks } from '../lib/autoChecks';
import { Field, Modal, RoundState, StatusBadge, fmtDate } from './ui';
import { ArtifactWorkbench } from './ArtifactWorkbench';
import { readForgeDraft } from '../pages/Forge';
import { AlertTriangle, Bot, CheckCircle2, CircleAlert, Info, MessageSquare, MonitorSmartphone, RefreshCw } from 'lucide-react';

/** Platform picker for one team-round. Shows used platforms disabled with the round they were used in. */
export function PlatformPicker({ctx,teamId,roundId,compact}){
  const {d,api,act,saving,isHost}=ctx;
  const round=ctx.roundRow(roundId);
  const {options,current,message}=platformOptions(d.platforms,d.selections,teamId,roundId);
  const active=d.submissions.some(s=>s.team_id===teamId&&s.round_id===roundId&&s.status!=='Rejected');
  const locked=isRoundClosed(round)||active;
  if(isHost&&teamId!==ctx.myTeamId) return <label className="field"><span>AI platform for Round {roundId} (host)</span>
    <select aria-label={`AI platform for Round ${roundId}`} value={current??''} disabled={saving} onChange={e=>{
      const reason=e.target.value&&window.prompt('Reason for setting this team’s AI platform (recorded in the audit log):','Declared by the team to the host');
      if(reason) act(()=>api.hostSetPlatform(teamId,roundId,Number(e.target.value),reason),'AI platform recorded.');
    }}><option value="">Not declared</option>{options.map(o=><option key={o.id} value={o.id} disabled={o.usedIn!==null}>{o.name}{o.usedIn!==null?` — used in Round ${o.usedIn}`:''}</option>)}</select></label>;
  return <div className={`platform-picker ${compact?'compact':''}`}>
    <label className="field"><span>AI platform for Round {roundId}</span>
      <select aria-label={`AI platform for Round ${roundId}`} value={current??''} disabled={saving||locked} onChange={e=>e.target.value&&act(()=>api.selectPlatform(roundId,Number(e.target.value)),`AI platform saved for Round ${roundId}.`)}>
        <option value="">{current?'':'Choose the AI platform you will use…'}</option>
        {options.map(o=><option key={o.id} value={o.id} disabled={o.usedIn!==null||!o.is_active}>{o.name}{o.usedIn!==null?` — used in Round ${o.usedIn}`:''}{!o.is_active?' (no longer approved)':''}</option>)}
      </select>
    </label>
    {locked&&current&&<small className="hint">{active?'Locked: your team has submitted this round. A host can correct it if needed.':'Locked: this round is closed.'}</small>}
    {!locked&&message&&<small className="hint warn-text">{message}</small>}
  </div>;
}

export function SubmissionModal({ctx,roundId:initialRound,teamId:initialTeam,submissionId,close}){
  const {d,api,act,saving,isHost}=ctx;
  const existing=d.submissions.find(s=>s.id===submissionId);
  const [roundId,setRoundId]=useState(existing?.round_id??initialRound??1);
  const [teamId,setTeamId]=useState(existing?.team_id??initialTeam??ctx.myTeamId??d.teams[0]?.id);
  const [form,setForm]=useState(()=>existing?{...existing}:{title:''});
  const [problems,setProblems]=useState([]);
  const round=roundFor(roundId);
  const live=ctx.roundRow(roundId);
  const declared=d.selections.find(s=>s.team_id===teamId&&s.round_id===roundId);
  const accepting=isHost||isRoundAccepting(live);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  async function save(e){
    e.preventDefault();
    const issues=missingDeliverables(roundId,form);
    if(!declared) issues.unshift(`Select your team's AI platform for Round ${roundId} before submitting.`);
    setProblems(issues);
    if(issues.length) return;
    const ok=existing
      ? await act(()=>api.updateSubmission(existing.id,form),'Submission updated.')
      : await act(()=>api.submit({...form,team_id:teamId,round_id:roundId}),'Submission sent for review.');
    if(ok) close();
  }
  const chat=d.chatMessages.filter(m=>m.team_id===teamId);
  function useChat(){
    const lines=role=>chat.filter(m=>m.role===role).map((m,i)=>`${i+1}. ${m.content}`).join('\n');
    setForm(f=>({...f,prompt_text:lines('user'),output_text:lines('bot')}));
  }
  const task=ctx.briefFor(roundId);
  return <Modal title={existing?'Edit submission':'Submit team work'} close={close} wide><form onSubmit={save} noValidate>
    <div className="form-grid">
      <Field label="Team"><select value={teamId??''} disabled={!isHost||Boolean(existing)} onChange={e=>setTeamId(Number(e.target.value))}>{(isHost?d.teams:d.teams.filter(t=>t.id===ctx.myTeamId)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      <Field label="Round"><select value={roundId} disabled={Boolean(existing)} onChange={e=>{setRoundId(Number(e.target.value));setProblems([]);}}>{ROUNDS.map(r=><option key={r.id} value={r.id}>{r.id}. {r.name} — {r.max} pts</option>)}</select></Field>
    </div>
    <div className="round-brief"><div className="round-brief-head"><b>{round.name}</b><RoundState round={live}/></div><p>{round.desc}</p>
      {round.responsible&&<p className="hint"><AlertTriangle size={13}/> {round.responsible}</p>}
      {round.localDemo&&<div className="alert info"><MonitorSmartphone size={16}/> <span><b>Local demo rule:</b> {round.localDemo}</span></div>}
      <div className="rubric-label">REQUIRED DELIVERABLES</div><ul className="deliverables">{round.fields.filter(f=>f.required).map(f=><li key={f.key}>{f.label}</li>)}<li>A declared AI platform not used by your team in any other round</li></ul>
      <div className="rubric-label">JUDGING · MAX {round.max} POINTS</div><p className="muted">{round.criteria.map(c=>`${c.name} (${c.max})`).join(' · ')}</p>
    </div>
    {task?.brief&&<div className="task-box"><div className="rubric-label">YOUR TASK</div><p>{task.brief}</p>{roundId===4&&task.update_text&&<div className="update-box"><b>Surprise update:</b> {task.update_text}</div>}</div>}
    {d.settings.ai_judging&&<p className="hint"><Bot size={13}/> The AI judge scores every team together when the round closes. You can edit your submission until then.</p>}
    {roundId===2&&!existing&&chat.length>0&&<button type="button" className="button small" onClick={useChat}><MessageSquare size={14}/> Use our chatbot conversation ({chat.filter(m=>m.role==='user').length} test{chat.filter(m=>m.role==='user').length===1?'':'s'})</button>}
    {!accepting&&<div className="alert error">This round is not open for submissions{live?.status==='upcoming'?' yet':''}.</div>}
    {teamId&&(existing?<p className="muted">AI platform: <b>{ctx.platformName(existing.platform_id)}</b> (declared by your team; recorded with this submission)</p>:<PlatformPicker ctx={ctx} teamId={teamId} roundId={roundId}/>)}
    <p className="hint">The platform is what your team declares it used. The portal records and enforces the declaration; it cannot detect which AI tool was actually used.</p>
    <Field label="Submission title"><input maxLength="100" value={form.title||''} onChange={e=>set('title',e.target.value)} placeholder="e.g. Pomodoro timer v1"/></Field>
    {round.fields.map(f=>f.html
      ?<div key={f.key} className="field"><span>{f.label}</span>{!form[f.key]&&readForgeDraft()&&<button type="button" className="button small" onClick={()=>set(f.key,readForgeDraft())}>Use my draft from the HTML checker</button>}<ArtifactWorkbench value={form[f.key]||''} onChange={v=>set(f.key,v)} label="HTML file contents"/></div>
      :<Field key={f.key} label={`${f.label}${f.required?' *':''}`}>{f.long?<textarea value={form[f.key]||''} onChange={e=>set(f.key,e.target.value)} placeholder={f.placeholder}/>:<input value={form[f.key]||''} onChange={e=>set(f.key,e.target.value)} placeholder={f.placeholder}/>}</Field>)}
    {problems.length>0&&<div className="alert error" role="alert"><div><b>Please fix before submitting:</b><ul>{problems.map(p=><li key={p}>{p}</li>)}</ul></div></div>}
    <div className="modal-actions"><button type="button" className="button" onClick={close}>Cancel</button><button disabled={saving||!accepting||!teamId} className="button primary">{saving?'Saving…':existing?'Save changes':'Submit for review'}</button></div>
    {!teamId&&<p className="muted">You need an assigned team before submitting. Ask the event host.</p>}
  </form></Modal>;
}

export function ReviewModal({ctx,submissionId,close}){
  const {d,api,act,saving,isStaff,isHost}=ctx;
  const s=d.submissions.find(x=>x.id===submissionId);
  const round=roundFor(s?.round_id);
  const current=s?ctx.scoresFor(s.id):[];
  const [points,setPoints]=useState(()=>round?round.criteria.map((_,i)=>current.find(x=>x.criterion_index===i)?.points??''):[]);
  const [feedback,setFeedback]=useState(current[0]?.feedback||'');
  const [scoreProblem,setScoreProblem]=useState('');
  const [reason,setReason]=useState('');
  const [fixPlatform,setFixPlatform]=useState('');
  if(!s) return <Modal title="Submission" close={close}><p>This submission is no longer available.</p></Modal>;
  const total=points.reduce((n,p)=>n+(Number(p)||0),0);
  const byAi=current.length>0&&current.every(x=>x.source==='ai');
  async function saveScores(e){
    e.preventDefault();
    const problem=scoreError(s.round_id,points);
    setScoreProblem(problem||'');
    if(problem) return;
    await act(()=>api.saveScores(s.id,points.map(Number),feedback),'Scores saved. Leaderboard updated.');
  }
  return <Modal title={s.title} close={close} wide>
    <div className="review-meta"><span><b>{ctx.teamName(s.team_id)}</b></span><span>Round {s.round_id} · {round.name}</span><span>AI platform: <b>{ctx.platformName(s.platform_id)}</b> <small className="muted">(team-declared)</small></span><StatusBadge status={s.status}/><span className="muted">Submitted {fmtDate(s.created_at)}{isStaff?` by ${ctx.personName(s.submitted_by)}`:''}</span></div>
    {s.status==='Rejected'&&<div className="alert error">Rejected{s.rejection_reason?`: ${s.rejection_reason}`:''}. It does not count toward the leaderboard.</div>}
    <AiJudgePanel ctx={ctx} s={s} round={round} current={current} byAi={byAi}/>
    {isStaff&&<AutoChecks facts={autoChecks(s,d.submissions,ctx.roundRow(s.round_id))}/>}
    <div className="submission-preview">{round.fields.filter(f=>s[f.key]&&!f.html).map(f=><React.Fragment key={f.key}><h4>{f.label.replace(' (optional)','')}</h4>{f.key==='evidence_url'?<p><a href={s.evidence_url} target="_blank" rel="noreferrer noopener">{s.evidence_url}</a></p>:<p>{s[f.key]}</p>}</React.Fragment>)}</div>
    {round.id===3&&(s.artifact_html?<div className="panel-inset"><h4>Submitted app</h4><ArtifactWorkbench value={s.artifact_html} readOnly/></div>:<p className="muted">No HTML file attached — verify the app at the team’s laptop.</p>)}
    {round.localDemo&&<div className={`alert ${s.demo_verified?'success':'info'}`}><MonitorSmartphone size={16}/><span><b>Local demo:</b> {s.demo_details||'—'} · file <code>{s.artifact_filename||'—'}</code>. {s.demo_verified?`Verified by a judge ${fmtDate(s.demo_verified_at)}.`:'Not yet verified by a judge at the team’s laptop.'}</span>
      {isStaff&&<label className="check"><input type="checkbox" checked={Boolean(s.demo_verified)} disabled={saving} onChange={e=>act(()=>api.setDemoVerified(s.id,e.target.checked),e.target.checked?'Local demo marked as verified.':'Demo verification removed.')}/> Local demo verified</label>}</div>}
    {isStaff&&s.status!=='Rejected'&&<form onSubmit={saveScores} noValidate><p className="rubric-label">{byAi?'OVERRIDE THE AI JUDGE (OPTIONAL)':'SCORING RUBRIC'} · MAX {round.max} POINTS</p>
      <div className="score-grid">{round.criteria.map((c,i)=><Field key={c.name} label={`${c.name} (max ${c.max})`}><input type="number" inputMode="numeric" min="0" max={c.max} step="1" value={points[i]} onChange={e=>setPoints(p=>p.map((x,j)=>j===i?e.target.value:x))}/></Field>)}</div>
      <Field label="Judge feedback (optional)"><textarea value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Short feedback for the team…"/></Field>
      {scoreProblem&&<div className="alert error" role="alert">{scoreProblem}</div>}
      <div className="modal-actions"><span className="muted">Entered total: <b>{total} / {round.max}</b> (the database recomputes the official total)</span><button disabled={saving} className="button primary">{saving?'Saving…':ctx.isFullyScored(s)?'Update scores':'Save scores'}</button></div>
    </form>}
    {!isStaff&&ctx.isFullyScored(s)&&!byAi&&<div className="alert success"><CheckCircle2 size={16}/> Scored {ctx.subTotal(s.id)} / {round.max}{current[0]?.feedback?` — “${current[0].feedback}”`:''}</div>}
    {isStaff&&s.status==='Submitted'&&<div className="modal-actions"><button className="button" disabled={saving} onClick={()=>act(()=>api.setStatus(s.id,'Under review'),'Marked as under review. The team can no longer edit it.')}>Mark under review</button></div>}
    {isHost&&<details className="host-tools"><summary>Host corrections (recorded in the audit log)</summary>
      <div className="form-grid"><Field label="Correct AI platform"><select value={fixPlatform} onChange={e=>setFixPlatform(e.target.value)}><option value="">Choose platform…</option>{d.platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Reason"><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why this correction is needed"/></Field></div>
      <div className="modal-actions">
        <button className="button" disabled={saving||!fixPlatform} onClick={()=>act(()=>api.hostSetPlatform(s.team_id,s.round_id,Number(fixPlatform),reason),'AI platform corrected.')}>Apply platform correction</button>
        {s.status!=='Rejected'?<button className="button danger" disabled={saving||reason.trim().length<3} onClick={()=>window.confirm('Reject this submission? It will stop counting toward the leaderboard and the team may resubmit while the round is open.')&&act(()=>api.setStatus(s.id,'Rejected',reason.trim()),'Submission rejected.')}>Reject submission</button>
          :<button className="button" disabled={saving} onClick={()=>act(()=>api.setStatus(s.id,'Under review'),'Submission restored for review.')}>Restore submission</button>}
      </div><small className="hint">Rejecting requires a reason (min. 3 characters).</small></details>}
  </Modal>;
}

/** Create a team: one representative account (optional now, required to finalize) + every member's name. */
export function TeamModal({ctx,close}){
  const {d,api,act,saving}=ctx;
  const [name,setName]=useState('');
  const [rep,setRep]=useState('');
  const [rows,setRows]=useState(()=>rosterRows([],[],d.settings.team_max_size,{suggest:false}));
  const free=d.profiles.filter(p=>p.role==='student'&&!d.memberships.some(m=>m.user_id===p.id));
  const {names,roles}=rosterArrays(rows);
  const problem=memberNamesError(names,d.settings.team_max_size)||teamRolesError(names,roles,{required:false});
  async function save(e){e.preventDefault();if(problem)return;if(await act(()=>api.createTeam(name,rep||null,names,roles.some(Boolean)?roles:[]),'Team created.'))close();}
  return <Modal title="Create team" close={close}><form onSubmit={save}>
    <Field label="Team name"><input required maxLength="60" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Prompt Pioneers"/></Field>
    <Field label="Representative account (signs in and submits)" hint="Only this person needs to sign up. You can link it later, but it is required before finalizing teams."><select value={rep} onChange={e=>setRep(e.target.value)}><option value="">Link later…</option>{free.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}{p.full_name?` — ${p.email}`:''}</option>)}</select></Field>
    <RosterEditor rows={rows} onChange={setRows} firstLabel="Representative" optionalRoles hint={`${names.length}/${d.settings.team_max_size} members, including the representative. Roles are optional here.`}/>
    {problem&&<div className="alert error" role="alert">{problem}</div>}
    {!problem&&names.length>0&&names.length<d.settings.team_min_size&&<p className="hint warn-text">Teams need {d.settings.team_min_size}–{d.settings.team_max_size} members before finalizing.</p>}
    <div className="modal-actions"><button type="button" className="button" onClick={close}>Cancel</button><button disabled={saving||Boolean(problem)} className="button primary">{saving?'Creating…':'Create team'}</button></div>
  </form></Modal>;
}

export function ImportModal({ctx,close}){
  const {api,act,saving}=ctx;
  const [text,setText]=useState('');
  const [report,setReport]=useState(null);
  const parsed=useMemo(()=>parseRosterCsv(text),[text]);
  async function run(apply){
    const result=await act(()=>api.importRoster(parsed.rows,apply),apply?'Roster imported.':null);
    if(result&&result!==true) setReport(result);
    if(result?.applied) close();
  }
  return <Modal title="Import roster" close={close} wide>
    <p className="muted">One line per participant: <code>team,name,email</code>. Put the email <b>only on the representative’s line</b> — that person must have signed up, and theirs is the team’s one account. Each team needs its members listed (the size rule counts names). All-or-nothing: if any line has a problem, nothing changes.</p>
    <Field label="Roster CSV"><textarea rows="8" value={text} onChange={e=>{setText(e.target.value);setReport(null);}} placeholder={'team,name,email\nPrompt Pioneers,Asha Rao,asha@gitam.in\nPrompt Pioneers,Bilal Khan,\nPrompt Pioneers,Chitra Iyer,'}/></Field>
    {parsed.errors.map(e=><p key={e} className="warn-text">{e}</p>)}
    {report&&<div className="table-wrap"><table><thead><tr><th>Line</th><th>Team</th><th>Name</th><th>Result</th></tr></thead><tbody>{report.rows.map((r,i)=><tr key={i}><td>{r.row??'—'}</td><td>{r.team}</td><td>{r.name||'—'}{r.email&&<small>{r.email}</small>}</td><td className={r.status==='error'?'warn-text':''}>{r.message}</td></tr>)}</tbody></table></div>}
    <div className="modal-actions"><button className="button" onClick={close}>Cancel</button><button className="button" disabled={saving||!parsed.rows.length} onClick={()=>run(false)}>Check roster</button><button className="button primary" disabled={saving||!report?.ok} onClick={()=>run(true)}>Import {parsed.rows.length} rows</button></div>
  </Modal>;
}

const FACT_ICON={ok:CheckCircle2,warn:AlertTriangle,info:Info};
/** Advisory auto-checks shown to judges next to the rubric. */
function AutoChecks({facts}){
  return <div className="auto-checks" aria-label="Auto-checks"><div className="rubric-label">AUTO-CHECKS · ADVISORY, JUDGES DECIDE THE SCORE</div>
    <ul>{facts.map(f=>{const Icon=FACT_ICON[f.tone]||CircleAlert;return <li key={f.label} className={f.tone}><Icon size={14}/><b>{f.label}:</b> <span>{f.value}</span></li>;})}</ul></div>;
}

/** What the AI judge decided (or is doing) for this submission. */
function AiJudgePanel({ctx,s,round,current,byAi}){
  const {d,api,act,saving,isStaff,isHost}=ctx;
  if(!d.settings.ai_judging&&!byAi) return null;
  if(s.status==='Rejected') return null;
  if(byAi&&ctx.isFullyScored(s)) return <div className="ai-panel" aria-label="AI judge result">
    <div className="ai-panel-head"><Bot size={16}/><b>Scored by the AI judge</b><span className="muted">{s.ai_model||''}</span><b className="ai-total">{ctx.subTotal(s.id)} / {round.max}</b></div>
    {s.ai_flagged&&<div className="alert error"><AlertTriangle size={16}/> The AI judge flagged a possible attempt to manipulate the scoring. It ignored that text{isStaff?'; a host may want to check this submission':''}.</div>}
    <ul className="ai-criteria">{round.criteria.map((c,i)=>{const sc=current.find(x=>x.criterion_index===i);return <li key={c.name}><span><b>{c.name}</b> <small className="muted">{sc?.points??'—'} / {c.max}</small></span><span>{sc?.feedback||''}</span></li>;})}</ul>
    {isHost&&<div className="modal-actions"><button className="button small" disabled={saving} onClick={()=>window.confirm('Re-run the AI judge for this submission? Its current AI scores are replaced.')&&act(async()=>{await api.requeueAi(s.id);return api.aiScore(s.id);},'AI judge re-ran.')}><RefreshCw size={14}/> Re-run AI judge</button></div>}
  </div>;
  if(current.length&&!byAi) return <p className="hint"><CheckCircle2 size={13}/> Scored by a judge or host (overrides the AI judge).</p>;
  if(s.ai_status==='failed') return <div className="alert error" aria-label="AI judge result"><span><b>AI judge could not score yet:</b> {s.ai_error||'unknown problem'}. It is retried automatically while a host has the portal open.</span>
    {isHost&&<button className="button small" disabled={saving} onClick={()=>ctx.autoScore(s.id)}>Retry now</button>}</div>;
  return <div className="alert info" aria-label="AI judge result"><Bot size={16}/><span>{s.ai_status==='scoring'?'The AI judge is scoring this round now…':'Waiting for the round to close — the AI judge then scores every team together. The score appears here automatically.'}</span></div>;
}
