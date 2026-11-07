const states=new Set(['pending','scanning','complete','failed','skipped']);
export function syncProgressModel(record={}) {
  const courses=Array.isArray(record.courses) && record.courses.length<=200?record.courses.map((course,index)=>({
    title:typeof course.title==='string'?course.title:`Course ${index+1}`,
    state:states.has(course.state)?(course.state==='scanning' && record.state!=='running'?'pending':course.state):'pending',
  })):[];
  const total=courses.length,done=courses.filter(course=>course.state==='complete').length,failed=courses.filter(course=>course.state==='failed').length,skipped=courses.filter(course=>course.state==='skipped').length;
  const parts=[`${done} synced`,...(failed?[`${failed} failed`]:[]),...(skipped?[`${skipped} not scanned`]:[]),...(total-done-failed-skipped?[`${total-done-failed-skipped} remaining`]:[])];
  return {courses,total,done,failed,skipped,detail:parts.join(' · '),label:`${done} of ${total} courses synced${failed?`, ${failed} failed`:''}${skipped?`, ${skipped} not scanned`:''}`};
}
export function courseArc(index,total) {
  if(!Number.isInteger(total) || total<1 || total>200 || !Number.isInteger(index) || index<0 || index>=total) throw new Error('Invalid course segment.');
  if(total===1) return 'M 32 7 A 25 25 0 1 1 32 57 A 25 25 0 1 1 32 7';
  const angle=360/total,gap=total<=8?Math.min(14,angle*.35):Math.min(8,angle*.18);
  const point=degrees=>{const radians=degrees*Math.PI/180;return `${(32+25*Math.cos(radians)).toFixed(3)} ${(32+25*Math.sin(radians)).toFixed(3)}`;};
  const start=-90+index*angle+gap/2,end=-90+(index+1)*angle-gap/2;
  return `M ${point(start)} A 25 25 0 ${end-start>180?1:0} 1 ${point(end)}`;
}

export function createSyncStatus(element) {
  const doc=element.ownerDocument,ns='http://www.w3.org/2000/svg';
  const indicator=doc.createElement('div'),svg=doc.createElementNS(ns,'svg'),count=doc.createElement('span'),copy=doc.createElement('div'),message=doc.createElement('p'),detail=doc.createElement('p');
  indicator.className='sync-progress';indicator.setAttribute('role','progressbar');indicator.setAttribute('aria-label','Course sync');
  svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');count.setAttribute('aria-hidden','true');
  count.className='sync-progress-count';indicator.append(svg,count);
  copy.className='sync-copy';message.className='sync-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  detail.className='sync-detail';copy.append(message,detail);element.classList.add('sync-notice');element.append(indicator,copy);
  let paths=[],lastKey=null,dismiss=null;
  const clearTimer=()=>{clearTimeout(dismiss);dismiss=null;};
  return {
    message(value) {clearTimer();lastKey=null;indicator.hidden=true;detail.hidden=true;message.textContent=value || '';element.hidden=!value;delete element.dataset.state;},
    render(record,{restore=false}={}) {
      if(!record?.message) return;
      const key=`${record.semesterId || ''}:${record.startedAt || ''}`;
      if(restore && record.state==='complete' && lastKey!==key) {element.hidden=true;return;}
      clearTimer();lastKey=key;element.hidden=false;element.dataset.state=record.state;
      message.textContent=record.message;
      const model=syncProgressModel(record),running=record.state==='running';
      indicator.hidden=!model.total && !running;
      detail.hidden=!model.total;detail.textContent=model.detail;
      indicator.setAttribute('aria-valuemin','0');indicator.setAttribute('aria-valuetext',model.total?model.label:record.message);
      if(model.total) {indicator.setAttribute('aria-valuemax',String(model.total));indicator.setAttribute('aria-valuenow',String(model.done));}
      else {indicator.removeAttribute('aria-valuemax');indicator.removeAttribute('aria-valuenow');}
      count.textContent=model.total?`${model.done}/${model.total}`:'…';
      const segments=model.total?model.courses:[{title:'Loading course list',state:'scanning'}];
      svg.classList.toggle('sync-indeterminate',!model.total);
      if(paths.length!==segments.length) {
        svg.replaceChildren();paths=segments.map(()=>{const path=doc.createElementNS(ns,'path'),title=doc.createElementNS(ns,'title');path.append(title);svg.append(path);return path;});
      }
      segments.forEach((course,index)=>{
        const path=paths[index];path.setAttribute('d',model.total?courseArc(index,model.total):'M 32 7 A 25 25 0 1 1 7 32');
        path.setAttribute('stroke-linecap',model.total>8?'butt':'round');path.dataset.state=course.state;
        path.firstChild.textContent=`${course.title}: ${course.state==='complete'?'synced':course.state}`;
      });
      if(record.state==='complete' && !model.failed && !model.skipped) dismiss=setTimeout(()=>{element.hidden=true;},4500);
    },
  };
}
