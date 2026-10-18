import React, { useMemo, useState } from 'react';
import { checkArtifact, previewDocument, MAX_ARTIFACT_CHARS } from '../lib/artifactCheck';
import { AlertTriangle, CheckCircle2, CircleAlert, Info, Play, Upload } from 'lucide-react';

const ICON = { error: CircleAlert, warning: AlertTriangle, info: Info };

/**
 * Round 3 helper: paste or load a single-file HTML app, get plain-language checks, and run it in a
 * locked-down preview. The iframe gets scripts but NOT same-origin access, so the app cannot read
 * the portal's sign-in session or call the database as the viewer.
 */
export function ArtifactWorkbench({value,onChange,readOnly,label='HTML file'}){
  const [checked,setChecked]=useState(readOnly?value:null);
  const [preview,setPreview]=useState(false);
  const [frameKey,setFrameKey]=useState(0);
  const result=useMemo(()=>checked===null?null:checkArtifact(checked),[checked]);
  function load(e){
    const file=e.target.files?.[0]; e.target.value='';
    if(!file) return;
    if(file.size>MAX_ARTIFACT_CHARS*2){ setChecked(''); onChange?.(''); window.alert('That file is too large for the portal. Keep it under 300,000 characters.'); return; }
    const reader=new FileReader();
    reader.onload=()=>{onChange(String(reader.result));setChecked(String(reader.result));};
    reader.readAsText(file);
  }
  function run(){setChecked(value||'');setPreview(true);setFrameKey(k=>k+1);}
  return <div className="workbench">
    {!readOnly&&<div className="workbench-bar">
      <label className="button small file-button"><Upload size={14}/> Load .html file<input type="file" accept=".html,.htm,text/html" onChange={load} aria-label="Load HTML file"/></label>
      <button type="button" className="button small primary" onClick={run} disabled={!value?.trim()}><Play size={14}/> Check &amp; preview</button>
      <small className="muted">{(value||'').length.toLocaleString()} / {MAX_ARTIFACT_CHARS.toLocaleString()} characters</small>
    </div>}
    {!readOnly&&<label className="field"><span>{label}</span><textarea className="code" spellCheck="false" value={value||''} onChange={e=>onChange(e.target.value)} placeholder={'<!DOCTYPE html>\n<html>\n  …paste your single-file app here…\n</html>'}/></label>}
    {result&&<div className={`checker ${result.ok?'ok':'bad'}`} role="status" aria-label="Checker result">
      <div className="checker-head">{result.ok?<CheckCircle2 size={16}/>:<CircleAlert size={16}/>}<b>Checker:</b> {result.summary}</div>
      {result.issues.length>0&&<ul>{result.issues.map((i,n)=>{const Icon=ICON[i.level];return <li key={n} className={i.level}><Icon size={14}/><span>{i.line?<b>Line {i.line}: </b>:null}{i.message}</span></li>;})}</ul>}
    </div>}
    {readOnly&&!preview&&<button type="button" className="button small" onClick={()=>{setPreview(true);setFrameKey(k=>k+1);}}><Play size={14}/> Run app preview</button>}
    {preview&&(readOnly?value:checked)&&<div className="preview-wrap">
      <div className="preview-bar"><span>Live preview (sandboxed{readOnly?'':' — saved data resets on reload'})</span><button type="button" className="text-button" onClick={()=>setFrameKey(k=>k+1)}>Reload</button></div>
      <iframe key={frameKey} title="App preview" className="preview-frame" sandbox="allow-scripts allow-forms allow-modals" referrerPolicy="no-referrer" srcDoc={previewDocument(readOnly?value:checked)}/>
    </div>}
  </div>;
}
