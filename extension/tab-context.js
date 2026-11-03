import {identifyUrl} from './catalog.js';

export async function captureTarget(tabs,{allowHome=false,tabId}={}) {
  if(tabId!==undefined && (!Number.isSafeInteger(tabId) || tabId<1)) throw new Error('Invalid source tab.');
  const tab = tabId===undefined?(await tabs.query({active:true,currentWindow:true}))[0]:await tabs.get(tabId);
  const identity = identifyUrl(tab?.url);
  if(allowHome && tab?.id && /^https:\/\/brightspace\.nyu\.edu\/d2l\/home\/?(?:[?#].*)?$/.test(tab.url)) return {tabId:tab.id,courseId:null,title:tab.title || 'Brightspace My Home'};
  if (!tab?.id || !identity?.courseId) throw new Error('Open a specific NYU Brightspace course in this tab, then reopen the extension.');
  return {tabId:tab.id, courseId:identity.courseId, title:tab.title || `Course ${identity.courseId}`};
}

export async function validateTarget(tabs, target) {
  const tab = await tabs.get(target.tabId);
  const identity = identifyUrl(tab.url);
  if (identity?.courseId !== target.courseId) throw new Error('The source tab changed course or needs sign-in. Reopen the extension from the course you want to scan.');
  return {tab, identity};
}

export function validateFrames(frames, courseId) {
  if (frames.some(f=>f.result?.courseId && f.result.courseId !== courseId)) {
    throw new Error('The source course changed during scanning. Reopen the extension and scan again.');
  }
  return frames.filter(f=>f.result?.courseId === courseId);
}
