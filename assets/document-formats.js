import {unzipSync,strFromU8} from 'fflate';

const formats={
  pdf:{extension:'pdf',mimeType:'application/pdf'},
  pptx:{extension:'pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',part:'ppt/presentation.xml',contentType:'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'},
  docx:{extension:'docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',part:'word/document.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'},
};
export const MAX_FILE_BYTES=50*1024*1024;
export function documentFormat(value,{provider='nyu'}={}) {
  try {
    const url=new URL(value),suffix=url.pathname.split('.').at(-1).toLowerCase();
    const valid=provider==='nyu'?url.origin==='https://brightspace.nyu.edu' && url.pathname.startsWith('/content/'):provider==='demo' && url.origin==='http://127.0.0.1:47653' && url.pathname.startsWith('/demo/content/');
    if(!valid || url.username || url.password || !Object.hasOwn(formats,suffix)) return null;
    return {...formats[suffix]};
  } catch {return null;}
}
export function validateDocument(bytes,format) {
  if(!(bytes instanceof Uint8Array) || bytes.length>MAX_FILE_BYTES) throw new Error('Document exceeds the 50 MB per-file limit.');
  const invalid=()=>Object.assign(new Error(format?.extension==='pdf'?'The response is not a PDF file.':'The response is not a valid PPTX or DOCX package of the requested type.'),{code:format?.extension==='pdf'?'INVALID_PDF':'INVALID_FILE'});
  if(!format || !Object.hasOwn(formats,format.extension)) throw invalid();
  if(format.extension==='pdf') {
    if(bytes.length<5 || strFromU8(bytes.subarray(0,5))!=='%PDF-') throw invalid();
    return;
  }
  // Read only package manifests. Never extract media or expand the document's
  // XML body, and never execute Office content. Bound declared archive sizes.
  try {
    if(bytes[0]!==0x50 || bytes[1]!==0x4b || bytes[2]!==3 || bytes[3]!==4) throw invalid();
    const names=new Set();let total=0,count=0;
    const manifests=unzipSync(bytes,{filter:entry=>{
      total+=entry.originalSize;
      if(++count>20000 || total>512*1024*1024 || names.has(entry.name) || /(?:^|\/)\.\.(?:\/|$)|\\|^\//.test(entry.name) || /(?:vbaProject\.bin|macroEnabled)/i.test(entry.name)) throw invalid();
      names.add(entry.name);
      const selected=['[Content_Types].xml','_rels/.rels'].includes(entry.name);
      if(selected && entry.originalSize>1024*1024) throw invalid();
      return selected;
    }});
    const types=manifests['[Content_Types].xml'],relationships=manifests['_rels/.rels'];
    if(!names.has(format.part) || !types || !relationships) throw invalid();
    const xml=strFromU8(types),rels=strFromU8(relationships);
    if(/<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject/i.test(xml+rels) || !xml.includes(format.contentType) || !xml.includes('/'+format.part) || !rels.includes('officeDocument')) throw invalid();
  } catch {throw invalid();}
}
