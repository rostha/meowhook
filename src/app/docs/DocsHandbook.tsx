'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, MotionConfig, useMotionValue } from 'framer-motion';
import { IconChevronRight, IconChevronLeft, IconChevronDown, IconBookOpen, IconSearch, IconX, IconMenu, IconLink, IconCheck } from '@/components/MeowIcons';
import { groups, guides, limits } from './content';
import styles from './docs.module.css';

const Playground = dynamic(() => import('./Playground'), { ssr:false, loading:() => <div className={styles.loading} role="status"><span className={styles.loadingDot}/>Opening the practice area…</div> });
const sectionNames = ['Overview','Try it yourself','Good to know'];
const sectionIds = ['overview','practice','notes'];
const searchIndex = guides.map(guide=>JSON.stringify(guide).toLowerCase());

export default function DocsHandbook() {
  const [active,setActive]=useState('first-message');
  const [query,setQuery]=useState('');
  const [menu,setMenu]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({'Getting started':true,'Text & embeds':true});
  const [section,setSection]=useState('overview');
  const [copied,setCopied]=useState(false);
  const [copyError,setCopyError]=useState('');
  const page=useRef<HTMLElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const search=useRef<HTMLInputElement>(null);
  const menuButton=useRef<HTMLButtonElement>(null);
  const navigation=useRef<HTMLDivElement>(null);
  const shouldFocus=useRef(false);
  const copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const progress=useMotionValue(0);
  const uiMotion=useUiMotion();
  const reduced=uiMotion.reduced;
  const guide=guides.find(item=>item.id===active)??guides[0];
  const index=guides.indexOf(guide);
  const filtered=guides.filter((_,i)=>searchIndex[i].includes(query.trim().toLowerCase()));

  useEffect(()=>{
    const sync=()=>{
      const id=window.location.hash.slice(1);
      const legacy=['first-message','text','embeds','v2','drafts','editing','json','troubleshooting'];
      const resolved=id.startsWith('topic-')?legacy[Number(id.slice(6))]:id;
      setActive(guides.some(item=>item.id===resolved)?resolved:'first-message');
      setMenu(false);
      page.current?.scrollTo({top:0,behavior:'instant'});
    };
    sync();window.addEventListener('hashchange',sync);
    return()=>window.removeEventListener('hashchange',sync);
  },[]);

  useEffect(()=>{
    const media=window.matchMedia('(max-width: 760px)');
    const update=()=>{setMobile(media.matches);if(!media.matches)setMenu(false);};
    update();media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);

  useEffect(()=>{
    document.title=`${guide.title} · Meowhook Docs`;
    setExpanded(current=>({...current,[guide.group]:true}));
    setCopied(false);setCopyError('');setSection('overview');
    if(shouldFocus.current){heading.current?.focus({preventScroll:true});shouldFocus.current=false;}
    // Keep the selected guide in the sidebar's own scroll area without moving the article.
    const timer=setTimeout(()=>{
      const link=navigation.current?.querySelector<HTMLElement>('[aria-current=page]');
      if(!link||!navigation.current)return;
      const bounds=navigation.current.getBoundingClientRect();
      const item=link.getBoundingClientRect();
      if(item.bottom>bounds.bottom)navigation.current.scrollTop+=item.bottom-bounds.bottom+24;
      if(item.top<bounds.top)navigation.current.scrollTop-=bounds.top-item.top+24;
    },200);
    return()=>clearTimeout(timer);
  },[guide.id,guide.title,guide.group]);

  useEffect(()=>{
    const root=page.current;if(!root)return;
    let frame=0;
    const measure=()=>{
      frame=0;
      progress.set(root.scrollTop/Math.max(1,root.scrollHeight-root.clientHeight));
      const threshold=window.innerWidth<=760?195:170;
      const visible=Array.from(root.querySelectorAll<HTMLElement>('[data-docs-section]')).filter(el=>el.getBoundingClientRect().top<=threshold).at(-1);
      setSection(visible?.dataset.docsSection??'overview');
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const observer=new ResizeObserver(schedule);
    const article=root.querySelector('article');if(article)observer.observe(article);
    root.addEventListener('scroll',schedule,{passive:true});measure();
    return()=>{root.removeEventListener('scroll',schedule);observer.disconnect();cancelAnimationFrame(frame);};
  },[active,progress]);

  const openSearch=()=>{setMenu(true);requestAnimationFrame(()=>search.current?.focus({preventScroll:true}));};
  useEffect(()=>{
    const keys=(event:KeyboardEvent)=>{
      // The expanded editor owns shortcuts such as Ctrl+K while its dialog is open.
      if(document.querySelector('[role=dialog]'))return;
      const target=event.target as HTMLElement;
      const typing=target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if(((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k')||(!typing&&event.key==='/')){event.preventDefault();openSearch();}
      if(event.key==='Escape'){
        if(document.activeElement===search.current&&search.current?.value){setQuery('');return;}
        setMenu(false);if(window.innerWidth<=760)menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown',keys);
    return()=>{document.removeEventListener('keydown',keys);clearTimeout(copyTimer.current);};
  },[]);

  const visit=(id:string,event?:MouseEvent<HTMLAnchorElement>)=>{
    if(event&&(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0))return;
    shouldFocus.current=true;setMenu(false);setQuery('');
    if(id===active){page.current?.scrollTo({top:0,behavior:reduced?'instant':'smooth'});heading.current?.focus({preventScroll:true});shouldFocus.current=false;}
    if(!event)window.location.hash=id;
  };
  const jump=(id:string)=>{
    page.current?.querySelector<HTMLElement>(`[data-docs-section=${id}]`)?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
    setSection(id);
  };
  const copyLink=async()=>{
    try{await navigator.clipboard.writeText(`${window.location.origin}/docs#${guide.id}`);setCopied(true);setCopyError('');clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),1800);}
    catch{setCopyError('Copy the address from your browser to share this guide.');}
  };

  return <MotionConfig reducedMotion="user"><main className={styles.page} ref={page}>
    <a href="#guide-content" className={styles.skip} onClick={event=>{event.preventDefault();heading.current?.focus();}}>Skip to the guide</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><IconBookOpen size={21}/><strong>Meowhook</strong><span>Handbook</span></Link>
      <div className={styles.headerActions}><button className={styles.headerSearch} type="button" onClick={openSearch} aria-label="Search guides"><IconSearch size={16}/><span>Search guides</span><kbd>/</kbd></button><Link href="/" className={styles.builderLink}>Open builder <IconChevronRight size={16}/></Link></div>
      <motion.div className={styles.readingProgress} style={{scaleX:progress}} aria-hidden="true"/>
    </header>
    <AnimatePresence>{menu&&mobile&&<motion.button className={styles.menuBackdrop} aria-label="Close topic navigation" tabIndex={-1} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={uiMotion.feedback} onClick={()=>setMenu(false)}/>}</AnimatePresence>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <button ref={menuButton} className={styles.mobileMenu} type="button" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-controls="docs-navigation"><IconMenu size={18}/><span>{guide.group}</span><span className={styles.mobileMenuHint}>{menu?'Close':'Browse guides'}</span><IconChevronDown size={15} className={menu?styles.rotated:''}/></button>
        <div className={`${styles.navigationShell} ${menu?styles.navigationOpen:''}`} inert={mobile&&!menu}>
          <div id="docs-navigation" ref={navigation} className={styles.navigation}>
            <div className={styles.navTitle}><strong>Explore the handbook</strong><span>{guides.length} practical guides</span></div>
            <div className={styles.search}><IconSearch size={16}/><input ref={search} aria-label="Search the handbook" placeholder="Find a feature…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&filtered[0]){event.preventDefault();visit(filtered[0].id);}}}/>{query?<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><IconX size={15}/></button>:<kbd>/</kbd>}</div>
            {query&&<p className={styles.searchCount} role="status">{filtered.length} {filtered.length===1?'guide':'guides'} found · Enter to open first</p>}
            <nav aria-label="Handbook topics">{groups.map((group,groupIndex)=>{
              const items=filtered.filter(item=>item.group===group);if(!items.length)return null;
              const open=!!query.trim()||!!expanded[group];
              return <div key={group} className={styles.navGroup}><h2><button type="button" aria-expanded={open} aria-controls={`guide-group-${groupIndex}`} onClick={()=>setExpanded(current=>({...current,[group]:!current[group]}))}>{group}<span>{items.length}</span><IconChevronDown size={13} className={open?styles.rotated:''}/></button></h2><div id={`guide-group-${groupIndex}`} className={`${styles.groupContents} ${open?styles.groupOpen:''}`} inert={!open}><div>{items.map(item=><a href={`#${item.id}`} key={item.id} aria-current={active===item.id?'page':undefined} className={active===item.id?styles.activeLink:undefined} onClick={event=>visit(item.id,event)}>{active===item.id&&<motion.span className={styles.activeBackground} layoutId="docs-active-topic" transition={uiMotion.transition}/>}<span>{item.title.replace('V2: ','').replace(/^./,letter=>letter.toUpperCase())}</span>{active===item.id&&<IconChevronRight size={13}/>}</a>)}</div></div></div>;
            })}</nav>
            {!filtered.length&&<div className={styles.noResults}><strong>No guides found</strong><p>Try “image”, “container”, or “backup”.</p><button type="button" onClick={()=>{setQuery('');search.current?.focus();}}>Clear search</button></div>}
            <div className={styles.navFooter}><IconBookOpen size={15}/><span>Learn here.<br/>Make it yours in the builder.</span></div>
          </div>
        </div>
      </aside>
      <article className={styles.article} id="guide-content">
        <nav className={styles.sectionNav} aria-label="On this guide">{sectionIds.map((id,i)=><button key={id} type="button" onClick={()=>jump(id)} aria-current={section===id?'location':undefined}>{sectionNames[i]}{section===id&&<motion.span layoutId="docs-section-indicator" transition={uiMotion.transition}/>}</button>)}<span className={styles.guideCount}>{index+1} / {guides.length}</span></nav>
        <motion.div key={guide.id} initial={{opacity:.65}} animate={{opacity:1}} transition={uiMotion.transition}>
          <div className={styles.guideHeading} data-docs-section="overview">
            <div className={styles.breadcrumb}><span>{guide.group}</span><button type="button" className={styles.copyLink} onClick={copyLink} aria-label={copied?'Guide link copied':'Copy guide link'}>{copied?<IconCheck size={14}/>:<IconLink size={14}/>}<span aria-live="polite">{copied?'Copied':'Copy link'}</span></button></div>
            {copyError&&<p className={styles.copyError} role="status">{copyError}</p>}
            <h1 ref={heading} tabIndex={-1}>{guide.title}</h1><p className={styles.intro}>{guide.intro}</p>
          </div>
          <ol className={styles.steps}>{guide.steps.map((step,i)=><li key={step.title}><span className={styles.stepNumber} aria-hidden="true">{i+1}</span><div><h2>{step.title}</h2><p>{step.text}</p></div></li>)}</ol>
          <div data-docs-section="practice">{guide.group === 'Bot workspace' ? <section className={styles.tip}><IconBookOpen size={18}/><div><strong>Build it in your workspace</strong><p>Your dashboard saves the messages and interactions you create. Opening it does not publish anything to Discord.</p><Link href={`/dashboard#${({ dashboard: 'overview', 'self-roles': 'actions', 'discord-forms': 'forms', 'scheduled-messages': 'schedules', 'app-commands': 'commands' } as Record<string, string>)[guide.id] || 'overview'}`}>Open Dashboard →</Link></div></section> : <Playground guideId={guide.id}/>}</div>
          <div data-docs-section="notes"><aside className={styles.tip}><IconBookOpen size={18}/><div><strong>A useful thing to know</strong><p>{guide.tip}</p></div></aside><div className={styles.details}>{guide.details.map(detail=><section key={detail.title}><h2>{detail.title}</h2><p>{detail.text}</p></section>)}</div></div>
          {guide.id==='troubleshooting'&&<section className={styles.limits}><h2>Limits at a glance</h2><div className={styles.tableWrap}><table><thead><tr><th>What you’re adding</th><th>Limit</th></tr></thead><tbody>{limits.map(([name,limit])=><tr key={name}><td>{name}</td><td>{limit}</td></tr>)}</tbody></table></div><p>These include Meowhook’s editor limits. For Discord’s current rules, see the <a href="https://docs.discord.com/developers/resources/message#embed-object-embed-limits" target="_blank" rel="noopener noreferrer">embed reference</a> and <a href="https://docs.discord.com/developers/components/reference" target="_blank" rel="noopener noreferrer">component reference</a>.</p></section>}
          <section className={styles.related}><h2>Related guides</h2><div>{guide.related.map(id=><a key={id} href={`#${id}`} onClick={event=>visit(id,event)}>{guides.find(item=>item.id===id)?.title}<IconChevronRight size={15}/></a>)}</div></section>
          <nav className={styles.guidePager} aria-label="Previous and next guides">{index>0?<a href={`#${guides[index-1].id}`} onClick={event=>visit(guides[index-1].id,event)}><IconChevronLeft size={18}/><span><small>Previous guide</small><strong>{guides[index-1].title}</strong></span></a>:<Link href="/"><IconChevronLeft size={18}/><span><small>Ready to make something?</small><strong>Open the builder</strong></span></Link>}{index<guides.length-1?<a href={`#${guides[index+1].id}`} onClick={event=>visit(guides[index+1].id,event)}><span><small>Next guide</small><strong>{guides[index+1].title}</strong></span><IconChevronRight size={18}/></a>:<a href="#first-message" onClick={event=>visit('first-message',event)}><span><small>Back to the beginning</small><strong>Send your first message</strong></span><IconChevronRight size={18}/></a>}</nav>
          <footer className={styles.footer}><nav aria-label="Site information"><Link href="/about">About Meowhook</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav><button type="button" onClick={()=>jump('overview')}>Back to top <IconChevronDown size={14} className={styles.rotated}/></button></footer>
        </motion.div>
      </article>
    </div>
  </main></MotionConfig>;
}
