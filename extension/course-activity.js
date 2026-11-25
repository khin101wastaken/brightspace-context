import {activityId,activityRequest,assignmentApiPath,assignmentAttachmentUrl,assignmentUrl} from './activity-protocol.js';
import {cacheDocumentMetadata} from './companion-client.js';
import {documentFormat,MAX_FILE_BYTES} from './document-formats.js';
import {descriptionText} from './rich-text.js';
import {sourceConfig} from './sources.js';
import {listBrightspaceSemesters} from './brightspace-client.js';

const base=sourceConfig('nyu').base;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const date=value=>typeof value==='string' && value.length<=40 && Number.isFinite(Date.parse(value))?value:null;
const title=value=>typeof value==='string'?value.trim().slice(0,500):'';

async function readJson(path,fetcher,signal) {
  let response;
  try {
    response=await fetcher(base+path,{credentials:'include',redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
  } catch(error) {
    signal.throwIfAborted();
    throw fail('NETWORK_ERROR','Brightspace could not be reached. Check your connection and try again.');
  }
  if(response.status===401 || response.type==='opaqueredirect' || (response.status>=300 && response.status<400) || (response.ok && !response.headers.get('content-type')?.includes('json'))) {
    throw fail('NEEDS_LOGIN','Sign into NYU Brightspace in the paired Chrome profile, then try again.');
  }
  if(response.status===403) {
    // NYU can return 403 for both a signed-out session and a restricted activity.
    const checkSession=(url,options)=>fetcher(url,{...options,signal:AbortSignal.any([signal,options.signal])});
    try {await listBrightspaceSemesters(checkSession);}
    catch(error) {signal.throwIfAborted();if(error.code==='NEEDS_LOGIN') throw error;}
  }
  if([403,404].includes(response.status)) throw fail('ACCESS_DENIED','Brightspace did not grant access to this course activity. Check that you can open it in Brightspace.');
  if(response.status===429) throw fail('RATE_LIMITED','Brightspace is limiting requests. Wait a moment before retrying.');
  if(!response.ok) throw fail('FAILED',`Brightspace activity request failed (HTTP ${response.status}).`);
  return response.json();
}

function text(value,url,limit) {
  const {description,descriptionTruncated}=descriptionText(value,url);
  return {text:description.slice(0,limit),textTruncated:descriptionTruncated || description.length>limit};
}

function announcement(item,courseId,now) {
  const announcementId=String(item?.Id),name=title(item?.Title);
  if(!activityId(announcementId) || !name || item.IsHidden===true || item.IsPublished!==true) return null;
  const publishedAt=date(item.StartDate) || date(item.CreatedDate),end=date(item.EndDate);
  if(Date.parse(publishedAt)>now || Date.parse(end)<=now) return null;
  const sourceUrl=`${base}/d2l/lms/news/main.d2l?ou=${courseId}`;
  return {announcementId,title:name,publishedAt,updatedAt:date(item.LastModifiedDate),pinned:item.IsPinned===true,sourceUrl};
}

function assignment(item,courseId,now) {
  const assignmentId=String(item?.Id),name=title(item?.Name);
  if(!activityId(assignmentId) || !name || item.IsHidden===true) return null;
  const opensAt=date(item.Availability?.StartDate),closesAt=date(item.Availability?.EndDate);
  const restrictions=[Date.parse(opensAt)>now?item.Availability.StartDateAvailabilityType:null,Date.parse(closesAt)<=now?item.Availability.EndDateAvailabilityType:null];
  if(restrictions.includes(2)) return null;
  const detailsAvailable=!(Date.parse(opensAt)>now && item.Availability.StartDateAvailabilityType!==1) && !(Date.parse(closesAt)<=now && item.Availability.EndDateAvailabilityType!==1);
  return {assignmentId,title:name,dueAt:date(item.DueDate),opensAt,closesAt,detailsAvailable,sourceUrl:assignmentUrl(courseId,assignmentId)};
}

function attachment(item) {
  const fileId=String(item?.FileId),name=typeof item?.FileName==='string'?item.FileName.trim():'';
  if(!activityId(fileId) || !name || name.length>500) return null;
  const bytes=Number.isSafeInteger(item.Size) && item.Size>=0?item.Size:null;
  const format=documentFormat(`${base}/content/${encodeURIComponent(name.toWellFormed())}`);
  return {fileId,name,bytes,extension:format?.extension ?? null,cacheSupported:!!format && (bytes===null || bytes<=MAX_FILE_BYTES)};
}

function linkAttachment(item,sourceUrl) {
  try {
    if(typeof item?.Href!=='string' || !item.Href.trim() || item.Href.length>2000) return null;
    const url=new URL(item.Href,sourceUrl);
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) return null;
    return {title:title(item.LinkName),url:url.href};
  } catch {return null;}
}

export async function readCourseActivity(operation,args,{courseTitle,fetcher,token,signal,now=Date.now()}) {
  const {courseId,offset,limit,announcementId,assignmentId,fileId}=activityRequest(operation,args);
  const newsPath=`/d2l/api/le/1.82/${courseId}/news/`;
  if(operation==='get_announcement') {
    const item=await readJson(newsPath+announcementId,fetcher,signal),summary=announcement(item,courseId,now);
    if(summary?.announcementId!==announcementId) throw fail('ACCESS_DENIED','This announcement is not currently available in Brightspace.');
    return {announcement:{...summary,...text(item.Body,summary.sourceUrl,16000)}};
  }
  if(operation==='list_announcements' || operation==='list_assignments') {
    const isNews=operation==='list_announcements';
    const items=await readJson(isNews?newsPath:assignmentApiPath(courseId,''),fetcher,signal);
    if(!Array.isArray(items)) throw fail('FAILED','Brightspace returned an unsupported course activity list.');
    const visible=items.map(item=>({item,summary:(isNews?announcement:assignment)(item,courseId,now)})).filter(entry=>entry.summary);
    if(isNews) visible.sort(({summary:a},{summary:b})=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0) || b.announcementId.localeCompare(a.announcementId));
    else visible.sort(({summary:a},{summary:b})=>(Date.parse(a.dueAt)||Infinity)-(Date.parse(b.dueAt)||Infinity) || a.title.localeCompare(b.title));
    const page=visible.slice(offset,offset+limit).map(({item,summary})=>isNews?{...summary,...text(item.Body,summary.sourceUrl,800)}:summary);
    return {[isNews?'announcements':'assignments']:page,total:visible.length,nextOffset:offset+limit<visible.length?offset+limit:null};
  }
  const item=await readJson(assignmentApiPath(courseId,assignmentId),fetcher,signal),summary=assignment(item,courseId,now);
  if(summary?.assignmentId!==assignmentId) throw fail('ACCESS_DENIED','This assignment is not currently available in Brightspace.');
  const attachments=summary.detailsAvailable && Array.isArray(item.Attachments)?item.Attachments.map(attachment).filter(Boolean):[];
  if(operation==='get_assignment') {
    const links=summary.detailsAvailable && Array.isArray(item.LinkAttachments)?item.LinkAttachments:[];
    return {assignment:{...summary,...(summary.detailsAvailable?text(item.CustomInstructions,summary.sourceUrl,16000):{}),attachments:attachments.slice(0,40),attachmentsTruncated:attachments.length>40,links:links.slice(0,20).map(link=>linkAttachment(link,summary.sourceUrl)).filter(Boolean),linksTruncated:links.length>20}};
  }
  const file=attachments.find(entry=>entry.fileId===fileId);
  if(!file) throw fail('ACCESS_DENIED','This instructor attachment is not available for the selected assignment.');
  if(!file.cacheSupported) throw fail('UNSUPPORTED_FILE','Open this attachment in Brightspace. The local reader supports PDF, DOCX and PPTX files up to 50 MB.');
  const saved=await cacheDocumentMetadata({assignmentId,courseId,courseTitle,topicId:fileId,title:file.name,modulePath:['Assignments',summary.title],sourceUrl:assignmentAttachmentUrl(courseId,assignmentId,fileId)},token,fetcher,undefined,{signal});
  return {documentId:saved.id,source:saved.source};
}
