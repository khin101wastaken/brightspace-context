import {flattenOutline} from './course-api.js';

// Serialized into the captured homepage tab. Only reads the selected semester's
// rendered course cards; never changes the page or reads component internals.
export function discoverSemester() {
  if(location.origin!=='https://brightspace.nyu.edu') throw new Error('Open NYU Brightspace first.');
  function deep(root,selector) {
    const result=[...root.querySelectorAll(selector)];
    for(const element of root.querySelectorAll('*')) if(element.shadowRoot) result.push(...deep(element.shadowRoot,selector));
    return result;
  }
  const tabs=deep(document,'[role="tab"][aria-selected="true"][id^="BySemester"]');
  if(tabs.length!==1) throw new Error('Open Brightspace My Home and select a semester, such as 2026 Fall.');
  const tab=tabs[0],semesterId=tab.id.replace('BySemester','');
  const panel=deep(document,'[role="tabpanel"]').find(el=>el.id===tab.getAttribute('aria-controls'));
  if(!panel || !/^\d+$/.test(semesterId)) throw new Error('The selected semester is not ready. Wait for its courses to load.');
  const cards=deep(panel,'d2l-card[href]'),courses=new Map();
  for(const card of cards) {
    const url=new URL(card.getAttribute('href'),location.origin);
    const id=url.origin===location.origin && url.pathname.match(/^\/d2l\/home\/(\d+)\/?$/)?.[1];
    const title=card.querySelector('.d2l-organization-name')?.textContent.trim();
    if(id && title) courses.set(id,{courseId:id,title});
  }
  const countText=deep(panel,'#viewAllCourses').map(el=>el.textContent).join(' ');
  const count=countText.match(/\((\d+)\)/)?.[1];
  if(!count || Number(count)!==courses.size || !courses.size) throw new Error('The semester course list is incomplete. Load all courses in this semester on My Home, then retry.');
  if(courses.size>200) throw new Error('This semester exceeds the 200-course prototype limit.');
  return {semesterId,title:tab.getAttribute('title') || tab.textContent.trim(),courses:[...courses.values()]};
}

export async function scanSemester(semester,{readOutline,saveCourse,onProgress=async()=>{}}) {
  if(!/^\d+$/.test(semester?.semesterId) || !semester.title || !Array.isArray(semester.courses) || !semester.courses.length || semester.courses.length>200) throw new Error('Invalid semester selection.');
  if(new Set(semester.courses.map(c=>c.courseId)).size!==semester.courses.length || semester.courses.some(c=>!/^\d+$/.test(c.courseId) || !c.title)) throw new Error('Invalid semester course list.');
  const courses=[];
  // Sequential requests keep school traffic modest and permit an immediate stop
  // after an expired session or rate limit, without losing completed courses.
  let stopReason=null;
  for(const course of semester.courses) {
    await onProgress({completed:courses.length,total:semester.courses.length,title:course.title});
    try {
      if(stopReason) throw new Error(stopReason);
      const entries=flattenOutline(await readOutline(course.courseId),course.courseId);
      const catalog={...course,entries,coverage:'full-toc',lastScannedAt:new Date().toISOString()};
      await saveCourse(catalog);
      courses.push({...catalog,status:'complete'});
    } catch(error) {
      const message=error.message || 'Unable to scan this course.';
      if(/expired|sign.in|limiting requests|429/i.test(message)) stopReason=message;
      courses.push({...course,status:'failed',error:message});
    }
  }
  return {semesterId:semester.semesterId,title:semester.title,updatedAt:new Date().toISOString(),courses};
}
