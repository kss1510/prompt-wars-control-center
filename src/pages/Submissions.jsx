import React, { useState } from 'react';
import { ROUNDS, STATUSES } from '../data';
import { roundFor, toCsv } from '../lib/rules';
import { PageHead, Empty, StatusBadge, fmtDate, downloadFile } from '../components/ui';
import { Download, FilePlus2 } from 'lucide-react';

export function Submissions({ctx}){
  const {d,isHost}=ctx;
  const [search,setSearch]=useState('');
  const [round,setRound]=useState('all');
  const [status,setStatus]=useState('all');
  const [platform,setPlatform]=useState('all');
  const rows=d.submissions.filter(s=>(round==='all'||s.round_id===Number(round))&&(status==='all'||s.status===status)&&(platform==='all'||s.platform_id===Number(platform))
    &&`${s.title} ${ctx.teamName(s.team_id)}`.toLowerCase().includes(search.toLowerCase()));
  function exportCsv(){
    downloadFile('prompt-wars-submissions.csv',toCsv([
      ['Submission ID','Team','Round','AI platform (declared)','Status','Points','Max','Submitted at','Submitted by','Title','Prompt(s)','Output','Analysis','Evidence','Artifact file','HTML attached','Local demo details','Demo verified','Evidence link','Initial plan','Revised plan','Risks & mitigation','Notes','Rejection reason'],
      ...rows.map(s=>[s.id,ctx.teamName(s.team_id),`${s.round_id}. ${roundFor(s.round_id).name}`,ctx.platformName(s.platform_id),s.status,ctx.isFullyScored(s)?ctx.subTotal(s.id):'',roundFor(s.round_id).max,s.created_at,ctx.personName(s.submitted_by),s.title,s.prompt_text,s.output_text,s.analysis_text,s.evidence_text,s.artifact_filename,s.artifact_html?'yes':'no',s.demo_details,s.demo_verified?'yes':'no',s.evidence_url,s.initial_plan,s.revised_plan,s.risks_mitigation,s.notes,s.rejection_reason])
    ]));
  }
  return <><PageHead eyebrow="WORKSPACE / SUBMISSIONS" title="Submissions" desc="Review entries and score them against the official rubric." actions={<><button className="button" onClick={exportCsv}><Download size={16}/> Export CSV</button>{isHost&&<button className="button primary" onClick={()=>ctx.setModal({type:'submit'})}><FilePlus2 size={16}/> Enter for a team</button>}</>}/>
    <section className="panel"><div className="filters">
      <input aria-label="Search submissions" placeholder="Search team or title…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select aria-label="Filter by round" value={round} onChange={e=>setRound(e.target.value)}><option value="all">All rounds</option>{ROUNDS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
      <select aria-label="Filter by AI platform" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="all">All platforms</option>{d.platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Team</th><th>Round</th><th>AI platform</th><th>Status</th><th>Score</th><th>Action</th></tr></thead><tbody>
      {rows.map(s=><tr key={s.id}><td><b>{ctx.teamName(s.team_id)}</b><small>{s.title} · {fmtDate(s.created_at)}</small></td><td>{s.round_id}. {roundFor(s.round_id)?.name}</td><td>{ctx.platformName(s.platform_id)}</td><td><StatusBadge status={s.status}/>{s.round_id===3&&<small>{s.demo_verified?'Demo verified':'Demo not verified'}</small>}</td><td><b>{ctx.isFullyScored(s)?`${ctx.subTotal(s.id)} / ${roundFor(s.round_id)?.max}`:'—'}</b></td><td><button className="button small" onClick={()=>ctx.setModal({type:'review',submissionId:s.id})}>{s.status==='Scored'?'Edit score':s.status==='Rejected'?'View':'Review & score'}</button></td></tr>)}
      {!rows.length&&<tr><td colSpan="6"><Empty text="No submissions match these filters."/></td></tr>}
    </tbody></table></div></section></>;
}
