import React, { useMemo, useState } from 'react';
import { ROUNDS } from '../data';
import { missingDeliverables, platformOptions, scoreError, isRoundAccepting, isRoundClosed, roundFor, parseRosterCsv } from '../lib/rules';
import { autoChecks } from '../lib/autoChecks';
import { Field, Modal, RoundState, StatusBadge, fmtDate } from './ui';
import { ArtifactWorkbench } from './ArtifactWorkbench';
import { readForgeDraft } from '../pages/Forge';
import { AlertTriangle, CheckCircle2, CircleAlert, Info, MonitorSmartphone } from 'lucide-react';

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
    {isStaff&&<AutoChecks facts={autoChecks(s,d.submissions,ctx.roundRow(s.round_id))}/>}
    <div className="submission-preview">{round.fields.filter(f=>s[f.key]&&!f.html).map(f=><React.Fragment key={f.key}><h4>{f.label.replace(' (optional)','')}</h4>{f.key==='evidence_url'?<p><a href={s.evidence_url} target="_blank" rel="noreferrer noopener">{s.evidence_url}</a></p>:<p>{s[f.key]}</p>}</React.Fragment>)}</div>
    {round.id===3&&(s.artifact_html?<div className="panel-inset"><h4>Submitted app</h4><ArtifactWorkbench value={s.artifact_html} readOnly/></div>:<p className="muted">No HTML file attached — verify the app at the team’s laptop.</p>)}
    {round.localDemo&&<div className={`alert ${s.demo_verified?'success':'info'}`}><MonitorSmartphone size={16}/><span><b>Local demo:</b> {s.demo_details||'—'} · file <code>{s.artifact_filename||'—'}</code>. {s.demo_verified?`Verified by a judge ${fmtDate(s.demo_verified_at)}.`:'Not yet verified by a judge at the team’s laptop.'}</span>
      {isStaff&&<label className="check"><input type="checkbox" checked={Boolean(s.demo_verified)} disabled={saving} onChange={e=>act(()=>api.setDemoVerified(s.id,e.target.checked),e.target.checked?'Local demo marked as verified.':'Demo verification removed.')}/> Local demo verified</label>}</div>}
    {isStaff&&s.status!=='Rejected'&&<form onSubmit={saveScores} noValidate><p className="rubric-label">SCORING RUBRIC · MAX {round.max} POINTS</p>
      <div className="score-grid">{round.criteria.map((c,i)=><Field key={c.name} label={`${c.name} (max ${c.max})`}><input type="number" inputMode="numeric" min="0" max={c.max} step="1" value={points[i]} onChange={e=>setPoints(p=>p.map((x,j)=>j===i?e.target.value:x))}/></Field>)}</div>
      <Field label="Judge feedback (optional)"><textarea value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Short feedback for the team…"/></Field>
      {scoreProblem&&<div className="alert error" role="alert">{scoreProblem}</div>}
      <div className="modal-actions"><span className="muted">Entered total: <b>{total} / {round.max}</b> (the database recomputes the official total)</span><button disabled={saving} className="button primary">{saving?'Saving…':ctx.isFullyScored(s)?'Update scores':'Save scores'}</button></div>
    </form>}
    {!isStaff&&ctx.isFullyScored(s)&&<div className="alert success"><CheckCircle2 size={16}/> Scored {ctx.subTotal(s.id)} / {round.max}{current[0]?.feedback?` — “${current[0].feedback}”`:''}</div>}
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

export function TeamModal({ctx,close}){
  const {d,api,act,saving}=ctx;
  const [name,setName]=useState('');
  const [members,setMembers]=useState([]);
  const free=d.profiles.filter(p=>p.role==='student'&&!d.memberships.some(m=>m.user_id===p.id));
  async function save(e){e.preventDefault();if(await act(()=>api.createTeam(name,members),'Team created.'))close();}
  return <Modal title="Create team" close={close}><form onSubmit={save}>
    <Field label="Team name"><input required maxLength="60" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Prompt Pioneers"/></Field>
    <Field label={`Assign registered students (optional, up to ${d.settings.team_max_size})`} hint="Hold Ctrl (Windows) or Cmd (Mac) to select multiple people."><select multiple value={members} onChange={e=>setMembers([...e.target.selectedOptions].map(o=>o.value))} size="6">{free.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}</select></Field>
    {members.length>d.settings.team_max_size&&<div className="alert error">A team can have at most {d.settings.team_max_size} members.</div>}
    <div className="modal-actions"><button type="button" className="button" onClick={close}>Cancel</button><button disabled={saving||members.length>d.settings.team_max_size} className="button primary">{saving?'Creating…':'Create team'}</button></div>
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
    <p className="muted">Paste CSV lines <code>email,team,captain</code>. Participants must have registered (and confirmed) their accounts first. The import is all-or-nothing: if any line has a problem, nothing changes.</p>
    <Field label="Roster CSV"><textarea rows="8" value={text} onChange={e=>{setText(e.target.value);setReport(null);}} placeholder={'email,team,captain\nstudent1@gitam.in,Prompt Pioneers,yes\nstudent2@gitam.in,Prompt Pioneers'}/></Field>
    {parsed.errors.map(e=><p key={e} className="warn-text">{e}</p>)}
    {report&&<div className="table-wrap"><table><thead><tr><th>Line</th><th>Email</th><th>Team</th><th>Result</th></tr></thead><tbody>{report.rows.map((r,i)=><tr key={i}><td>{r.row??'—'}</td><td>{r.email||'—'}</td><td>{r.team}</td><td className={r.status==='error'?'warn-text':''}>{r.message}</td></tr>)}</tbody></table></div>}
    <div className="modal-actions"><button className="button" onClick={close}>Cancel</button><button className="button" disabled={saving||!parsed.rows.length} onClick={()=>run(false)}>Check roster</button><button className="button primary" disabled={saving||!report?.ok} onClick={()=>run(true)}>Import {parsed.rows.length} rows</button></div>
  </Modal>;
}

const FACT_ICON={ok:CheckCircle2,warn:AlertTriangle,info:Info};
/** Advisory auto-checks shown to judges next to the rubric. */
function AutoChecks({facts}){
  return <div className="auto-checks" aria-label="Auto-checks"><div className="rubric-label">AUTO-CHECKS · ADVISORY, JUDGES DECIDE THE SCORE</div>
    <ul>{facts.map(f=>{const Icon=FACT_ICON[f.tone]||CircleAlert;return <li key={f.label} className={f.tone}><Icon size={14}/><b>{f.label}:</b> <span>{f.value}</span></li>;})}</ul></div>;
}
