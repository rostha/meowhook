'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Message, Embed } from '@/lib/types';
import { buildPayload, getSendBlockingReason } from '@/lib/payload';
import { getEmbedBlobPreviewUrls, setEmbedAttachmentUrl } from '@/lib/embedTransfers';
import { createDefaultEmbed, parseImportedDraftData } from '@/lib/utils';
import { parseDiscordMarkdownForPreview } from '@/lib/markdown';
import { componentMediaUrls } from '@/lib/componentAttachments';
import { isComponentsV2, regularMessageToV2Blocks } from '@/lib/messageComponents';
import EmbedEditor from '@/components/EmbedEditor';
import TextFieldWithQuickActions from '@/components/TextFieldWithQuickActions';
import MessageComponentsEditor from '@/components/editor/MessageComponentsEditor';
import { ComponentsPreview, LinkButtonsPreview } from '@/components/editor/ComponentsPreview';
import { IconChevronRight, IconChevronLeft, IconRotateCCW, IconCheck, IconImage, IconPaperclip } from '@/components/MeowIcons';
import { makeExample } from './examples';
import WorkflowPractice from './WorkflowPractice';
import { AnimatedEditorList, AnimatedEditorRow } from '@/components/AnimatedEditorList';
import styles from './docs.module.css';

const Markdown = ({text}:{text:string}) => <div className={styles.markdown} dangerouslySetInnerHTML={{__html:parseDiscordMarkdownForPreview(text)}} />;

