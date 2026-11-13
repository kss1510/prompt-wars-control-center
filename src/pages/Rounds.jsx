import React, { useState } from 'react';
import { ROUNDS } from '../data';
import { eventTiming } from '../lib/rules';
import { PageHead, RoundState, Field, fmtTime } from '../components/ui';
import { Megaphone, MessageSquare, MonitorSmartphone, Play, Save, Square, RotateCcw } from 'lucide-react';

export function RoundsPage({ctx}){
  const {d,isHost}=ctx;
  const live=d.rounds.length?d.rounds:ROUNDS;
  const t=eventTiming(d.settings,live);
  return <><PageHead eyebrow="EVENT DESIGN / SCORING" title="Rounds & scoring" desc="Official challenge descriptions, deliverables, AI platform rule and judge rubrics."/>
    <div className={`alert ${t.bufferMinutes<0?'error':'info'}`}><b>Event timing:</b> {live.map(r=>r.duration_minutes??r.minutes).join(' + ')} = {t.challengeMinutes} challenge minutes inside the {t.windowMinutes}-minute event window. That leaves {t.bufferMinutes} minutes for briefing, transitions, judging and the results announcement.</div>
    <div className="alert info"><b>Different AI platform every round:</b> each team declares one approved platform per round and may not reuse it in another round. The portal records the team’s declaration; it does not detect which tool was actually used.</div>
    <div className="round-cards">{ROUNDS.map(r=><article className="round-card" key={r.id}><div className="round-card-top"><span className="tag">ROUND {r.id}</span><RoundState round={ctx.roundRow(r.id)}/></div><h3>{r.name}</h3><p>{r.desc}</p>
      {r.responsible&&<p className="hint">{r.responsible}</p>}
      {r.localDemo&&<p className="hint"><MonitorSmartphone size={13}/> {r.localDemo}</p>}
      {!isHost&&ctx.briefFor(r.id)?.brief&&<div className="task-box"><div className="rubric-label">YOUR TASK</div><p>{ctx.briefFor(r.id).brief}</p>{r.id===4&&ctx.briefFor(r.id).update_text&&<div className="update-box"><b>Surprise update:</b> {ctx.briefFor(r.id).update_text}</div>}</div>}
      <div className="rubric-label">REQUIRED SUBMISSION</div><ul className="deliverables">{r.fields.filter(f=>f.required).map(f=><li key={f.key}>{f.label}</li>)}</ul>
      <div className="rubric-label">JUDGING RUBRIC</div>{r.criteria.map(c=><div className="criterion" key={c.name}><span>{c.name}</span><b>{c.max} pts</b></div>)}<div className="round-total"><span>Maximum score</span><b>{r.max} points</b></div>
      {isHost&&<RoundControls ctx={ctx} round={ctx.roundRow(r.id)}/>}
      {isHost&&<TaskEditor ctx={ctx} roundId={r.id}/>}
      {isHost&&r.id===2&&<ChatbotEditor ctx={ctx}/>}
    </article>)}</div></>;
}

function RoundControls({ctx,round}){
  const {api,act,saving}=ctx;
  const [minutes,setMinutes]=useState(round?.duration_minutes||15);
  if(!round) return null;
  const open=round.status==='open'&&(!round.closes_at||new Date(round.closes_at)>new Date());
  return <div className="round-controls"><div className="rubric-label">HOST CONTROLS</div>
    <div className="inline-form"><label className="field compact"><span>Minutes</span><input type="number" min="1" max="120" value={minutes} onChange={e=>setMinutes(e.target.value)} aria-label={`Round ${round.id} minutes`}/></label>
      <button className="button small primary" disabled={saving} onClick={()=>act(()=>api.updateRound(round.id,'open',Number(minutes)),open?`Round ${round.id} deadline set to ${minutes} minutes from now.`:`Round ${round.id} is open.`)}><Play size={14}/> {open?'Set new deadline':'Open round'}</button>
      {open&&<button className="button small" disabled={saving} onClick={()=>window.confirm(`Close Round ${round.id} now? Teams will no longer be able to submit or change platforms.`)&&act(()=>api.updateRound(round.id,'closed'),`Round ${round.id} closed.`)}><Square size={14}/> Close now</button>}
      {round.status!=='upcoming'&&<button className="button small" disabled={saving} onClick={()=>window.confirm(`Reset Round ${round.id} to upcoming? Existing submissions are kept.`)&&act(()=>api.updateRound(round.id,'upcoming',Number(minutes)),`Round ${round.id} reset.`)}><RotateCcw size={14}/> Reset</button>}</div>
    {round.opens_at&&<small className="hint">Opened {fmtTime(round.opens_at)} · deadline {fmtTime(round.closes_at)} (database clock)</small>}</div>;
}

