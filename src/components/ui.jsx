import React, { useEffect, useState } from 'react';
import { ClipboardList, FlaskConical, X } from 'lucide-react';

export function Field({label,hint,children}){return <label className="field"><span>{label}</span>{children}{hint&&<small className="hint">{hint}</small>}</label>}
export function Modal({title,close,children,wide}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className={`modal ${wide?'wide':''}`} role="dialog" aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close"><X size={18}/></button></div>{children}</section></div>}
export function PageHead({eyebrow,title,desc,actions}){return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{desc&&<p className="muted">{desc}</p>}</div>{actions&&<div className="head-actions">{actions}</div>}</div>}
export function Stat({label,value,foot,icon:Icon}){return <div className="stat"><div className="stat-top"><span>{label}</span><Icon size={18}/></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>}
export function Empty({text}){return <div className="empty"><ClipboardList size={24}/><p>{text}</p></div>}
export function StatusBadge({status}){return <span className={`status ${String(status).toLowerCase().replace(' ','-')}`}>{status}</span>}

export function fmtDate(v){return v?new Date(v).toLocaleString():'—'}
export function fmtTime(v){return v?new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—'}

/** Live countdown to a deadline; shows "Closed" once passed. */
export function Countdown({until}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(id);},[]);
  if(!until) return null;
  const ms=new Date(until)-now;
  if(ms<=0) return <span className="countdown closed">Closed</span>;
  const m=Math.floor(ms/60000), s=Math.floor(ms%60000/1000);
  return <span className={`countdown ${ms<120000?'urgent':''}`} aria-label="Time remaining">{m}:{String(s).padStart(2,'0')} left</span>;
}

/** Status chip for a round: upcoming / open (with countdown) / closed. */
export function RoundState({round}){
  if(!round) return null;
  const closed=round.status==='closed'||(round.closes_at&&new Date(round.closes_at)<=new Date());
  if(closed) return <span className="tag round-closed">Closed</span>;
  if(round.status==='open') return <span className="tag round-open">Open · <Countdown until={round.closes_at}/></span>;
  return <span className="tag">Upcoming · {round.duration_minutes} min</span>;
}

export function DemoBanner({onReset,onSwitch}){return <div className="demo-banner" role="status"><FlaskConical size={16}/><b>DEMO MODE</b><span>Sample data stored only in this browser. Not real event data and no real sign-in or authorization.</span><button className="button small" onClick={onSwitch}>Switch persona</button><button className="button small" onClick={onReset}>Reset demo data</button></div>}

export function downloadFile(name, text, type='text/csv;charset=utf-8;'){
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
