import React, { useState } from 'react';
import { ROUNDS } from '../data';
import { eventTiming } from '../lib/rules';
import { PageHead, RoundState, fmtTime } from '../components/ui';
import { MonitorSmartphone, Play, Square, RotateCcw } from 'lucide-react';

export function RoundsPage({ctx}){
  const {d,isHost}=ctx;
  const live=d.rounds.length?d.rounds:ROUNDS;
  const t=eventTiming(d.settings,live);
  return <><PageHead eyebrow="EVENT DESIGN / SCORING" title="Rounds & scoring" desc="Official challenge descriptions, deliverables, AI platform rule and judge rubrics."/>
    <div className={`alert ${t.bufferMinutes<0?'error':'info'}`}><b>Event timing:</b> {live.map(r=>r.duration_minutes??r.minutes).join(' + ')} = {t.challengeMinutes} challenge minutes inside the {t.windowMinutes}-minute event window ({fmtTime(d.settings.starts_at)}–{fmtTime(d.settings.ends_at)}). That leaves {t.bufferMinutes} minutes for briefing, transitions, judging and the results announcement.</div>
    <div className="alert info"><b>Different AI platform every round:</b> each team declares one approved platform per round and may not reuse it in another round. The portal records the team’s declaration; it does not detect which tool was actually used.</div>
    <div className="round-cards">{ROUNDS.map(r=><article className="round-card" key={r.id}><div className="round-card-top"><span className="tag">ROUND {r.id}</span><RoundState round={ctx.roundRow(r.id)}/></div><h3>{r.name}</h3><p>{r.desc}</p>
      {r.responsible&&<p className="hint">{r.responsible}</p>}
      {r.localDemo&&<p className="hint"><MonitorSmartphone size={13}/> {r.localDemo}</p>}
      <div className="rubric-label">REQUIRED SUBMISSION</div><ul className="deliverables">{r.fields.filter(f=>f.required).map(f=><li key={f.key}>{f.label}</li>)}</ul>
      <div className="rubric-label">JUDGING RUBRIC</div>{r.criteria.map(c=><div className="criterion" key={c.name}><span>{c.name}</span><b>{c.max} pts</b></div>)}<div className="round-total"><span>Maximum score</span><b>{r.max} points</b></div>
      {isHost&&<RoundControls ctx={ctx} round={ctx.roundRow(r.id)}/>}
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