export default function Playground({guideId}:{guideId:string}) {
  const examples = useMemo(() => makeExample(guideId, window.location.origin),[guideId]);
  const [step,setStep] = useState(0);
  const [message,setMessage] = useState<Message>(examples[0].message);
  const [playing,setPlaying] = useState(false);
  const [visible,setVisible] = useState(true);
  const [json,setJson] = useState(() => JSON.stringify(buildPayload(examples[0].message),null,2));
  const [jsonError,setJsonError] = useState('');
  const [status,setStatus] = useState('');
  const [resetKey,setResetKey] = useState(0);
  const [files,setFiles] = useState<{name:string;url:string;image:boolean}[]>([]);
  const [zoom,setZoom] = useState(100);
  const host = useRef<HTMLElement>(null);
  const filesRef = useRef(files); filesRef.current=files;
  const embedUploads = useRef(new Set<string>());
  const uiMotion = useUiMotion();
  const reduced = uiMotion.reduced;
  const v2 = isComponentsV2(message);
  const isV2Guide = guideId.startsWith('v2');
  const embedGuide = ['embeds','fields','images','templates','troubleshooting'].includes(guideId);
  const feedback = guideId==='troubleshooting'
    ? getSendBlockingReason([message],[files.length+new Set([...message.embeds.flatMap(getEmbedBlobPreviewUrls),...componentMediaUrls(message.componentBlocks??[])]).size]) ?? 'Content is complete. In the builder, check the webhook before sending.'
    : status||examples[step].status;
  const update = (change:Partial<Message>) => {change._attachments?.forEach(attachment=>{if(attachment.previewUrl.startsWith('blob:'))embedUploads.current.add(attachment.previewUrl);});setPlaying(false);setMessage(current=>({...current,...change}));};
  const select = (next:number) => {
    setStep(next); setMessage(structuredClone(examples[next].message));
    setJson(JSON.stringify(buildPayload(examples[next].message),null,2)); setJsonError('');setStatus('');
  };

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting),{threshold:.1});
    if(host.current) observer.observe(host.current);
    const pause = () => {if(document.hidden)setPlaying(false);};
    document.addEventListener('visibilitychange',pause);
    return () => {observer.disconnect();document.removeEventListener('visibilitychange',pause);};
  },[]);
  useEffect(() => {
    if(!playing||!visible)return;
    const timer=setTimeout(()=>{if(step>=examples.length-1){setPlaying(false);return;}select(step+1);},3200);
    return()=>clearTimeout(timer);
  },[playing,visible,step,examples]);
  useEffect(()=>()=>{filesRef.current.forEach(file=>URL.revokeObjectURL(file.url));},[]);
  useEffect(()=>{
    const inUse=new Set([...message.embeds.flatMap(getEmbedBlobPreviewUrls),...componentMediaUrls(message.componentBlocks??[])]);
    for(const url of embedUploads.current)if(!inUse.has(url)){URL.revokeObjectURL(url);embedUploads.current.delete(url);}
  },[message.embeds,message.componentBlocks]);
  useEffect(()=>{
    const owned=embedUploads.current;
    return()=>{owned.forEach(url=>URL.revokeObjectURL(url));owned.clear();};
  },[]);

  return <section ref={host} className={styles.lab} aria-label="Interactive example">
    <div className={styles.labHeader}><div><h2>Try it as you learn</h2><p>Practice only. Your drafts stay untouched. Nothing is sent.</p></div><button type="button" className={styles.watch} onClick={()=>{if(!playing&&step===examples.length-1)select(0);setPlaying(!playing);}} aria-pressed={playing}>{playing?'Pause walkthrough':'Watch walkthrough'}<IconChevronRight size={15}/></button></div>
    <div className={styles.walkthrough}>
      <div className={styles.stepTabs} aria-label="Walkthrough steps">{examples.map((example,i)=><button key={example.label} type="button" onClick={()=>{setPlaying(false);select(i);}} aria-current={step===i?'step':undefined}><span>{i+1}</span>{example.label}</button>)}</div>
      <p className={styles.caption} aria-live="polite">{examples[step].caption}</p>
    </div>
    <div className={styles.walkthroughTrack} aria-hidden="true"><motion.div initial={false} animate={{scaleX:(step+1)/examples.length}} transition={uiMotion.transition}/></div>
    <div className={styles.practiceGrid}>
      <div className={styles.practiceEditor} onInputCapture={()=>setPlaying(false)}>
        <div className={styles.paneLabel}>Try the controls <span>Editable example</span></div>
        <div className={styles.editorControls}>
          {guideId==='json' ? <>
            <label className={styles.control}>Message JSON<textarea className={styles.code} aria-label="Example JSON" spellCheck={false} rows={12} value={json} onChange={e=>{setPlaying(false);setJson(e.target.value);}} /></label>
            <div className={styles.buttonRow}><button type="button" onClick={()=>{try{setJson(JSON.stringify(JSON.parse(json),null,2));setJsonError('');}catch{setJsonError('Check the commas, brackets, and quotes in your JSON.');}}}>Format JSON</button><button type="button" onClick={()=>{try{const tabs=parseImportedDraftData(JSON.parse(json));if(!tabs[0]?.messages[0])throw Error();setMessage(tabs[0].messages[0]);setJsonError('');}catch{setJsonError('This example needs valid message JSON. Try replaying a step to start again.');}}}>Apply to example</button></div>
            {jsonError&&<p className={styles.error} role="alert">{jsonError}</p>}<p className={styles.small}>This practice area previews the first message.</p>
          </> : <>
            {isV2Guide && <label className={styles.switch}><span>Advanced V2 components</span><input type="checkbox" checked={v2} onChange={e=>update({componentMode:e.target.checked?'v2':'standard',flags:e.target.checked?32768:0,componentBlocks:message.componentBlocks?.length?message.componentBlocks:regularMessageToV2Blocks(message)})}/></label>}
            {v2 ? <MessageComponentsEditor message={message} onChange={update}/> : <>
              <label className={styles.control}>Message text<TextFieldWithQuickActions multiline rows={4} aria-label="Example message text" value={message.content} onChange={content=>update({content})} expandedEditorTitle="Practice message" maxLength={2000}/></label>
              <WorkflowPractice key={`${step}-${resetKey}`} id={guideId} message={message} onChange={update} onStatus={value=>{setPlaying(false);setStatus(value);}}/>
              {guideId==='profile'&&<><label className={styles.control}>Display name<input value={message.username} placeholder="Use the webhook name" onChange={e=>update({username:e.target.value})}/></label><label className={styles.control}>Avatar URL<input value={message.avatar_url} onChange={e=>update({avatar_url:e.target.value})}/></label></>}
              {embedGuide&&<>
                {guideId==='images'&&<button type="button" onClick={()=>{const embed=message.embeds[0]??createDefaultEmbed();update({embeds:[{...embed,image:{url:`${window.location.origin}/docs/community-night.svg`}}]});}}><IconImage size={15}/> Use sample main image</button>}
                <AnimatedEditorList gap={10}>{message.embeds.map((embed,index)=><AnimatedEditorRow key={embed.id}><EmbedEditor embed={embed} index={index} isFocused={guideId==='fields'||guideId==='troubleshooting'} focusedSection="fields" focusRequestId={`demo-${step}`} onChange={next=>update({embeds:message.embeds.map((item,i)=>i===index?next:item)})} onFileUpload={(field,url)=>{embedUploads.current.add(url);update({embeds:message.embeds.map((item,i)=>i===index?setEmbedAttachmentUrl(item,field,url):item)});}} onRemove={()=>update({embeds:message.embeds.filter((_,i)=>i!==index)})} onDuplicate={()=>{if(message.embeds.length<10)update({embeds:[...message.embeds,{...embed,id:crypto.randomUUID()}]});}} /></AnimatedEditorRow>)}</AnimatedEditorList>
                {message.embeds.length<10&&<button type="button" onClick={()=>update({embeds:[...message.embeds,createDefaultEmbed()]})}>+ Add embed</button>}
              </>}
              {guideId==='images'&&<div className={styles.filePractice}><label>Try a local file<input type="file" multiple aria-label="Try a local file" onChange={e=>{files.forEach(file=>URL.revokeObjectURL(file.url));setFiles(Array.from(e.target.files??[]).slice(0,10).map(file=>({name:file.name,url:URL.createObjectURL(file),image:file.type.startsWith('image/')})));}}/></label><p>Previewed here only; never uploaded or saved.</p>{files.length>0&&<button type="button" onClick={()=>{files.forEach(file=>URL.revokeObjectURL(file.url));setFiles([]);}}>Remove example files</button>}</div>}
              {guideId==='links'&&<MessageComponentsEditor message={message} onChange={update}/>}
              {guideId==='advanced'&&<><label className={styles.switch}>Suppress Embeds<input type="checkbox" checked={!!(message.flags&4)} onChange={e=>update({flags:e.target.checked?message.flags|4:message.flags&~4})}/></label><label className={styles.switch}>Silent<input type="checkbox" checked={!!(message.flags&4096)} onChange={e=>update({flags:e.target.checked?message.flags|4096:message.flags&~4096})}/></label></>}
              {guideId==='workspace'&&<label className={styles.control}>Preview size: {zoom}%<input type="range" min={80} max={120} step={10} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>}
            </>}
          </>}
        </div>
      </div>
      <div className={styles.practicePreview}>
        <div className={styles.paneLabel}>Discord preview <span>Approximate appearance</span></div>
        <div className={styles.previewStage} style={{fontSize:`${14*zoom/100}px`}}>
          <div className={styles.messageProfile}>{message.avatar_url&&/^https?:\/\//.test(message.avatar_url)?<img src={message.avatar_url} alt="Example avatar"/>:<span className={styles.avatar}>M</span>}<strong>{message.username||'Webhook name'}</strong><span className={styles.appBadge}>APP</span><span className={styles.sampleLabel}>Example</span></div>
          <AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{opacity:0,y:reduced?0:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={uiMotion.feedback} className={styles.messageBody}>
            {v2?<ComponentsPreview blocks={message.componentBlocks??[]} attachments={message._attachments}/>:<>
              {message.content?<Markdown text={message.content}/>:<p className={styles.small}>Your text will appear here.</p>}
              {!(message.flags&4)&&message.embeds.map(embed=><ExampleEmbed key={embed.id} embed={embed}/>)}
              <LinkButtonsPreview buttons={message.linkButtons??[]}/>
              {files.map(file=><div key={file.url} className={styles.filePreview}>{file.image?<img src={file.url} alt={file.name}/>:<IconPaperclip size={18}/>}<span>{file.name}</span></div>)}
              {!!(message.flags&4096)&&<p className={styles.small}>Silent · notification pings suppressed</p>}
            </>}
          </motion.div></AnimatePresence>
          {feedback&&<div className={styles.exampleStatus} role="status">{guideId!=='troubleshooting'&&<IconCheck size={15}/>}{feedback}<small>{guideId==='troubleshooting'?'Live example check':'Simulated result'}</small></div>}
        </div>
      </div>
    </div>
    <div className={styles.labFooter}><button type="button" onClick={()=>{setPlaying(false);select(0);setResetKey(value=>value+1);setZoom(100);files.forEach(file=>URL.revokeObjectURL(file.url));setFiles([]);}}><IconRotateCCW size={14}/> Reset example</button><div><button type="button" aria-label="Previous example step" disabled={step===0} onClick={()=>{setPlaying(false);select(step-1);}}><IconChevronLeft size={16}/></button><span>{step+1} / {examples.length}</span><button type="button" aria-label="Next example step" disabled={step===examples.length-1} onClick={()=>{setPlaying(false);select(step+1);}}><IconChevronRight size={16}/></button></div></div>
  </section>;
}

function ExampleEmbed({embed}:{embed:Embed}) {
  const valid=(url:string)=>/^https?:\/\//.test(url);
  const validImage=(url:string)=>valid(url)||url.startsWith('blob:');
  return <div className={styles.exampleEmbed} style={{borderLeftColor:'#'+embed.color.toString(16).padStart(6,'0')}}>
    {embed.author.name&&<div className={styles.embedAuthor}>{validImage(embed.author.icon_url)&&<img src={embed.author.icon_url} alt=""/>}{embed.author.url&&valid(embed.author.url)?<a href={embed.author.url} target="_blank" rel="noopener noreferrer">{embed.author.name}</a>:embed.author.name}</div>}
    {validImage(embed.thumbnail.url)&&<img className={styles.thumbnail} src={embed.thumbnail.url} alt="Example thumbnail"/>}
    {embed.title&&<h3>{valid(embed.url)?<a href={embed.url} target="_blank" rel="noopener noreferrer">{embed.title}</a>:embed.title}</h3>}
    <Markdown text={embed.description}/>
    {!!embed.fields.length&&<div className={styles.exampleFields}>{embed.fields.map(field=><div key={field.id} style={{gridColumn:field.inline?undefined:'1 / -1'}}><strong>{field.name||'Field name'}</strong><Markdown text={field.value||'Add a value'}/></div>)}</div>}
    {validImage(embed.image.url)&&<img className={styles.mainImage} src={embed.image.url} alt="Example embed image"/>}
    {(embed.footer.text||embed.timestamp)&&<div className={styles.embedFooter}>{validImage(embed.footer.icon_url)&&<img src={embed.footer.icon_url} alt=""/>}{embed.footer.text}{embed.timestamp&&<> · {new Date(embed.timestamp).toLocaleDateString()}</>}</div>}
  </div>;
}
