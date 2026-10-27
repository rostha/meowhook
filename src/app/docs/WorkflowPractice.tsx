'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Message } from '@/lib/types';
import styles from './docs.module.css';

// Deliberately local: these controls never use the draft store, share API, or Discord API.
export default function WorkflowPractice({id,message,onChange,onStatus}:{id:string;message:Message;onChange:(change:Partial<Message>)=>void;onStatus:(status:string)=>void}) {
  const [name,setName]=useState('Community night');
  const [backup,setBackup]=useState<{name:string;message:Message}|null>(null);
  const [duration,setDuration]=useState(7);
  const [channel,setChannel]=useState('community');
  const [connected,setConnected]=useState(false);
  const [results,setResults]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const uiMotion=useUiMotion();
  const reduced=uiMotion.reduced;
  useEffect(()=>()=>clearTimeout(timer.current),[]);

  if(id==='drafts') return <div className={styles.workflow}>
    <label className={styles.control}>Example draft name<input value={name} onChange={event=>setName(event.target.value)}/></label>
    <div className={styles.buttonRow}>
      <button type="button" onClick={()=>{setBackup({name,message:structuredClone(message)});onStatus(`Backup saved: ${name||'Untitled draft'}. Change the text, then restore it.`);}}>Save a backup</button>
      <button type="button" disabled={!backup} onClick={()=>{if(backup){setName(backup.name);onChange(backup.message);onStatus('The example has been restored to its saved version.');}}}>Restore a backup</button>
    </div><p className={styles.small}>This example backs up one practice message. In the builder, a backup holds your draft collection.</p>
  </div>;
  if(id==='sharing') return <div className={styles.workflow}>
    <fieldset className={styles.duration}><legend>Link duration</legend><div>{[1,3,7,14,30].map(days=><button type="button" key={days} aria-pressed={duration===days} onClick={()=>setDuration(days)}>{days} {days===1?'day':'days'}</button>)}</div></fieldset>
    <div className={styles.buttonRow}><button type="button" onClick={()=>onStatus(`Example share created for ${duration} ${duration===1?'day':'days'}. The recipient gets a copy without your webhook URL or local files.`)}>Generate example link</button></div>
    <p className={styles.small}>No public link is created here. In the builder, the next step is Copy link.</p>
  </div>;
  if(id==='webhooks'||id==='first-message') return <div className={styles.workflow}>
    <fieldset className={styles.duration}><legend>Example destination</legend><div>{['community','updates'].map(value=><button type="button" key={value} aria-pressed={channel===value} onClick={()=>{setChannel(value);setConnected(false);}}># {value}</button>)}</div></fieldset>
    <div className={styles.buttonRow}><button type="button" onClick={()=>{setConnected(true);onStatus(`Example connection ready: #${channel}. In the builder, paste your webhook URL to connect.`);}}>Connect example channel</button>{id==='webhooks'?<button type="button" disabled={!connected} onClick={()=>onStatus(`Example destination #${channel} saved. Use the bookmark beside Webhook URL in the builder.`)}>Save destination</button>:<button type="button" disabled={!connected||!message.content.trim()} onClick={()=>onStatus(`Example message sent to #${channel}. Nothing was posted to Discord.`)}>Simulate send</button>}</div>
    <p className={styles.small}>These are pretend channels. No real webhook is needed here.</p>
  </div>;
  if(id==='sending') {
    const send=(retry:boolean)=>{
      setBusy(true);setResults(retry?['Sent · Announcement','Sending · Follow-up']:['Sending · Announcement','Waiting · Follow-up']);
      onStatus(retry?'Retrying only the unsent follow-up…':'Sending the example sequence…');
      timer.current=setTimeout(()=>{setBusy(false);setResults(['Sent · Announcement',retry?'Sent · Follow-up':'Failed · Follow-up']);onStatus(retry?'Both example messages are sent. The first was not sent twice.':'One example failed. Try Retry unsent to finish the sequence.');},800);
    };
    return <div className={styles.workflow}><div className={styles.buttonRow}><button type="button" disabled={busy} onClick={()=>send(false)}>Simulate sending 2 messages</button><button type="button" disabled={busy||!results.some(result=>result.startsWith('Failed'))} onClick={()=>send(true)}>Retry unsent</button></div><div className={styles.sendResults} aria-live="polite">{results.map((result,index)=><motion.div key={result} initial={{opacity:0,y:reduced?0:4}} animate={{opacity:1,y:0}} transition={uiMotion.feedback}><span>{index+1}</span>{result}</motion.div>)}</div><p className={styles.small}>The second message fails on purpose so you can try retrying it.</p></div>;
  }
  if(id==='editing') return <div className={styles.workflow}><div className={styles.buttonRow}><button type="button" onClick={()=>{setLoaded(true);onChange({content:'We’re meeting at 7 PM this Friday.'});onStatus('Example loaded. Change the time in the text above, then choose Update.');}}>Load example message</button><button type="button" disabled={!loaded} onClick={()=>onStatus(`Original example updated to: “${message.content}”`)}>Update example</button></div><p className={styles.small}>In the builder, Load uses a message ID or link and the original webhook.</p></div>;
  return null;
}
