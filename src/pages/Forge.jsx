import React, { useEffect, useState } from 'react';
import { PageHead } from '../components/ui';
import { ArtifactWorkbench } from '../components/ArtifactWorkbench';
import { MonitorSmartphone } from 'lucide-react';

export const FORGE_DRAFT_KEY = 'pw-forge-draft';
export function readForgeDraft(){ try { return localStorage.getItem(FORGE_DRAFT_KEY)||''; } catch { return ''; } }

/** Round 3 workspace: check and preview the team's HTML while building it. Drafts stay in this browser. */
export function ForgePage({ctx}){
  const [html,setHtml]=useState(readForgeDraft);
  useEffect(()=>{ try { localStorage.setItem(FORGE_DRAFT_KEY,html); } catch { /* private window */ } },[html]);
  return <><PageHead eyebrow="ROUND 3 · ARTIFACT FORGE" title="HTML checker & preview" desc="Paste or load your single-file app. The checker explains errors in plain language and runs your app in a safe preview."/>
    <div className="alert info"><MonitorSmartphone size={16}/><span>This is a <b>checker, not an AI</b>: it reads your code and points out problems, but never writes code for you, so it does not count as an AI platform. Your draft stays in this browser until you submit it with your Round 3 entry.</span></div>
    <section className="panel"><ArtifactWorkbench value={html} onChange={setHtml} label="Your HTML file"/>
      {!ctx.isStaff&&ctx.myTeamId&&<p className="hint">When you submit Round 3, this draft is offered in the submission form.</p>}</section></>;
}
