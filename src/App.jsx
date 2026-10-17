import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, configured, demoMode } from './lib/supabase';
import { createSupabaseApi } from './lib/api';
import { createDemoApi } from './lib/demoApi';
import { MAX_TOTAL, EVENT_DEFAULTS } from './data';
import { buildLeaderboard, roundFor } from './lib/rules';
import { DemoBanner } from './components/ui';
import { SubmissionModal, ReviewModal, TeamModal, ImportModal } from './components/modals';
import { Overview } from './pages/Overview';
import { Submissions } from './pages/Submissions';
import { Tracker } from './pages/Tracker';
import { Leaderboard } from './pages/Leaderboard';
import { TeamsPage } from './pages/Teams';
import { RoundsPage } from './pages/Rounds';
import { PlatformsPage } from './pages/Platforms';
import { SettingsPage } from './pages/Settings';
import { CheckCircle2, ChevronRight, ClipboardList, Cpu, FlaskConical, Grid3x3, LayoutDashboard, LogOut, RefreshCw, Settings, ShieldCheck, Trophy, Users, WandSparkles, X } from 'lucide-react';

const api = demoMode ? createDemoApi() : configured ? createSupabaseApi(supabase) : null;

const NAV = [
  {id:'overview',label:'Overview',icon:LayoutDashboard},
  {id:'tracker',label:'Round tracker',icon:Grid3x3,staff:true},
  {id:'submissions',label:'Submissions',icon:ClipboardList,staff:true},
  {id:'leaderboard',label:'Leaderboard',icon:Trophy},
  {id:'teams',label:'Teams',icon:Users,host:true},
  {id:'rounds',label:'Rounds & scoring',icon:WandSparkles},
  {id:'platforms',label:'AI platforms',icon:Cpu},
  {id:'settings',label:'Event settings',icon:Settings,host:true}
];
const EMPTY = {teams:[],memberships:[],submissions:[],scores:[],roundScores:[],settings:EVENT_DEFAULTS,rounds:[],platforms:[],selections:[],roster:[],profiles:[],audit:[]};

