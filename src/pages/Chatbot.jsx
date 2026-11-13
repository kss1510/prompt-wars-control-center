import React, { useEffect, useRef, useState } from 'react';
import { isRoundAccepting } from '../lib/rules';
import { PageHead, Empty, Field } from '../components/ui';
import { Bot, Send, ShieldCheck } from 'lucide-react';

/**
 * Round 2: the fictional chatbot lives inside the portal. Teams test its rules here; every message
 * is stored on the server as evidence (the AI judge reads the real transcript). Staff can preview
 * the bot without saving and read every team's transcript.
 */
export function ChatbotPage({ctx}){
  const {d,api,isStaff,myTeamId}=ctx;
  const cfg=d.chatConfig;
  const live=ctx.roundRow(2);
  const open=isRoundAccepting(live);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [preview,setPreview]=useState([]);
  const [teamId,setTeamId]=useState('');
  const endRef=useRef(null);
  const messages=isStaff?(teamId?d.chatMessages.filter(m=>m.team_id===Number(teamId)):preview):d.chatMessages.filter(m=>m.team_id===myTeamId);
  const used=d.chatMessages.filter(m=>m.team_id===myTeamId&&m.role==='user').length;
  const remaining=cfg?Math.max(0,cfg.max_messages_per_team-used):0;
  useEffect(()=>{endRef.current?.scrollIntoView?.({block:'nearest'});},[messages.length]);

  async function send(e){
    e.preventDefault();
    const message=text.trim();
    if(!message||busy) return;
    setBusy(true);setError('');
    try {
      const r=await api.guardrailChat(message);
      if(r.preview) setPreview(p=>[...p,{id:`p${p.length}`,role:'user',content:message},{id:`p${p.length+1}`,role:'bot',content:r.reply}]);
      setText('');
      await ctx.reload();
    } catch(err){ setError(err.message); }
    finally { setBusy(false); }
  }

  if(!d.settings.ai_chatbot) return <><PageHead eyebrow="ROUND 2 · GUARDRAIL CHALLENGE" title="Round 2 chatbot"/><section className="panel"><Empty text="The in-app chatbot is switched off by the host."/></section></>;
  if(!cfg) return <><PageHead eyebrow="ROUND 2 · GUARDRAIL CHALLENGE" title="Round 2 chatbot"/><section className="panel"><Empty text="The chatbot and its rules unlock when the host opens Round 2."/></section></>;
  const canSend=isStaff?!teamId:(open&&Boolean(myTeamId)&&remaining>0);
  return <><PageHead eyebrow="ROUND 2 · GUARDRAIL CHALLENGE" title={`Chat with ${cfg.bot_name}`} desc="A fictional chatbot with rules. Design harmless tests, see whether it follows its rules, then submit your analysis."/>
    <div className="content-grid chat-layout">
      <section className="panel"><div className="panel-title"><div><h2><ShieldCheck size={16}/> {cfg.bot_name}’s rules</h2><p className="muted">{cfg.persona}</p></div></div>
        <pre className="rules">{cfg.rules}</pre>
        <p className="hint">Keep every test harmless and about this fictional campus. Your conversation is saved and the AI judge reads it.</p>
        {isStaff&&<Field label="Read a team’s conversation"><select value={teamId} onChange={e=>setTeamId(e.target.value)}><option value="">Preview the bot myself (not saved)</option>{d.teams.map(t=><option key={t.id} value={t.id}>{t.name} ({d.chatMessages.filter(m=>m.team_id===t.id&&m.role==='user').length} messages)</option>)}</select></Field>}
      </section>
      <section className="panel chat-panel" aria-label="Chat">
        <div className="chat-log" role="log">
          {messages.map(m=><div key={m.id} className={`bubble ${m.role}`}>{m.role==='bot'&&<Bot size={14}/>}<span>{m.content}</span></div>)}
          {!messages.length&&<Empty text={isStaff&&!teamId?'Send a message to preview the bot. Previews are not saved.':'No messages yet — say hello and start testing.'}/>}
          <div ref={endRef}/>
        </div>
        {error&&<div className="alert error" role="alert">{error}</div>}
        {!isStaff&&!open&&<p className="hint warn-text">The chat is available only while Round 2 is open.</p>}
        {canSend&&<form className="chat-input" onSubmit={send}>
          <input aria-label="Message to the chatbot" maxLength="1000" value={text} onChange={e=>setText(e.target.value)} placeholder={`Message ${cfg.bot_name}…`} disabled={busy}/>
          <button className="button primary" disabled={busy||!text.trim()}><Send size={15}/> {busy?'Sending…':'Send'}</button>
        </form>}
        {!isStaff&&myTeamId&&<small className="hint">{remaining} of {cfg.max_messages_per_team} messages left for your team.</small>}
      </section>
    </div></>;
}
