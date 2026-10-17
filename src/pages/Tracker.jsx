import React from 'react';
import { ROUNDS } from '../data';
import { duplicatePlatformTeams } from '../lib/rules';
import { PageHead, Empty, StatusBadge, RoundState } from '../components/ui';

/** Team × round grid: declared platform and submission status, for fast event-day monitoring. */
export function Tracker({ctx}){
  const {d}=ctx;
  const dupes=duplicatePlatformTeams(d.selections);
  const cell=(teamId,roundId)=>({
    platform:d.selections.find(s=>s.team_id===teamId&&s.round_id===roundId)?.platform_id,
    sub:d.submissions.find(s=>s.team_id===teamId&&s.round_id===roundId&&s.status!=='Rejected')
  });
  const summary=ROUNDS.map(r=>{
    const cells=d.teams.map(t=>cell(t.id,r.id));
    return {r,submitted:cells.filter(c=>c.sub).length,noPlatform:cells.filter(c=>!c.platform).length,awaiting:cells.filter(c=>c.sub&&c.sub.status!=='Scored').length};
  });
  return <><PageHead eyebrow="EVENT DAY" title="Round tracker" desc="Which teams have declared a platform and submitted in each round. Click a submission to review it."/>
    {dupes.length>0&&<div className="alert error">Data problem: {dupes.map(ctx.teamName).join(', ')} reuse an AI platform. Correct it from the submission’s host tools.</div>}
    <div className="stats">{summary.map(({r,submitted,noPlatform,awaiting})=><div className="stat" key={r.id}><div className="stat-top"><span>R{r.id} · {r.name}</span></div><div className="stat-value">{submitted}/{d.teams.length}</div><div className="stat-foot">{awaiting} awaiting judging · {noPlatform} without platform<br/><RoundState round={ctx.roundRow(r.id)}/></div></div>)}</div>
    <section className="panel"><div className="table-wrap"><table className="tracker"><thead><tr><th>Team</th>{ROUNDS.map(r=><th key={r.id}>R{r.id} · {r.name}</th>)}</tr></thead><tbody>
      {d.teams.map(t=><tr key={t.id}><td><b>{t.name}</b><small>{d.memberships.filter(m=>m.team_id===t.id).length} members</small></td>
        {ROUNDS.map(r=>{const c=cell(t.id,r.id);return <td key={r.id} data-testid={`cell-${t.id}-${r.id}`}>
          <div className={c.platform?'':'warn-text'}>{c.platform?ctx.platformName(c.platform):'No platform'}</div>
          {c.sub?<button className="link-button" onClick={()=>ctx.setModal({type:'review',submissionId:c.sub.id})}><StatusBadge status={c.sub.status}/>{ctx.isFullyScored(c.sub)&&<b> {ctx.subTotal(c.sub.id)}</b>}</button>:<small className="muted">Not submitted</small>}
        </td>;})}</tr>)}
      {!d.teams.length&&<tr><td colSpan="5"><Empty text="No teams yet."/></td></tr>}
    </tbody></table></div></section></>;
}