export default function App() {
  const [session,setSession]=useState(null);
  const [d,setD]=useState(null);
  const [page,setPage]=useState('overview');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [modal,setModal]=useState(null);
  const [saving,setSaving]=useState(false);

  const say=msg=>{setNotice(msg);window.setTimeout(()=>setNotice(''),4000);};
  const fail=err=>{console.error(err);setError(err?.message||String(err));};

  const loadData=useCallback(async () => {
    if(!api || !session?.user) return;
    setLoading(true);
    try { setD(await api.loadAll(session.user)); setError(''); }
    catch(e) { fail(e); }
    finally { setLoading(false); }
  },[session?.user?.id]);

  useEffect(()=>{
    if(!api){setLoading(false);return;}
    api.auth.getSession().then(s=>{setSession(s); if(!s)setLoading(false);});
    return api.auth.onChange(next=>{setSession(next); if(!next){setD(null);setLoading(false);setPage('overview');}});
  },[]);
  useEffect(()=>{if(session?.user)loadData();},[session?.user?.id,loadData]);
  // One score save emits several change events; coalesce them so ~60 open browsers reload once, not six times.
  useEffect(()=>{
    if(!session) return;
    let timer=null;
    const stop=api.subscribe(()=>{clearTimeout(timer);timer=setTimeout(()=>loadData(),600);});
    return ()=>{clearTimeout(timer);stop();};
  },[session?.user?.id,loadData]);

  /** Run a write, show the database's message on failure, reload shared data on success. */
  const act=useCallback(async (fn,message)=>{
    setSaving(true);setError('');
    try { const result=await fn(); if(message) say(message); await loadData(); return result ?? true; }
    catch(e){ fail(e); return false; }
    finally{ setSaving(false); }
  },[loadData]);

  const ctx=useMemo(()=>{
    const data=d||EMPTY;
    const profile=data.profile;
    const isHost=profile?.role==='host';
    const isStaff=isHost||profile?.role==='judge';
    const myTeamId=data.memberships.find(m=>m.user_id===profile?.id)?.team_id??null;
    const scoresFor=id=>data.scores.filter(s=>s.submission_id===id).sort((a,b)=>a.criterion_index-b.criterion_index);
    return {
      d:data, api, profile, isHost, isStaff, myTeamId, saving, act, setModal, setPage, demo:api?.mode==='demo',
      myTeam:data.teams.find(t=>t.id===myTeamId),
      teamName:id=>data.teams.find(t=>t.id===id)?.name||`Team ${id}`,
      platformName:id=>data.platforms.find(p=>p.id===id)?.name||'—',
      personName:id=>data.profiles.find(p=>p.id===id)?.full_name||data.roster.find(p=>p.user_id===id)?.full_name||(id===profile?.id?profile.full_name:'')||'—',
      roundRow:id=>data.rounds.find(r=>r.id===Number(id)),
      scoresFor,
      subTotal:id=>scoresFor(id).reduce((n,s)=>n+Number(s.points),0),
      isFullyScored:s=>scoresFor(s.id).length===roundFor(s.round_id)?.criteria.length,
      board:buildLeaderboard(data.teams,data.roundScores)
    };
  },[d,saving,act]);

  async function signOut(){await api.auth.signOut();setError('');}
  function resetDemo(){if(window.confirm('Reset all demo data in this browser?')){api.reset();api.auth.signOut();}}

  if(!api) return <SetupScreen />;
  if(!session) return api.mode==='demo'
    ? <DemoPersonaScreen personas={api.personas()} pick={id=>api.auth.signIn(id)} onReset={()=>{api.reset();say('Demo data reset.');}} notice={notice}/>
    : <AuthScreen api={api} />;
  if(loading&&!d) return <div className="center-screen"><div className="spinner"/><p>Loading your event workspace…</p></div>;
  if(error&&!d) return <div className="center-screen"><div className="auth-card"><ShieldCheck size={34}/><h1>Account setup incomplete</h1><p>{error}</p><p>Confirm your email if required, then sign in again. If this persists, ask the host to check the database setup and migrations.</p><button className="button primary" onClick={loadData}>Retry</button><button className="button" onClick={signOut}>Sign out</button></div></div>;

  const {profile,isHost,isStaff}=ctx;
  const nav=NAV.filter(n=>(!n.host||isHost)&&(!n.staff||isStaff));
  const currentPage=nav.some(n=>n.id===page)?page:'overview';
  return <div className="app-shell">
    {ctx.demo&&<DemoBanner onReset={resetDemo} onSwitch={signOut}/>}
    <header className="topbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('overview')}}><span className="logo">PW</span><span><b>Prompt Wars <i>/</i> Control Center</b><small>AI Survival Arena · ACM GITAM AI/ML Domain</small></span></a><div className="top-actions"><span className={`role-pill ${isHost?'host':''}`}>{profile?.role||'student'}</span><span className="user-email">{ctx.demo?profile?.full_name:session.user.email}</span><button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17}/></button></div></header>
    <div className="mobile-tabs">{nav.map(n=><button key={n.id} className={currentPage===n.id?'active':''} onClick={()=>setPage(n.id)}>{n.label}</button>)}</div>
    <div className="layout"><aside className="sidebar"><div className="nav-caption">EVENT WORKSPACE</div><nav>{nav.map(({id,label,icon:Icon})=><button key={id} className={currentPage===id?'active':''} onClick={()=>setPage(id)}><Icon size={17}/>{label}<ChevronRight size={14}/></button>)}</nav><div className="side-info">{ctx.demo?<FlaskConical size={18}/>:<ShieldCheck size={18}/>}<b>{ctx.demo?'Demo workspace':'Role-protected workspace'}</b><p>{ctx.demo?'Personas are for rehearsal only. Real permissions are enforced by the database in event mode.':'Your account permissions are enforced by database policies, not this menu.'}</p></div><div className="side-bottom"><span className="online-dot"/> {ctx.demo?'Local demo data':'Connected to shared event data'}</div></aside>
      <main className="main">
        {error&&<div className="alert error" role="alert"><b>Action failed:</b> {error}<button onClick={()=>setError('')} aria-label="Dismiss"><X size={15}/></button></div>}
        {notice&&<div className="alert success" role="status"><CheckCircle2 size={17}/>{notice}</div>}
        {currentPage==='overview'&&<Overview ctx={ctx}/>}
        {currentPage==='tracker'&&<Tracker ctx={ctx}/>}
        {currentPage==='submissions'&&<Submissions ctx={ctx}/>}
        {currentPage==='leaderboard'&&<Leaderboard ctx={ctx}/>}
        {currentPage==='teams'&&<TeamsPage ctx={ctx}/>}
        {currentPage==='rounds'&&<RoundsPage ctx={ctx}/>}
        {currentPage==='platforms'&&<PlatformsPage ctx={ctx}/>}
        {currentPage==='settings'&&<SettingsPage ctx={ctx}/>}
        {loading&&<div className="refresh-line"><RefreshCw size={14}/> Refreshing shared data…</div>}
      </main>
    </div>
    {modal?.type==='submit'&&<SubmissionModal ctx={ctx} {...modal} close={()=>setModal(null)}/>}
    {modal?.type==='review'&&<ReviewModal ctx={ctx} submissionId={modal.submissionId} close={()=>setModal(null)}/>}
    {modal?.type==='team'&&<TeamModal ctx={ctx} close={()=>setModal(null)}/>}
    {modal?.type==='import'&&<ImportModal ctx={ctx} close={()=>setModal(null)}/>}
    <footer className="footer">Prompt Wars · {ctx.demo?'demo workspace (not real data)':'shared event workspace'} <span>·</span> 4 rounds <span>·</span> {MAX_TOTAL} possible points</footer>
  </div>;
}