/** Host: the task teams see once the round opens, private notes for the AI judge, Round 4 update. */
function TaskEditor({ctx,roundId}){
  const {api,act,saving}=ctx;
  const brief=ctx.briefFor(roundId);
  const notes=ctx.notesFor(roundId);
  const [task,setTask]=useState(brief?.brief||'');
  const [note,setNote]=useState(notes?.notes||'');
  const [update,setUpdate]=useState(brief?.update_text||'');
  return <details className="host-tools task-editor"><summary>Task &amp; AI judge notes (host)</summary>
    <Field label="Task shown to teams when the round opens"><textarea rows="4" maxLength="8000" value={task} onChange={e=>setTask(e.target.value)} aria-label={`Round ${roundId} task`}/></Field>
    <Field label="Private notes for the AI judge (never shown to teams)" hint="Target answer, required features, what full marks look like."><textarea rows="3" maxLength="8000" value={note} onChange={e=>setNote(e.target.value)} aria-label={`Round ${roundId} judge notes`}/></Field>
    <div className="modal-actions"><button type="button" className="button small primary" disabled={saving} onClick={()=>act(async()=>{await api.updateBrief(roundId,{brief:task});await api.updateJudgeNotes(roundId,note);},`Round ${roundId} task saved.`)}><Save size={14}/> Save task &amp; notes</button></div>
    {roundId===4&&<><Field label="Surprise update (shown to teams the moment you release it)"><textarea rows="2" maxLength="4000" value={update} onChange={e=>setUpdate(e.target.value)} aria-label="Round 4 surprise update"/></Field>
      <div className="modal-actions">{brief?.update_released_at&&<span className="muted">Released at {fmtTime(brief.update_released_at)}</span>}
        <button type="button" className="button small" disabled={saving||!update.trim()} onClick={()=>window.confirm('Release this update to every team now?')&&act(()=>api.updateBrief(4,{update_text:update.trim(),update_released_at:new Date().toISOString()}),'Surprise update released to all teams.')}><Megaphone size={14}/> Release update now</button></div></>}
  </details>;
}

/** Host: the fictional Round 2 chatbot — name, persona, rules teams test, and the per-team message cap. */
function ChatbotEditor({ctx}){
  const {d,api,act,saving}=ctx;
  const cfg=d.chatConfig||{};
  const [form,setForm]=useState({bot_name:cfg.bot_name||'',persona:cfg.persona||'',rules:cfg.rules||'',max_messages_per_team:cfg.max_messages_per_team||30});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return <details className="host-tools task-editor"><summary><MessageSquare size={13}/> Round 2 chatbot (host)</summary>
    <div className="form-grid"><Field label="Chatbot name"><input maxLength="60" value={form.bot_name} onChange={e=>set('bot_name',e.target.value)}/></Field>
      <Field label="Messages per team"><input type="number" min="1" max="200" value={form.max_messages_per_team} onChange={e=>set('max_messages_per_team',e.target.value)}/></Field></div>
    <Field label="Persona"><textarea rows="2" maxLength="2000" value={form.persona} onChange={e=>set('persona',e.target.value)}/></Field>
    <Field label="Rules teams will test (shown to teams in Round 2)"><textarea rows="5" maxLength="4000" value={form.rules} onChange={e=>set('rules',e.target.value)}/></Field>
    <div className="modal-actions"><button type="button" className="text-button" onClick={()=>ctx.setPage('chatbot')}>Preview the chatbot</button>
      <button type="button" className="button small primary" disabled={saving} onClick={()=>act(()=>api.updateChatConfig({...form,max_messages_per_team:Number(form.max_messages_per_team)}),'Chatbot saved.')}><Save size={14}/> Save chatbot</button></div>
  </details>;
}
