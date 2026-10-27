'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useUiMotion } from '@/lib/useUiMotion';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';

/** Keep removed controls in normal flow until their space has closed. Never scale forms. */
export function AnimatedEditorList({children,gap=10,className=''}:{children:ReactNode;gap?:number;className?:string}) {
  return <div className={`editor-motion-list ${className}`} style={{'--editor-row-gap':`${gap}px`} as CSSProperties}>
    <AnimatePresence initial={false}>{children}</AnimatePresence>
  </div>;
}

export function AnimatedEditorRow({children}:{children:ReactNode}) {
  const present=useIsPresent();
  const uiMotion=useUiMotion();
  const [moving,setMoving]=useState(false);
  const row=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(present||!row.current?.contains(document.activeElement))return;
    // Removed rows become inert immediately; return focus to a surviving local control.
    const list=row.current.closest('.editor-motion-list');
    const available=(scope:Element|undefined|null,selector:string)=>Array.from(scope?.querySelectorAll<HTMLElement>(selector)??[])
      .find(element=>!element.closest('[inert]')&&element.getClientRects().length>0);
    const sibling=available(list,'[data-editor-row-present="true"] button:not(:disabled)');
    const fallback=available(list?.parentElement,'button:not(:disabled)')
      ??available(list?.parentElement?.parentElement,'button:not(:disabled)');
    (sibling??fallback)?.focus({preventScroll:true});
  },[present]);

  return <motion.div ref={row} className="editor-motion-row" data-editor-row-present={present} data-editor-row-moving={moving}
    inert={!present} aria-hidden={!present||undefined}
    initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
    transition={{...uiMotion.transition,opacity:uiMotion.feedback}}
    onAnimationStart={()=>setMoving(true)} onAnimationComplete={()=>setMoving(false)}
    style={{overflow:moving||!present?'clip':'visible',pointerEvents:present?undefined:'none'}}>
    <div className="editor-motion-row-content">{children}</div>
  </motion.div>;
}