function SetupScreen(){return <div className="center-screen"><div className="auth-card setup-card"><span className="logo large">PW</span><p className="eyebrow">AI SURVIVAL ARENA</p><h1>Connect your event workspace</h1><p>This React app is ready for Supabase. Create a project, run the SQL setup, then add your project URL and publishable key to <code>.env</code>.</p><ol><li>Create a Supabase project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com/dashboard</a>.</li><li>In the SQL Editor run <code>supabase/schema.sql</code>, then each file in <code>supabase/migrations/</code> in order.</li><li>Copy <code>.env.example</code> to <code>.env</code> and fill in the Project URL and publishable key.</li><li>Restart <code>npm run dev</code>.</li></ol><div className="alert info">Want to rehearse first? Run <code>npm run dev:demo</code> for a local demo with sample data.</div><div className="alert info">Never put a Supabase service-role secret in a browser app.</div></div></div>}

function AuthScreen({api}){
  const [mode,setMode]=useState('signin');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [fullName,setFullName]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function submit(e){
    e.preventDefault();setSaving(true);setError('');setNotice('');
    try {
      if(mode==='signup'){
        const data=await api.auth.signUp(email.trim(),password,fullName.trim());
        setNotice(data?.session?'Account created. Ask the event host to assign your team.':'Check your email to confirm your account, then sign in.');
      } else await api.auth.signIn(email.trim(),password);
    } catch(err){setError(err.message);} finally{setSaving(false);}
  }
  return <div className="center-screen auth-bg"><div className="auth-card"><span className="logo large">PW</span><p className="eyebrow">ACM GITAM AI/ML DOMAIN · EVENT WORKSPACE</p><h1>{mode==='signin'?'Welcome back':'Join Prompt Wars'}</h1><p className="muted">{mode==='signin'?'Sign in to access your team’s event workspace.':'Create your participant account. The host will assign your team.'}</p>{error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}<form onSubmit={submit}>{mode==='signup'&&<label className="field"><span>Full name</span><input required value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" maxLength="100"/></label>}<label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field"><span>Password</span><input type="password" required minLength="8" autoComplete={mode==='signin'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={saving} className="button primary full">{saving?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button></form><p className="auth-switch">{mode==='signin'?'New to Prompt Wars?':'Already registered?'} <button onClick={()=>setMode(mode==='signin'?'signup':'signin')}>{mode==='signin'?'Create account':'Sign in'}</button></p><p className="security-note"><ShieldCheck size={14}/> Roles are assigned by the event host, not selected during signup.</p></div></div>;
}

function DemoPersonaScreen({personas,pick,onReset,notice}){
  const group=role=>personas.filter(p=>p.role===role);
  return <div className="center-screen auth-bg"><div className="auth-card"><span className="logo large">PW</span><p className="eyebrow">DEMO MODE · SAMPLE DATA ONLY</p><h1>Choose a demo persona</h1><p className="muted">Rehearse the event workflow with fictional teams. Data stays in this browser and is never sent to Supabase. Personas are not real sign-in or authorization.</p>{notice&&<div className="alert success">{notice}</div>}
    {['host','judge','student'].map(role=><div key={role} className="persona-group"><div className="rubric-label">{role}s</div>{group(role).map(p=><button key={p.id} className="button full persona" onClick={()=>pick(p.id)}>{p.full_name}</button>)}</div>)}
    <button className="text-button" onClick={onReset}>Reset demo data</button></div></div>;
}
