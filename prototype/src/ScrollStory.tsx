import {CSSProperties,useCallback,useEffect,useRef,useState} from 'react';
import {TeaItem} from './model';
import {
  CategorySceneContent,
  HistorySceneContent,
  HomeSceneContent,
  NavSection,
  ReferenceContactSceneContent,
  SceneId,
  historyChapters,
  sceneMeta
} from './HomeSections';

type Props={items:TeaItem[];onSectionChange:(section:NavSection)=>void};
type SceneStyle=CSSProperties&{'--scene-visibility':number;'--scene-offset':number};
type StoryStyle=CSSProperties&{'--scene-count':number};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const targetForSection=(section:string|null):SceneId=>section==='history'?'history-origin':section==='categories'?'categories':section==='references-contact'?'references-contact':'home';

export function ScrollStory({items,onSectionChange}:Props){
  const trackRef=useRef<HTMLDivElement>(null);
  const sceneRefs=useRef<Array<HTMLElement|null>>([]);
  const activeRef=useRef(-1);
  const [activeIndex,setActiveIndex]=useState(0);
  const [stackedMode,setStackedMode]=useState(()=>matchMedia('(max-width: 600px)').matches);

  const setActive=useCallback((index:number)=>{
    const next=clamp(index,0,sceneMeta.length-1);
    if(activeRef.current===next)return;
    activeRef.current=next;
    setActiveIndex(next);
    onSectionChange(sceneMeta[next].nav);
  },[onSectionChange]);

  const updateDesktop=useCallback(()=>{
    const track=trackRef.current;
    if(!track)return;
    const stickyTop=parseFloat(getComputedStyle(track).getPropertyValue('--story-header'))||88;
    const stageHeight=Math.max(1,innerHeight-stickyTop);
    const distance=Math.max(1,track.offsetHeight-stageHeight);
    const progress=clamp((stickyTop-track.getBoundingClientRect().top)/distance,0,1);
    const sceneFloat=progress*(sceneMeta.length-1);
    sceneRefs.current.forEach((scene,index)=>{
      if(!scene)return;
      const distanceFromScene=sceneFloat-index;
      scene.style.setProperty('--scene-visibility',String(clamp(1-Math.abs(distanceFromScene),0,1)));
      scene.style.setProperty('--scene-offset',String(-distanceFromScene));
    });
    setActive(Math.round(sceneFloat));
  },[setActive]);

  const updateMobile=useCallback(()=>{
    const marker=innerHeight*.44;
    let nearest=0;
    sceneRefs.current.forEach((scene,index)=>{if(scene&&scene.getBoundingClientRect().top<=marker)nearest=index});
    setActive(nearest);
  },[setActive]);

  const snapDesktop=useCallback(()=>{
    const track=trackRef.current;
    if(!track)return;
    const stickyTop=parseFloat(getComputedStyle(track).getPropertyValue('--story-header'))||88;
    const stageHeight=Math.max(1,innerHeight-stickyTop);
    const distance=Math.max(1,track.offsetHeight-stageHeight);
    const rawProgress=(stickyTop-track.getBoundingClientRect().top)/distance;
    if(rawProgress<=0||rawProgress>=1)return;
    const nearestIndex=Math.round(rawProgress*(sceneMeta.length-1));
    const trackTop=scrollY+track.getBoundingClientRect().top;
    const targetY=trackTop-stickyTop+distance*(nearestIndex/(sceneMeta.length-1));
    if(Math.abs(scrollY-targetY)<2)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:targetY,behavior:reduced?'auto':'smooth'});
  },[]);

  const scrollToScene=useCallback((sceneId:SceneId,focusAfter=false)=>{
    const index=sceneMeta.findIndex(scene=>scene.id===sceneId);
    const scene=sceneRefs.current[index];
    const track=trackRef.current;
    if(index<0||!scene||!track)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(stackedMode){
      scene.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
    }else{
      const stickyTop=parseFloat(getComputedStyle(track).getPropertyValue('--story-header'))||88;
      const stageHeight=Math.max(1,innerHeight-stickyTop);
      const distance=Math.max(1,track.offsetHeight-stageHeight);
      const trackTop=scrollY+track.getBoundingClientRect().top;
      window.scrollTo({top:trackTop-stickyTop+distance*(index/(sceneMeta.length-1)),behavior:reduced?'auto':'smooth'});
    }
    if(focusAfter)setTimeout(()=>document.getElementById(sceneId+'-title')?.focus({preventScroll:true}),reduced?0:520);
  },[stackedMode]);

  useEffect(()=>{
    const query=matchMedia('(max-width: 600px)');
    const change=()=>setStackedMode(query.matches);
    change();
    query.addEventListener('change',change);
    return()=>query.removeEventListener('change',change);
  },[]);

  useEffect(()=>{
    let frame=0;
    let settleTimer=0;
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(stackedMode?updateMobile:updateDesktop);
      if(!stackedMode){clearTimeout(settleTimer);settleTimer=window.setTimeout(snapDesktop,160)}
    };
    update();
    addEventListener('scroll',update,{passive:true});
    addEventListener('resize',update);
    return()=>{cancelAnimationFrame(frame);clearTimeout(settleTimer);removeEventListener('scroll',update);removeEventListener('resize',update)};
  },[snapDesktop,stackedMode,updateDesktop,updateMobile]);

  useEffect(()=>{
    const requested=new URLSearchParams(location.hash.split('?')[1]||'').get('section');
    const sceneId=targetForSection(requested);
    let second=0;
    const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>scrollToScene(sceneId))});
    return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second)};
  },[scrollToScene]);

  return <div className="scroll-story" ref={trackRef} style={{'--scene-count':sceneMeta.length} as StoryStyle}>
    <div className="story-stage" data-scene-tone={sceneMeta[activeIndex].tone}>
      {sceneMeta.map((scene,index)=>{
        const chapterIndex=index-1;
        const style={'--scene-visibility':index===0?1:0,'--scene-offset':index===0?0:1} as SceneStyle;
        return <section
          id={scene.id}
          key={scene.id}
          ref={node=>{sceneRefs.current[index]=node}}
          className={`story-scene tone-${scene.tone}${index===activeIndex?' is-active':''}`}
          style={style}
          aria-labelledby={scene.id+'-title'}
          aria-hidden={stackedMode?undefined:index!==activeIndex}
          inert={stackedMode?undefined:index!==activeIndex}
        >
          {scene.id==='home'&&<HomeSceneContent/>}
          {chapterIndex>=0&&chapterIndex<historyChapters.length&&<HistorySceneContent chapter={historyChapters[chapterIndex]} index={chapterIndex}/>}
          {scene.id==='categories'&&<CategorySceneContent items={items}/>}
          {scene.id==='references-contact'&&<ReferenceContactSceneContent/>}
        </section>
      })}
      <nav className="story-progress" aria-label="首页章节">
        {sceneMeta.map((scene,index)=><button key={scene.id} type="button" className={index===activeIndex?'active':''} aria-current={index===activeIndex?'step':undefined} aria-label={`前往${scene.label}`} onClick={()=>scrollToScene(scene.id,true)}><i/><span>{scene.shortLabel}</span></button>)}
      </nav>
      <div className="story-stage-index" aria-hidden="true"><strong>{String(activeIndex+1).padStart(2,'0')}</strong><i/><span>{String(sceneMeta.length).padStart(2,'0')}</span></div>
    </div>
  </div>
}
