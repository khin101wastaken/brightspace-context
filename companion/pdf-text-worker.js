import {parentPort,workerData} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import DOMMatrix from './pdf-matrix.js';
import {textPage} from './text-page.js';

globalThis.DOMMatrix=DOMMatrix;
// All inputs and support assets are local. Never resolve a document-controlled URL.
globalThis.fetch=()=>Promise.reject(new Error('Network access is disabled in the PDF text reader.'));
let task;
try {
  const {getDocument}=await import('./pdfjs/pdf.mjs');
  task=getDocument({data:workerData.bytes,verbosity:0,isEvalSupported:false,useWasm:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,stopAtErrors:true,enableXfa:false,
    cMapUrl:fileURLToPath(new URL('./pdfjs/cmaps/',import.meta.url)).replaceAll('\\','/'),cMapPacked:true,standardFontDataUrl:fileURLToPath(new URL('./pdfjs/standard_fonts/',import.meta.url)).replaceAll('\\','/')});
  const document=await task.promise;
  if(document.numPages>500)throw new Error('PDF exceeds the 500-page text reading limit. Use the original download.');
  const parts=[],emptyTextPages=[];let total=0;
  for(let n=1;n<=document.numPages;n++) {
    const page=await document.getPage(n);let text='';
    // Stream items to enforce the text budget before accumulating a huge page.
    const reader=page.streamTextContent().getReader();
    try {while(true){const {done,value}=await reader.read();if(done)break;for(const item of value.items){if(typeof item.str!=='string')continue;const value=item.str+(item.hasEOL?'\n':' ');total+=value.length;if(total>2*1024*1024)throw new Error('PDF text exceeds the 2 MB reading limit. Use the original download.');text+=value;}}}
    finally{await reader.cancel().catch(()=>{});page.cleanup();}
    if(!text.trim())emptyTextPages.push(n);
    parts.push(`[Page ${n}]\n${text.trim()}`);
  }
  const text=parts.join('\n\n');
  if(text.length>2*1024*1024)throw new Error('PDF text exceeds the 2 MB reading limit.');
  parentPort.postMessage({result:{...textPage(text,workerData.options),pages:document.numPages,emptyTextPages,coverage:'Existing PDF text layer, in PDF content order with page markers. Layout, equations, tables and reading order may require visual inspection. Images are not read; no OCR. emptyTextPages lists pages with no extractable text.',temporaryFileCreated:false}});
}catch(error){
  const known=/limit|offset|Offset|character/.test(error.message || '');
  parentPort.postMessage({error:error.name==='PasswordException'?'This PDF requires a password; text reading does not request or store passwords. Use the original download.':known?error.message:'The verified original could not be read as PDF text. It may be malformed or use unsupported features; this does not by itself mean the cached file is truncated. Use a download link to inspect it.'});
}finally{await task?.destroy().catch(()=>{});}
