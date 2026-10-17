import React, { useState } from 'react';
import { ROUNDS } from '../data';
import { PageHead, Empty } from '../components/ui';
import { Plus } from 'lucide-react';

export function PlatformsPage({ctx}){
  const {d,api,act,saving,isHost,isStaff,myTeamId}=ctx;
  const [name,setName]=useState('');
  const active=d.platforms.filter(p=>p.is_active);
  const usage=id=>d.selections.filter(s=>s.platform_id===id).length;
  return <><PageHead eyebrow="COMPETITION RULE" title="AI platforms" desc="Every team must use a different approved AI platform in each of the four rounds."/>
    {active.length<ROUNDS.length&&<div className="alert error">Only {active.length} approved platform{active.length===1?' is':'s are'} active, but each team needs {ROUNDS.length} different platforms. {isHost?'Add the organizer-approved fourth platform below.':'Organizers still need to confirm the remaining platform(s).'}</div>}
    <section className="panel"><div className="panel-title"><div><h2>How the rule works</h2></div></div><ul className="deliverables">
      <li>Before submitting a round, your team declares which approved AI platform it used for that round.</li>
      <li>A platform your team declared for one round cannot be declared for any other round — the database rejects it.</li>
      <li>You can change your choice until you submit or the round closes. After that only a host can correct it, with a recorded reason.</li>
      <li>If a submission is rejected, your team keeps that round’s choice and may change it while the round is still open; it does not use up a platform in other rounds.</li>
      <li>The platform is <b>team-declared</b>. The portal does not connect to AI providers and cannot detect which tool was actually used; judges may ask to see it.</li></ul></section>
    {!isStaff&&myTeamId&&<section className="panel"><div className="panel-title"><div><h2>Your team’s platform plan</h2></div></div><div className="table-wrap"><table><thead><tr><th>Round</th><th>Declared platform</th></tr></thead><tbody>{ROUNDS.map(r=>{const sel=d.selections.find(s=>s.team_id===myTeamId&&s.round_id===r.id);return <tr key={r.id}><td>{r.id}. {r.name}</td><td>{sel?ctx.platformName(sel.platform_id):<span className="muted">Not chosen yet</span>}</td></tr>;})}</tbody></table></div></section>}
    <section className="panel"><div className="panel-title"><div><h2>Approved platforms</h2><p className="muted">{isHost?'Deactivate instead of deleting so past declarations stay intact.':'Managed by the event organizers.'}</p></div></div>
      {isHost&&<form className="inline-form" onSubmit={async e=>{e.preventDefault();if(await act(()=>api.addPlatform(name),`${name.trim()} added to the approved list.`))setName('');}}><input aria-label="New platform name" maxLength="40" value={name} onChange={e=>setName(e.target.value)} placeholder="Organizer-approved platform name"/><button className="button primary" disabled={saving||!name.trim()}><Plus size={16}/> Add platform</button></form>}
      <div className="table-wrap"><table><thead><tr><th>Platform</th><th>Status</th>{isStaff&&<th>Team-round declarations</th>}{isHost&&<th>Action</th>}</tr></thead><tbody>
        {d.platforms.map(p=><tr key={p.id}><td><b>{p.name}</b></td><td>{p.is_active?<span className="status scored">Approved</span>:<span className="status">Inactive</span>}</td>{isStaff&&<td>{usage(p.id)}</td>}{isHost&&<td><button className="button small" disabled={saving} onClick={()=>act(()=>api.updatePlatform(p.id,{is_active:!p.is_active}),p.is_active?`${p.name} deactivated.`:`${p.name} re-approved.`)}>{p.is_active?'Deactivate':'Re-approve'}</button></td>}</tr>)}
        {!d.platforms.length&&<tr><td colSpan="4"><Empty text="No platforms configured."/></td></tr>}
      </tbody></table></div></section></>;
}
