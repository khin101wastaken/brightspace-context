// Server-only, bounded reading of existing Office XML. No OCR or persistent text cache.
import {unzipSync,strFromU8} from 'fflate';
import {Parser} from 'htmlparser2';
import {textPage} from '../companion/text-page.js';

const MAX_XML=4*1024*1024,MAX_TOTAL_XML=16*1024*1024,MAX_TEXT=2*1024*1024;
function xmlText(bytes,{slide=false}={}) {
  const xml=strFromU8(bytes);
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Document XML declarations are not supported.');
  const prefix=slide?'a':'w',parts=[];let inText=0,ignored=0,length=0;
  const append=value=>{length+=value.length;if(length>MAX_TEXT)throw new Error('Document text exceeds the safe reading limit.');parts.push(value);};
  const ignore=new Set(['w:del','w:moveFrom','w:instrText']);
  new Parser({
    onopentag(name){if(ignore.has(name))ignored++;if(ignored)return;if(name===`${prefix}:t`)inText++;if(name==='w:tab')append('\t');if(name==='w:br' || name==='a:br')append('\n');},
    ontext(value){if(inText && !ignored)append(value);},
    onclosetag(name){
      if(ignore.has(name)){ignored--;return;}if(ignored)return;
      if(name===`${prefix}:t`)inText=Math.max(0,inText-1);
      if(name===`${prefix}:p` || name==='w:tr')append('\n');
      if(name==='w:tc')append('\t');
    },
  },{xmlMode:true,decodeEntities:true}).end(xml);
  return parts.join('').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

export function extractDocumentText(bytes,extension) {
  if(!['docx','pptx'].includes(extension))throw new Error('Text reading supports DOCX and PPTX only. For a PDF, use the original MCP resource with a PDF-capable host or request a download link. No OCR is performed.');
  let total=0,count=0;
  const files=unzipSync(bytes,{filter:entry=>{
    const selected=extension==='docx'?entry.name==='word/document.xml':/^ppt\/slides\/slide[1-9]\d*\.xml$/.test(entry.name) || ['ppt/presentation.xml','ppt/_rels/presentation.xml.rels'].includes(entry.name);
    if(!selected)return false;
    total+=entry.originalSize;count++;
    if(entry.originalSize>MAX_XML || total>MAX_TOTAL_XML || count>1000)throw new Error('Office XML exceeds the safe reading limit.');
    return true;
  }});
  let names=Object.keys(files);
  if(extension==='pptx') {
    const ids=[],relationships=new Map();
    const parse=(name,onopentag)=>{
      if(!files[name])throw new Error('Slide order metadata is missing.');
      const xml=strFromU8(files[name]);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Document XML declarations are not supported.');
      new Parser({onopentag},{xmlMode:true,decodeEntities:true}).end(xml);
    };
    parse('ppt/presentation.xml',(name,attrs)=>{if(name==='p:sldId')ids.push(attrs['r:id']);});
    parse('ppt/_rels/presentation.xml.rels',(name,attrs)=>{
      if(name==='Relationship' && attrs.Type?.endsWith('/slide')) {
        const target=attrs.Target?.replace(/^\/ppt\//,'');
        if(attrs.TargetMode==='External' || !/^slides\/slide[1-9]\d*\.xml$/.test(target || ''))throw new Error('Unsupported slide relationship.');
        relationships.set(attrs.Id,`ppt/${target}`);
      }
    });
    names=ids.map(id=>relationships.get(id));
    if(names.some(name=>!name || !files[name]))throw new Error('A referenced slide is missing.');
  }
  if(!names.length)throw new Error('No readable document body or slide XML was found.');
  const text=names.map((name,i)=>`${extension==='pptx'?`[Slide ${i+1}]\n`:''}${xmlText(files[name],{slide:extension==='pptx'})}`).join('\n\n');
  if(text.length>MAX_TEXT)throw new Error('Document text exceeds the safe reading limit.');
  return {text,coverage:extension==='docx'?'Main document body text and tables in XML order. Images, headers, footers, comments and embedded objects are not read; no OCR.':'Slide text in presentation order. Visual layout, notes, images and embedded objects are not read; no OCR.'};
}

export function documentTextPage(bytes,extension,{offset=0,limit=12000}={}) {
  const {text,coverage}=extractDocumentText(bytes,extension);
  return {...textPage(text,{offset,limit}),coverage};
}
