import {flattenOutline} from './course-api.js';

// These are the cookie-authenticated endpoints exposed by NYU's My Courses
// widget. All UI selection lives in Resources; no website tab is queried.
import {sourceConfig} from './sources.js';
async function json(path,fetcher,{optionalModule=false,provider='nyu'}={}) {
  const login=provider==='demo'?'Demo session expired. Choose Restore demo access on the local demo LMS page, then retry.':'Brightspace access was denied. Sign into NYU Brightspace in this Chrome profile, then retry.';
  let response;
  try {response=await fetcher(sourceConfig(provider).base+path,{credentials:'include',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});}
  catch(error) {if(error.code==='PAUSED') throw error;throw Object.assign(new Error('Brightspace could not be reached. Check your connection and sign into NYU Brightspace in this Chrome profile.'),{code:'NETWORK_ERROR'});}
  if(optionalModule && [403,404].includes(response.status)) return null;
  if(response.status===403 && path.endsWith('/content/toc')) throw Object.assign(new Error('Brightspace denied access to this course outline. Check your course access in Brightspace.'),{code:'ACCESS_DENIED'});
  if([401,403].includes(response.status)) throw Object.assign(new Error(login),{code:'NEEDS_LOGIN'});
  if(response.status===429) throw Object.assign(new Error('Brightspace is limiting requests. Wait a moment before syncing again.'),{code:'RATE_LIMITED'});
  if(!response.ok) throw new Error(`Brightspace request failed (HTTP ${response.status}).`);
  if(!response.headers.get('content-type')?.includes('json')) throw Object.assign(new Error(provider==='demo'?login:'Brightspace returned a sign-in page. Sign into NYU Brightspace in this Chrome profile, then retry.'),{code:'NEEDS_LOGIN'});
  return response.json();
}
export async function listBrightspaceSemesters(fetcher=fetch,{provider='nyu'}={}) {
  const result=await json('/d2l/le/manageCourses/api/mysemesters',fetcher,{provider});
  if(!Array.isArray(result) || result.length>200) throw new Error('Brightspace returned an unsupported semester list.');
  const seen=new Set();
  return result.map(item=>{
    const semesterId=String(item.OrgUnitId);
    if(!/^\d+$/.test(semesterId) || seen.has(semesterId) || typeof item.Name!=='string' || !item.Name.trim() || item.Name.length>1000) throw new Error('Brightspace returned an invalid semester.');
    seen.add(semesterId);return {semesterId,title:item.Name};
  });
}
export async function listSemesterCourses(semesterId,fetcher=fetch,{provider='nyu'}={}) {
  if(typeof semesterId!=='string' || !/^\d+$/.test(semesterId)) throw new Error('Choose a semester in Resources first.');
  const courses=new Map(),bookmarks=new Set();let bookmark=null;
  for(let page=0;page<50;page++) {
    const query=new URLSearchParams({parentOrgUnitIds:semesterId,orgUnitTypeId:'3',pageSize:'20',sort:'OrgUnitId',autoPinCourses:'false',promotePins:'false',embedDepth:'0'});
    if(bookmark) query.set('bookmark',bookmark);
    const result=await json('/d2l/le/manageCourses/api/mycourses?'+query,fetcher,{provider});
    if(!Array.isArray(result?.Courses) || !Object.hasOwn(result,'Bookmark')) throw new Error('Brightspace returned an unsupported course list.');
    for(const item of result.Courses) {
      const courseId=String(item.OrgUnitId);
      if(!/^\d+$/.test(courseId) || typeof item.Name!=='string' || !item.Name.trim() || item.Name.length>1000 || item.TypeId!==3) throw new Error('Brightspace returned an invalid course.');
      courses.set(courseId,{courseId,title:item.Name});
    }
    if(courses.size>200) throw new Error('This semester exceeds the 200-course prototype limit.');
    if(result.Bookmark===null || result.Bookmark==='') return [...courses.values()];
    if(typeof result.Bookmark!=='string' || result.Bookmark.length>2048 || bookmarks.has(result.Bookmark)) throw new Error('Brightspace course pagination did not advance. No partial semester was synced.');
    bookmark=result.Bookmark;bookmarks.add(bookmark);
  }
  throw new Error('Brightspace course pagination exceeded its limit. No partial semester was synced.');
}
export async function readCourseOutline(courseId,fetcher=fetch,{provider='nyu'}={}) {
  if(typeof courseId!=='string' || !/^\d+$/.test(courseId)) throw new Error('Invalid course ID.');
  const result=await json(`/d2l/api/le/1.82/${courseId}/content/toc`,fetcher,{provider});
  if(!Array.isArray(result?.Modules)) throw new Error('Brightspace returned an unsupported course outline.');
  // NYU often includes descriptions in ToC, though the documented ToC contract
  // omits them. Read module details only for missing fields, never for files.
  const entries=flattenOutline(result,courseId,{provider}),details=new Map();
  for(const entry of entries.filter(e=>e.kind==='module')) {
    if(entry.descriptionStatus==='synced') continue;
    const value=entry.locked?null:await json(`/d2l/api/le/1.82/${courseId}/content/modules/${entry.id}`,fetcher,{optionalModule:true,provider});
    if(value && (String(value.Id)!==entry.id || value.Type!==0 || !Object.hasOwn(value,'Description'))) throw new Error('Brightspace returned unsupported module metadata.');
    details.set(entry.id,value);
  }
  function enrich(modules) {
    for(const module of modules) {
      if(module.IsHidden===true) continue;
      if(details.has(String(module.ModuleId))) {
        const value=details.get(String(module.ModuleId));
        module.Description=value?.Description??null;
        module.DescriptionStatus=value?'synced':'unavailable';
      } else module.DescriptionStatus='synced';
      enrich(module.Modules);
    }
  }
  enrich(result.Modules);
  return result;
}
