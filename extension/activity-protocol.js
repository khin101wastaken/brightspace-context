import {sourceConfig} from './sources.js';

export const activityCapability='course-activity';
export const activityResultLimit=256*1024;
export const activityTimeoutMs=50000;
export const activityId=value=>typeof value==='string' && /^\d{1,20}$/.test(value);

const parameters={
  list_announcements:['offset','limit'],
  get_announcement:['announcementId'],
  list_assignments:['offset','limit'],
  get_assignment:['assignmentId'],
  request_assignment_attachment:['assignmentId','fileId'],
};

export function activityRequest(operation,value) {
  if(!Object.hasOwn(parameters,operation) || !value || !activityId(value.courseId) || Object.keys(value).some(key=>key!=='courseId' && !parameters[operation].includes(key))) throw new Error('Use a synced course ID and valid course activity parameters.');
  if(parameters[operation][0]==='offset') {
    const {courseId,offset=0,limit=10}=value;
    if(!Number.isSafeInteger(offset) || offset<0 || !Number.isInteger(limit) || limit<1 || limit>20) throw new Error('Use a nonnegative offset and a limit from 1 to 20.');
    return {courseId,offset,limit};
  }
  if(!parameters[operation].every(key=>activityId(value[key]))) throw new Error('Use the announcement, assignment or attachment ID returned by Brightspace.');
  return value;
}

export const assignmentApiPath=(courseId,assignmentId)=>`/d2l/api/le/1.82/${courseId}/dropbox/folders/${assignmentId}`;
export const assignmentAttachmentUrl=(courseId,assignmentId,fileId)=>`${sourceConfig('nyu').base}${assignmentApiPath(courseId,assignmentId)}/attachments/${fileId}`;
export const assignmentUrl=(courseId,assignmentId)=>`${sourceConfig('nyu').base}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${assignmentId}&grpid=0&isprv=0&bp=0&ou=${courseId}`;

// Brightspace's attachment route carries IDs, so the declared file name supplies the format.
export function assignmentAttachmentFormat(metadata,provider,documentFormat) {
  if(provider!=='nyu' || ![metadata.courseId,metadata.assignmentId,metadata.topicId].every(activityId) || metadata.sourceUrl!==assignmentAttachmentUrl(metadata.courseId,metadata.assignmentId,metadata.topicId) || typeof metadata.title!=='string') return null;
  return documentFormat(`${sourceConfig('nyu').base}/content/${encodeURIComponent(metadata.title.toWellFormed())}`);
}
