import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, configured } from './lib/supabase';
import { ROUNDS, MAX_TOTAL } from './data';
import { Activity, ArrowUpRight, CheckCircle2, ChevronRight, ClipboardList, Download, FilePlus2, LayoutDashboard, LogOut, Medal, RefreshCw, ShieldCheck, Users, Trophy, WandSparkles, X } from 'lucide-react';

const NAV = [
  {id:'overview',label:'Overview',icon:LayoutDashboard},
  {id:'submissions',label:'Submissions',icon:ClipboardList},
  {id:'leaderboard',label:'Leaderboard',icon:Trophy},
  {id:'teams',label:'Teams',icon:Users},
  {id:'rounds',label:'Rounds & scoring',icon:WandSparkles}
];
const roundFor = id => ROUNDS.find(r=>r.id===Number(id));
const csvCell = v => `"${String(v ?? '').replaceAll('"','""')}"`;
function downloadCsv(name, rows) {
  const text = rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function fmtDate(v) { return v ? new Date(v).toLocaleString() : '—'; }
function sumScore(s) { return (s.scores || []).reduce((n,x)=>n+Number(x.points||0),0); }

export default function App() {
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [page,setPage]=useState('overview');
  const [teams,setTeams]=useState([]);
  const [memberships,setMemberships]=useState([]);
  const [submissions,setSubmissions]=useState([]);
  const [scores,setScores]=useState([]);
  const [leaderboardRows,setLeaderboardRows]=useState([]);
  const [roundScoreRows,setRoundScoreRows]=useState([]);
  const [profiles,setProfiles]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [authMode,setAuthMode]=useState('signin');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [fullName,setFullName]=useState('');
  const [search,setSearch]=useState('');
  const [roundFilter,setRoundFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('all');
  const [modal,setModal]=useState(null);
  const [saving,setSaving]=useState(false);
  const [teamName,setTeamName]=useState('');
  const [teamMembers,setTeamMembers]=useState([]);
  const [subForm,setSubForm]=useState({team_id:'',round_id:'1',title:'',prompt_text:'',output_text:'',notes:''});
  const [scoreForm,setScoreForm]=useState({});
  const [judgeNote,setJudgeNote]=useState('');

  const isAdmin=['host','judge'].includes(profile?.role);
  const isHost=profile?.role==='host';
  const myTeamIds=useMemo(()=>memberships.map(m=>m.team_id),[memberships]);
  const myTeam=teams.find(t=>myTeamIds.includes(t.id));
  const say=msg=>{setNotice(msg);window.setTimeout(()=>setNotice(''),4000);};
  const fail=err=>{console.error(err);setError(err?.message||String(err));};

  const loadData=useCallback(async (user=session?.user) => {
    if(!supabase || !user) return;
    setLoading(true); setError('');
    try {
      const [p,t,m,s,sc,lb,rb] = await Promise.all([
        supabase.from('profiles').select('id,full_name,role').eq('id',user.id).single(),
        supabase.from('teams').select('id,name,created_at').order('id'),
        supabase.from('team_members').select('team_id,user_id,profiles(id,full_name,email)').order('created_at'),
        supabase.from('submissions').select('id,team_id,round_id,title,prompt_text,output_text,notes,status,submitted_by,created_at').order('created_at',{ascending:false}),
        supabase.from('scores').select('id,submission_id,criterion_index,points,feedback,scored_by,created_at'),
        supabase.from('leaderboard').select('team_id,team_name,total_points,submission_count,scored_submissions'),
        supabase.from('leaderboard_round_scores').select('team_id,team_name,round_id,points')
      ]);
      for (const result of [p,t,m,s,sc,lb,rb]) if(result.error) throw result.error;
      setProfile(p.data); setTeams(t.data||[]); setMemberships(m.data||[]);
      setSubmissions(s.data||[]); setScores(sc.data||[]); setLeaderboardRows(lb.data||[]); setRoundScoreRows(rb.data||[]);
      if(['host','judge'].includes(p.data.role)) {
        const pr=await supabase.from('profiles').select('id,full_name,role');
        if(pr.error) throw pr.error; setProfiles(pr.data||[]);
      } else setProfiles([]);
    } catch(e) { fail(e); }
    finally { setLoading(false); }
  },[session?.user?.id]);

  useEffect(()=>{
    if(!configured){setLoading(false);return;}
    supabase.auth.getSession().then(({data})=>{setSession(data.session); if(!data.session)setLoading(false);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next); if(!next){setProfile(null);setTeams([]);setMemberships([]);setSubmissions([]);setScores([]);setLeaderboardRows([]);setRoundScoreRows([]);setProfiles([]);setLoading(false);} });
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(session?.user)loadData(session.user);},[session?.user?.id,loadData]);
  useEffect(()=>{
    if(!configured||!session) return;
    const channel=supabase.channel('prompt-wars-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'submissions'},()=>loadData())
      .on('postgres_changes',{event:'*',schema:'public',table:'scores'},()=>loadData())
      .on('postgres_changes',{event:'*',schema:'public',table:'teams'},()=>loadData())
      .on('postgres_changes',{event:'*',schema:'public',table:'team_members'},()=>loadData())
      .subscribe();
    return ()=>{supabase.removeChannel(channel);};
  },[session?.user?.id,loadData]);

  const scoresFor = submissionId => scores.filter(s=>s.submission_id===submissionId).sort((a,b)=>a.criterion_index-b.criterion_index);
  const totalForSubmission = submissionId => scoresFor(submissionId).reduce((n,s)=>n+Number(s.points),0);
  const scoredSubmission = s => scoresFor(s.id).length===roundFor(s.round_id)?.criteria.length;
  const teamScore = teamId => Number(leaderboardRows.find(r=>r.team_id===teamId)?.total_points||0);
  const roundScore = (teamId,roundId) => Number(roundScoreRows.find(r=>r.team_id===teamId&&r.round_id===roundId)?.points||0);
  const board = useMemo(()=>teams.map(t=>{const row=leaderboardRows.find(r=>r.team_id===t.id);return {...t,score:Number(row?.total_points||0),submitted:Number(row?.submission_count||0),scored:Number(row?.scored_submissions||0)}}).sort((a,b)=>b.score-a.score||b.submitted-a.submitted||a.id-b.id),[teams,leaderboardRows]);
  const canViewSubmission = s => isAdmin || myTeamIds.includes(s.team_id);
  const visibleSubmissions = submissions.filter(canViewSubmission).filter(s=>(roundFilter==='all'||s.round_id===Number(roundFilter))&&(statusFilter==='all'||(scoredSubmission(s)?'Scored':s.status)===statusFilter)&&`${s.title} ${teams.find(t=>t.id===s.team_id)?.name||''} ${s.prompt_text}`.toLowerCase().includes(search.toLowerCase()));

  async function submitAuth(e) {
    e.preventDefault(); setSaving(true);setError('');
    try {
      if(authMode==='signup') {
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{full_name:fullName.trim()}}});
        if(error) throw error;
        if(data.session) {setSession(data.session);say('Account created. Ask the event host to assign your team.');}
        else say('Check your email to confirm your account, then sign in.');
      } else {
        const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(error) throw error; setSession(data.session); say('Signed in successfully.');
      }
    } catch(e){fail(e);} finally{setSaving(false);}
  }
  async function signOut(){await supabase.auth.signOut();setPage('overview');setError('');}
  async function saveSubmission(e) {
    e.preventDefault(); setSaving(true);setError('');
    try {
      const payload={team_id:Number(subForm.team_id),round_id:Number(subForm.round_id),title:subForm.title.trim(),prompt_text:subForm.prompt_text.trim(),output_text:subForm.output_text.trim(),notes:subForm.notes.trim()||null};
      const {error}=await supabase.from('submissions').insert(payload); if(error) throw error;
      setModal(null);setSubForm({team_id:String(myTeam?.id||''),round_id:'1',title:'',prompt_text:'',output_text:'',notes:''});say('Submission sent for review.');await loadData();
    } catch(e){fail(e);} finally{setSaving(false);}
  }
  async function saveScore(e,submission) {
    e.preventDefault();setSaving(true);setError('');
    try {
      const r=roundFor(submission.round_id);
      const rows=r.criteria.map((c,i)=>({submission_id:submission.id,criterion_index:i,points:Number(scoreForm[i]??0),feedback:judgeNote.trim()||null}));
      for(const row of rows) if(!Number.isInteger(row.points)||row.points<0||row.points>r.criteria[row.criterion_index].max) throw new Error('A criterion score is outside its allowed range.');
      const {error}=await supabase.from('scores').upsert(rows,{onConflict:'submission_id,criterion_index'});if(error)throw error;
      setModal(null);say('Scores saved. Leaderboard updated.');await loadData();
    } catch(e){fail(e);} finally{setSaving(false);}
  }
  async function createTeam(e) {
    e.preventDefault();setSaving(true);setError('');
    try {
      const {data,error}=await supabase.from('teams').insert({name:teamName.trim()}).select('id').single();if(error)throw error;
      const selected=teamMembers.filter(Boolean);
      if(selected.length){const result=await supabase.from('team_members').insert(selected.map(user_id=>({team_id:data.id,user_id})));if(result.error)throw result.error;}
      setModal(null);setTeamName('');setTeamMembers([]);say('Team created.');await loadData();
    } catch(e){fail(e);} finally{setSaving(false);}
  }
  async function assignMember(e,teamId) {
    const userId=e.target.value;if(!userId)return;
    setSaving(true);setError('');
    try {const {error}=await supabase.from('team_members').insert({team_id:teamId,user_id:userId});if(error)throw error;await loadData();say('Member assigned.');}
    catch(e){fail(e);}finally{setSaving(false);e.target.value='';}
  }
  async function removeMember(teamId,userId) {
    setSaving(true);setError('');
    try {const {error}=await supabase.from('team_members').delete().eq('team_id',teamId).eq('user_id',userId);if(error)throw error;await loadData();say('Member removed.');}
    catch(e){fail(e);}finally{setSaving(false);}
  }
  function openSubmission() {
    const allowedTeams=isAdmin?teams.filter(t=>isHost||memberships.some(m=>m.team_id===t.id)):teams.filter(t=>myTeamIds.includes(t.id));
    setSubForm({team_id:String(allowedTeams[0]?.id||''),round_id:'1',title:'',prompt_text:'',output_text:'',notes:''});setModal({type:'submission',teams:allowedTeams});
  }
  function openScore(s) {
    const r=roundFor(s.round_id);const current=scoresFor(s.id);
    const next={};r.criteria.forEach((c,i)=>next[i]=current.find(x=>x.criterion_index===i)?.points??'');
    setScoreForm(next);setJudgeNote(current[0]?.feedback||'');setModal({type:'score',submission:s});
  }
  function exportBoard(){downloadCsv('prompt-wars-leaderboard.csv',[['Rank','Team','Total points',...ROUNDS.map(r=>`Round ${r.id}`),'Submissions scored'],...board.map((t,i)=>[i+1,t.name,t.score,...ROUNDS.map(r=>roundScore(t.id,r.id)),t.scored])]);}
  function exportSubmissions(){downloadCsv('prompt-wars-submissions.csv',[['Submission','Team','Round','Status','Points','Submitted at'],...visibleSubmissions.map(s=>[s.title,teams.find(t=>t.id===s.team_id)?.name,roundFor(s.round_id)?.name,scoredSubmission(s)?'Scored':'Submitted',scoredSubmission(s)?totalForSubmission(s.id):'',s.created_at])]);}
  if(!configured) return <SetupScreen />;
  if(!session) return <AuthScreen {...{authMode,setAuthMode,email,setEmail,password,setPassword,fullName,setFullName,submitAuth,saving,error,notice}} />;
  if(loading&&!profile) return <div className="center-screen"><div className="spinner"/><p>Loading your event workspace…</p></div>;
  if(error&&!profile) return <div className="center-screen"><div className="auth-card"><ShieldCheck size={34}/><h1>Account setup incomplete</h1><p>{error}</p><p>Confirm your email if required, then sign in again. If this persists, ask the host to check the database setup.</p><button className="button primary" onClick={loadData}>Retry</button><button className="button" onClick={signOut}>Sign out</button></div></div>;
  const currentPage=page==='teams'&&!isHost?'overview':page==='submissions'&&!isAdmin?'submissions':page;
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('overview')}}><span className="logo">PW</span><span><b>Prompt Wars <i>/</i> Control Center</b><small>AI Survival Arena · ACM AIML Domain</small></span></a><div className="top-actions"><span className={`role-pill ${isHost?'host':''}`}>{profile?.role||'student'}</span><span className="user-email">{session.user.email}</span><button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={17}/></button></div></header>
    <div className="mobile-tabs">{NAV.filter(n=>n.id!=='teams'||isHost).filter(n=>n.id!=='submissions'||isAdmin).map(n=><button key={n.id} className={page===n.id?'active':''} onClick={()=>setPage(n.id)}>{n.label}</button>)}</div>
    <div className="layout"><aside className="sidebar"><div className="nav-caption">EVENT WORKSPACE</div><nav>{NAV.filter(n=>n.id!=='teams'||isHost).filter(n=>n.id!=='submissions'||isAdmin).map(({id,label,icon:Icon})=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><Icon size={17}/>{label}<ChevronRight size={14}/></button>)}</nav><div className="side-info"><ShieldCheck size={18}/><b>Role-protected workspace</b><p>Your account permissions are enforced by database policies, not this menu.</p></div><div className="side-bottom"><span className="online-dot"/> Connected to shared event data</div></aside>
      <main className="main">
        {error&&<div className="alert error"><b>Action failed:</b> {error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
        {notice&&<div className="alert success"><CheckCircle2 size={17}/>{notice}</div>}
        {currentPage==='overview'&&<Overview {...{teams,submissions,board,profile,isAdmin,isHost,openSubmission,setPage,roundScore,scoredSubmission,totalForSubmission}} />}
        {currentPage==='submissions'&&<Submissions {...{visibleSubmissions,teams,roundFor,scoredSubmission,totalForSubmission,openSubmission,openScore,isAdmin,search,setSearch,roundFilter,setRoundFilter,statusFilter,setStatusFilter,exportSubmissions}} />}
        {currentPage==='leaderboard'&&<Leaderboard {...{board,teams,roundScore,exportBoard}} />}
        {currentPage==='teams'&&isHost&&<TeamsPage {...{teams,memberships,profiles,submissions,teamScore,openCreate:()=>{setTeamName('');setTeamMembers([]);setModal({type:'team'})},assignMember,removeMember,loading}} />}
        {currentPage==='rounds'&&<RoundsPage />}
        {loading&&<div className="refresh-line"><RefreshCw size={14}/> Refreshing shared data…</div>}
      </main>
    </div>
    {modal?.type==='submission'&&<Modal title="Submit team work" close={()=>setModal(null)}><form onSubmit={saveSubmission}>
      <div className="form-grid"><Field label="Team"><select required value={subForm.team_id} disabled={!isHost} onChange={e=>setSubForm({...subForm,team_id:e.target.value})}><option value="">Choose team</option>{modal.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><Field label="Round"><select value={subForm.round_id} onChange={e=>setSubForm({...subForm,round_id:e.target.value})}>{ROUNDS.map(r=><option key={r.id} value={r.id}>{r.id}. {r.name} — {r.max} pts</option>)}</select></Field></div>
      <Field label="Submission title"><input required maxLength="100" value={subForm.title} onChange={e=>setSubForm({...subForm,title:e.target.value})} placeholder="e.g. Pomodoro timer v1"/></Field>
      <Field label="Prompt used"><textarea required value={subForm.prompt_text} onChange={e=>setSubForm({...subForm,prompt_text:e.target.value})} placeholder="Paste the prompt submitted to the AI…"/></Field>
      <Field label="AI output / result summary"><textarea required value={subForm.output_text} onChange={e=>setSubForm({...subForm,output_text:e.target.value})} placeholder="Paste output or describe the artifact and test result…"/></Field>
      <Field label="Notes / evidence (optional)"><input value={subForm.notes} onChange={e=>setSubForm({...subForm,notes:e.target.value})} placeholder="Screenshot, file name, observations…"/></Field>
      <div className="modal-actions"><button type="button" className="button" onClick={()=>setModal(null)}>Cancel</button><button disabled={saving||!modal.teams.length} className="button primary">{saving?'Submitting…':'Submit for review'}</button></div>
      {!modal.teams.length&&<p className="muted">You need an assigned team before submitting. Ask the event host.</p>}
    </form></Modal>}
    {modal?.type==='score'&&<Modal title="Judge submission" close={()=>setModal(null)}><div className="submission-preview"><b>{modal.submission.title}</b><span>{teams.find(t=>t.id===modal.submission.team_id)?.name} · {roundFor(modal.submission.round_id)?.name}</span><h4>Prompt</h4><p>{modal.submission.prompt_text}</p><h4>Output / result</h4><p>{modal.submission.output_text}</p>{modal.submission.notes&&<><h4>Notes</h4><p>{modal.submission.notes}</p></>}</div><form onSubmit={e=>saveScore(e,modal.submission)}><p className="rubric-label">SCORING RUBRIC · MAX {roundFor(modal.submission.round_id).max} POINTS</p>{roundFor(modal.submission.round_id).criteria.map((c,i)=><Field key={c.name} label={`${c.name} (max ${c.max})`}><input type="number" min="0" max={c.max} step="1" required value={scoreForm[i]??''} onChange={e=>setScoreForm({...scoreForm,[i]:e.target.value})}/></Field>)}<Field label="Judge feedback (optional)"><textarea value={judgeNote} onChange={e=>setJudgeNote(e.target.value)} placeholder="Short feedback for the team…"/></Field><div className="modal-actions"><button type="button" className="button" onClick={()=>setModal(null)}>Cancel</button><button disabled={saving} className="button primary">{saving?'Saving…':'Save scores'}</button></div></form></Modal>}
    {modal?.type==='team'&&<Modal title="Create team" close={()=>setModal(null)}><form onSubmit={createTeam}><Field label="Team name"><input required maxLength="60" value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="e.g. Prompt Pioneers"/></Field><Field label="Assign registered students (optional)"><select multiple value={teamMembers} onChange={e=>setTeamMembers([...e.target.selectedOptions].map(o=>o.value))} size="6">{profiles.filter(p=>p.role==='student'&&!memberships.some(m=>m.user_id===p.id)).map(p=><option key={p.id} value={p.id}>{p.full_name||p.id}</option>)}</select><small className="hint">Hold Ctrl (Windows) or Cmd (Mac) to select multiple people.</small></Field><div className="modal-actions"><button type="button" className="button" onClick={()=>setModal(null)}>Cancel</button><button disabled={saving} className="button primary">{saving?'Creating…':'Create team'}</button></div></form></Modal>}
    <footer className="footer">Prompt Wars · shared event workspace <span>·</span> 4 rounds <span>·</span> {MAX_TOTAL} possible points</footer>
  </div>;
}

function SetupScreen(){return <div className="center-screen"><div className="auth-card setup-card"><span className="logo large">PW</span><p className="eyebrow">AI SURVIVAL ARENA</p><h1>Connect your event workspace</h1><p>This React app is ready for Supabase. Create a project, run the SQL setup, then add your project URL and publishable key to <code>.env</code>.</p><ol><li>Create a Supabase project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com/dashboard</a>.</li><li>Open the SQL Editor and run <code>supabase/schema.sql</code> from this project.</li><li>Copy <code>.env.example</code> to <code>.env</code> and fill in the Project URL and publishable key.</li><li>Restart <code>npm run dev</code>.</li></ol><div className="alert info">Never put a Supabase service-role secret in a browser app.</div></div></div>}
function AuthScreen(p){return <div className="center-screen auth-bg"><div className="auth-card"><span className="logo large">PW</span><p className="eyebrow">ACM AIML DOMAIN · EVENT WORKSPACE</p><h1>{p.authMode==='signin'?'Welcome back':'Join Prompt Wars'}</h1><p className="muted">{p.authMode==='signin'?'Sign in to access your team’s event workspace.':'Create your participant account. The host will assign your team.'}</p>{p.error&&<div className="alert error">{p.error}</div>}{p.notice&&<div className="alert success">{p.notice}</div>}<form onSubmit={p.submitAuth}>{p.authMode==='signup'&&<Field label="Full name"><input required value={p.fullName} onChange={e=>p.setFullName(e.target.value)} autoComplete="name" maxLength="100"/></Field>}<Field label="Email"><input type="email" required autoComplete="email" value={p.email} onChange={e=>p.setEmail(e.target.value)}/></Field><Field label="Password"><input type="password" required minLength="8" autoComplete={p.authMode==='signin'?'current-password':'new-password'} value={p.password} onChange={e=>p.setPassword(e.target.value)}/></Field><button disabled={p.saving} className="button primary full">{p.saving?'Please wait…':p.authMode==='signin'?'Sign in':'Create account'}</button></form><p className="auth-switch">{p.authMode==='signin'?'New to Prompt Wars?':'Already registered?'} <button onClick={()=>{p.setAuthMode(p.authMode==='signin'?'signup':'signin');}}>{p.authMode==='signin'?'Create account':'Sign in'}</button></p><p className="security-note"><ShieldCheck size={14}/> Roles are assigned by the event host, not selected during signup.</p></div></div>}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Modal({title,close,children}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={close}><X size={18}/></button></div>{children}</section></div>}
function PageHead({eyebrow,title,desc,actions}){return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{desc}</p></div>{actions&&<div className="head-actions">{actions}</div>}</div>}
function Stat({label,value,foot,icon:Icon}){return <div className="stat"><div className="stat-top"><span>{label}</span><Icon size={18}/></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>}
function Overview(p){const pending=p.submissions.filter(s=>!p.scoredSubmission(s)&&(p.isAdmin||p.teams.some(t=>t.id===s.team_id))).length;return <><PageHead eyebrow="EVENT DASHBOARD" title={`Welcome${p.profile?.full_name?', '+p.profile.full_name.split(' ')[0]:''}`} desc="Track the four challenges, team submissions and cumulative standings." actions={<button className="button primary" onClick={p.openSubmission}><FilePlus2 size={16}/> New submission</button>}/><div className="stats"><Stat label="Teams" value={p.teams.length} foot="Created by event host" icon={Users}/><Stat label="Submissions" value={p.submissions.filter(s=>p.isAdmin||p.teams.some(t=>t.id===s.team_id)).length} foot={`${pending} awaiting review`} icon={ClipboardList}/><Stat label="Points possible" value={MAX_TOTAL} foot="Across four rounds" icon={Medal}/><Stat label="Leaderboard" value={p.board[0]?.score??0} foot={p.board[0]?.name?`${p.board[0].name} currently leads`:'No scored submissions yet'} icon={Trophy}/></div><div className="content-grid"><section className="panel"><div className="panel-title"><div><h2>Round control</h2><p className="muted">Cumulative points · no eliminations</p></div><button className="text-button" onClick={()=>p.setPage('rounds')}>View rubrics <ArrowUpRight size={15}/></button></div><div className="round-list">{ROUNDS.map(r=><div className="round-row" key={r.id}><span className="round-number">{String(r.id).padStart(2,'0')}</span><div><b>{r.name}</b><p className="muted">{r.short} · {r.minutes} min</p></div><strong>{r.max} pts</strong></div>)}</div></section><section className="panel"><div className="panel-title"><div><h2>Recent activity</h2><p className="muted">Latest visible submissions</p></div></div>{p.submissions.filter(s=>p.isAdmin||p.teams.some(t=>t.id===s.team_id)).slice(0,5).map(s=><div className="activity-row" key={s.id}><span className="activity-icon"><Activity size={16}/></span><div><b>{s.title}</b><p className="muted">{p.teams.find(t=>t.id===s.team_id)?.name} · {roundFor(s.round_id)?.name}</p></div><span className={`status ${p.scoredSubmission(s)?'scored':''}`}>{p.scoredSubmission(s)?`${p.totalForSubmission(s.id)} pts`:'Submitted'}</span></div>)}{!p.submissions.length&&<Empty text="No submissions yet. Your first submission will appear here."/>}</section></div><section className="panel"><div className="panel-title"><div><h2>Leaderboard preview</h2><p className="muted">Only fully scored rounds count toward the total.</p></div><button className="text-button" onClick={()=>p.setPage('leaderboard')}>Full leaderboard <ArrowUpRight size={15}/></button></div><BoardTable board={p.board.slice(0,5)} /></section></>}
function Submissions(p){return <><PageHead eyebrow="WORKSPACE / SUBMISSIONS" title="Submissions" desc={p.isAdmin?'Review entries and score them against the official rubric.':'Submit your team’s work and track its review status.'} actions={<><button className="button" onClick={p.exportSubmissions}><Download size={16}/> Export CSV</button><button className="button primary" onClick={p.openSubmission}><FilePlus2 size={16}/> New submission</button></>}/><section className="panel"><div className="filters"><input placeholder="Search team or submission…" value={p.search} onChange={e=>p.setSearch(e.target.value)}/><select value={p.roundFilter} onChange={e=>p.setRoundFilter(e.target.value)}><option value="all">All rounds</option>{ROUNDS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><select value={p.statusFilter} onChange={e=>p.setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="Submitted">Submitted</option><option value="Scored">Scored</option></select></div><div className="table-wrap"><table><thead><tr><th>Submission</th><th>Team</th><th>Round</th><th>Status</th><th>Score</th><th>Action</th></tr></thead><tbody>{p.visibleSubmissions.map(s=><tr key={s.id}><td><b>{s.title}</b><small>{fmtDate(s.created_at)}</small></td><td>{p.teams.find(t=>t.id===s.team_id)?.name||'Team'}</td><td>{roundFor(s.round_id)?.name}</td><td><span className={`status ${p.scoredSubmission(s)?'scored':''}`}>{p.scoredSubmission(s)?'Scored':'Submitted'}</span></td><td><b>{p.scoredSubmission(s)?`${p.totalForSubmission(s.id)} / ${roundFor(s.round_id)?.max}`:'—'}</b></td><td>{p.isAdmin?<button className="button small" onClick={()=>p.openScore(s)}>{p.scoredSubmission(s)?'Edit score':'Review & score'}</button>:<span className="muted">View only</span>}</td></tr>)}{!p.visibleSubmissions.length&&<tr><td colSpan="6"><Empty text="No submissions match these filters."/></td></tr>}</tbody></table></div></section></>}
function BoardTable({board}){return <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>Progress</th><th>Scored submissions</th></tr></thead><tbody>{board.map((t,i)=><tr key={t.id}><td>{i===0?'🏆':String(i+1).padStart(2,'0')}</td><td><b>{t.name}</b></td><td><b>{t.score} / {MAX_TOTAL}</b></td><td><div className="progress"><span style={{width:`${Math.min(100,t.score/MAX_TOTAL*100)}%`}}/></div></td><td>{t.scored}/4</td></tr>)}</tbody></table></div>}
function Leaderboard(p){return <><PageHead eyebrow="LIVE STANDINGS" title="Leaderboard" desc="Shared cumulative standings based on fully scored submissions." actions={<button className="button" onClick={p.exportBoard}><Download size={16}/> Export CSV</button>}/><div className="stats"><Stat label="Current leader" value={p.board[0]?.score??0} foot={p.board[0]?.name||'No scores yet'} icon={Trophy}/><Stat label="Teams" value={p.teams.length} foot="Registered teams" icon={Users}/><Stat label="Maximum points" value={MAX_TOTAL} foot="25 + 30 + 35 + 40" icon={Medal}/><Stat label="Pending reviews" value={p.teams.reduce((n,t)=>n,0)+0} foot="Scores update live" icon={Activity}/></div><section className="panel"><div className="panel-title"><div><h2>Overall ranking</h2><p className="muted">Ties are shown with equal totals; host can apply the published event tie-break.</p></div><span className="status scored">Live</span></div><BoardTable board={p.board}/></section><section className="panel"><div className="panel-title"><div><h2>Round-by-round points</h2><p className="muted">Breakdown of scores per team.</p></div></div><div className="table-wrap"><table><thead><tr><th>Team</th>{ROUNDS.map(r=><th key={r.id}>R{r.id} / {r.max}</th>)}</tr></thead><tbody>{p.board.map(t=><tr key={t.id}><td><b>{t.name}</b></td>{ROUNDS.map(r=><td key={r.id}>{p.roundScore(t.id,r.id)}</td>)}</tr>)}</tbody></table></div></section></>}
function TeamsPage(p){return <><PageHead eyebrow="WORKSPACE / TEAMS" title="Teams" desc="Create teams and assign registered student accounts." actions={<button className="button primary" onClick={p.openCreate}><Users size={16}/> Create team</button>}/><div className="alert info">Recommended setup: 10 teams of 5. A student can belong to one team at a time; membership is checked by database policies.</div><div className="team-grid">{p.teams.map(t=><article className="team-card" key={t.id}><div className="team-card-head"><span className="tag">TEAM {String(t.id).padStart(2,'0')}</span><b>{t.name}</b></div><p className="muted">{p.submissions.filter(s=>s.team_id===t.id).length} submissions</p><div className="member-list">{p.memberships.filter(m=>m.team_id===t.id).map(m=><div key={m.user_id}><span>{m.profiles?.full_name||m.user_id}</span><button className="text-button danger" onClick={()=>p.removeMember(t.id,m.user_id)} title="Remove member"><X size={14}/></button></div>)}</div><Field label="Assign a student"><select defaultValue="" disabled={p.loading} onChange={e=>p.assignMember(e,t.id)}><option value="">Choose registered student…</option>{p.profiles.filter(u=>u.role==='student'&&!p.memberships.some(m=>m.user_id===u.id)).map(u=><option key={u.id} value={u.id}>{u.full_name||u.id}</option>)}</select></Field></article>)}{!p.teams.length&&<Empty text="No teams yet. Create the first team to start assigning participants."/ >}</div></>}
function RoundsPage(){return <><PageHead eyebrow="EVENT DESIGN / SCORING" title="Rounds & scoring" desc="Official challenge descriptions, deliverables and judge rubrics."/><div className="alert info"><b>Event timing:</b> 12 + 13 + 18 + 18 = 61 challenge minutes. Use the remaining time for briefing, transitions, submissions, judging and wrap-up within the 90-minute event.</div><div className="round-cards">{ROUNDS.map(r=><article className="round-card" key={r.id}><div className="round-card-top"><span className="tag">ROUND {r.id}</span><span className="tag">{r.minutes} min</span></div><h3>{r.name}</h3><p>{r.desc}</p><div className="rubric-label">SUBMISSION</div><p>{r.deliverable}</p><div className="rubric-label">JUDGING RUBRIC</div>{r.criteria.map(c=><div className="criterion" key={c.name}><span>{c.name}</span><b>{c.max} pts</b></div>)}<div className="round-total"><span>Maximum score</span><b>{r.max} points</b></div></article>)}</div></>}
function Empty({text}){return <div className="empty"><ClipboardList size={24}/><p>{text}</p></div>}
