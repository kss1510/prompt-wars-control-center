import React from 'react';
import { ROUNDS, MAX_TOTAL, TIE_BREAK_TEXT } from '../data';
import { toCsv } from '../lib/rules';
import { PageHead, Stat, Empty, downloadFile } from '../components/ui';
import { Activity, Download, Medal, Trophy, Users } from 'lucide-react';

export function Leaderboard({ctx}){
  const {d,board,isStaff}=ctx;
  const hidden=!d.settings.leaderboard_visible;
  const anyTie=board.some(t=>t.tied);
  const pending=d.submissions.filter(s=>s.status!=='Scored'&&s.status!=='Rejected').length;
  function exportBoard(){downloadFile('prompt-wars-leaderboard.csv',toCsv([['Rank','Team','Total points',...ROUNDS.map(r=>`Round ${r.id} (${r.max})`),'Rounds scored','Tied'],...board.map(t=>[t.rank,t.name,t.score,...ROUNDS.map(r=>t.rounds[r.id]),t.scored,t.tied?'yes':''])]));}
  if(hidden&&!isStaff) return <><PageHead eyebrow="STANDINGS" title="Leaderboard"/><section className="panel"><Empty text="Standings are hidden by the host until the results announcement."/></section></>;
  return <><PageHead eyebrow="LIVE STANDINGS" title="Leaderboard" desc="Cumulative standings from fully scored, non-rejected submissions (database-computed)." actions={<button className="button" onClick={exportBoard}><Download size={16}/> Export CSV</button>}/>
    {hidden&&<div className="alert info">Hidden from students right now. Staff still see live standings.</div>}
    <div className="stats"><Stat label="Current leader" value={board[0]?.score??0} foot={board[0]?.score?`${board[0].name}${board[0].tied?' (tied)':''}`:'No scores yet'} icon={Trophy}/><Stat label="Teams" value={d.teams.length} foot="Registered teams" icon={Users}/><Stat label="Maximum points" value={MAX_TOTAL} foot="25 + 30 + 35 + 40" icon={Medal}/>{isStaff&&<Stat label="Pending reviews" value={pending} foot="Submitted or under review" icon={Activity}/>}</div>
    <section className="panel"><div className="panel-title"><div><h2>Overall ranking</h2><p className="muted">Tie-break (applied automatically): {TIE_BREAK_TEXT}</p></div>{anyTie&&<span className="status rejected">Tie present</span>}</div>
      <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>Progress</th><th>Rounds scored</th></tr></thead><tbody>{board.map(t=><tr key={t.id}><td>{t.rank===1&&t.score>0?'🏆':String(t.rank).padStart(2,'0')}{t.tied&&<small> tied</small>}</td><td><b>{t.name}</b>{t.aheadOn&&<small>Ahead on tie-break (Round {t.aheadOn})</small>}</td><td><b>{t.score} / {MAX_TOTAL}</b></td><td><div className="progress"><span style={{width:`${Math.min(100,t.score/MAX_TOTAL*100)}%`}}/></div></td><td>{t.scored}/4</td></tr>)}{!board.length&&<tr><td colSpan="5"><Empty text="No teams yet."/></td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Round-by-round points</h2><p className="muted">A round counts only when every criterion is scored.</p></div></div><div className="table-wrap"><table><thead><tr><th>Team</th>{ROUNDS.map(r=><th key={r.id}>R{r.id} / {r.max}</th>)}<th>Total</th></tr></thead><tbody>{board.map(t=><tr key={t.id}><td><b>{t.name}</b></td>{ROUNDS.map(r=><td key={r.id}>{t.rounds[r.id]}</td>)}<td><b>{t.score}</b></td></tr>)}</tbody></table></div></section></>;
}
