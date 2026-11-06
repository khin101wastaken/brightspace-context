import path from 'node:path';
import {sourceConfig,sourceEndpoint} from '../extension/sources.js';
import {openVault} from '../companion/vault.js';
import {createHash} from 'node:crypto';
import {downloadableFile} from '../extension/file-downloads.js';
import {documentFormat} from '../extension/document-formats.js';
import {setTimeout as delay} from 'node:timers/promises';

export class LocalLibrary {
  constructor(directory,port=47653,provider='nyu') {
    sourceConfig(provider);this.provider=provider;this.port=port;
    if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid companion port.');
    this.directory=path.resolve(directory);this.url=`http://127.0.0.1:${port}`;
  }
  forProvider(provider='nyu') {
    sourceConfig(provider);this.scopes??=new Map([[this.provider,this]]);
    if(!this.scopes.has(provider)){const scoped=new LocalLibrary(this.directory,this.port,provider);scoped.scopes=this.scopes;this.scopes.set(provider,scoped);}
    return this.scopes.get(provider);
  }
  async request(endpoint,binary=false,{method='GET',body}={}) {
    let pairing;
    try {this.vault??=openVault(this.directory);pairing=await (await this.vault).readJson('pairing.json');}
    catch {throw new Error('Pair the Chrome extension with the local companion before using Brightspace tools.');}
    if(!/^chrome-extension:\/\/[a-p]{32}$/.test(pairing.origin) || !/^[a-f0-9]{64}$/.test(pairing.token)) throw new Error('Invalid local pairing configuration. Reconnect the extension.');
    let response;
    try {response=await fetch(this.url+sourceEndpoint(endpoint,this.provider),{method,headers:{Origin:pairing.origin,Authorization:`Bearer ${pairing.token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}
    catch {throw new Error('The local companion is unavailable. Open Brightspace Context Companion from the Start menu, or run npm run companion from the source project.');}
    if(!response.ok) {
      let error;try {error=(await response.json()).error;} catch {}
      throw new Error(error || `Companion request failed (HTTP ${response.status}).`);
    }
    return binary?Buffer.from(await response.arrayBuffer()):response.json();
  }
  async list({query='',courseId,offset=0,limit=25}={}) {
    if(typeof query!=='string' || query.length>500 || (courseId!=null && !/^\d+$/.test(courseId)) || !Number.isInteger(offset) || offset<0 || !Number.isInteger(limit) || limit<1 || limit>100) throw new Error('Invalid catalog search parameters.');
    const {documents}=await this.request('/v1/cache/documents');
    const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches=documents.filter(d=>(!courseId || d.courseId===courseId) && terms.every(term=>[d.title,d.courseTitle,...d.modulePath].join(' ').toLowerCase().includes(term)));
    matches.sort((a,b)=>a.courseTitle.localeCompare(b.courseTitle) || a.modulePath.join('/').localeCompare(b.modulePath.join('/')) || a.title.localeCompare(b.title));
    return {documents:matches.slice(offset,offset+limit).map(d=>({id:d.id,title:d.title,courseId:d.courseId,courseTitle:d.courseTitle,modulePath:d.modulePath,bytes:d.bytes,lastModifiedAt:d.lastModifiedAt,mimeType:documentFormat(d.sourceUrl,{provider:this.provider})?.mimeType,extension:documentFormat(d.sourceUrl,{provider:this.provider})?.extension})),total:matches.length,nextOffset:offset+limit<matches.length?offset+limit:null,coverage:'cached PDF, PPTX and DOCX files only; search covers metadata, not document text'};
  }
  catalogParams({query='',courseId,semesterId,offset=0,limit=25}={}) {
    if(typeof query!=='string' || query.length>500 || (courseId!=null && (typeof courseId!=='string' || !/^\d+$/.test(courseId))) || (semesterId!=null && (typeof semesterId!=='string' || !/^\d+$/.test(semesterId))) || !Number.isInteger(offset) || offset<0 || !Number.isInteger(limit) || limit<1 || limit>100) throw new Error('Invalid catalog search parameters.');
    return {query,courseId,semesterId,offset,limit};
  }
  async courses(args={}) {
    const {query,semesterId,offset,limit}=this.catalogParams(args),catalog=await this.request('/v1/catalog');
    const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean),courses=[];
    for(const semester of catalog.semesters) if(!semesterId || semester.semesterId===semesterId) {
      for(const course of semester.courses) if(terms.every(term=>`${course.title} ${semester.title}`.toLowerCase().includes(term))) courses.push({courseId:course.courseId,title:course.title,semesterId:semester.semesterId,semesterTitle:semester.title,status:course.status,stale:course.stale===true,error:course.error || null,lastScannedAt:course.lastScannedAt || null,entries:course.entries?.length ?? 0});
    }
    const semesters=new Map(catalog.semesters.map(s=>[s.semesterId,{semesterId:s.semesterId,title:s.title,updatedAt:s.updatedAt,hasSavedCatalog:true}]));
    for(const semester of catalog.availableSemesters || []) semesters.set(semester.semesterId,{...semesters.get(semester.semesterId),...semester,available:true,hasSavedCatalog:semesters.has(semester.semesterId),discoveredAt:catalog.discoveredAt});
    return {semesters:[...semesters.values()],courses:courses.slice(offset,offset+limit),total:courses.length,nextOffset:offset+limit<courses.length?offset+limit:null,coverage:'Saved course outlines and the latest discovered semester list. Use request_catalog_sync without semesterId to discover semesters, or with semesterId to refresh one semester through Chrome. Failed courses may have older outlines; dates and status show freshness.'};
  }
  async searchCatalog(args={}) {
    const {query,courseId,semesterId,offset,limit}=this.catalogParams(args);
    const [catalog,{documents}]=await Promise.all([this.request('/v1/catalog'),this.request('/v1/cache/documents')]);
    const cached=new Map(documents.map(d=>[d.id,d])),terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean),entries=[];
    for(const semester of catalog.semesters) if(!semesterId || semester.semesterId===semesterId) {
      for(const course of semester.courses) if(!courseId || course.courseId===courseId) {
        const byKey=new Map((course.entries || []).map(e=>[e.key,e]));
        for(const entry of course.entries || []) {
          const modulePath=[];
          for(let parent=byKey.get(entry.parentKey);parent;parent=byKey.get(parent.parentKey)) modulePath.unshift(parent.title);
          if(!terms.every(term=>[course.title,semester.title,entry.title,entry.description,...modulePath].join(' ').toLowerCase().includes(term))) continue;
          const file=downloadableFile(entry,{provider:this.provider}),format=file && documentFormat(file.url,{provider:this.provider});
          const id=entry.kind==='document'?createHash('sha256').update(`${course.courseId}:${entry.id}`).digest('hex'):null;
          const candidate=id && cached.get(id),fresh=!!candidate && candidate.sourceUrl===file?.url && candidate.lastModifiedAt===(entry.lastModifiedAt || null) && (candidate.lastModifiedAt || Date.now()-candidate.fetchedAt<5*60*1000);
          entries.push({courseId:course.courseId,courseTitle:course.title,semesterId:semester.semesterId,semesterTitle:semester.title,key:entry.key,parentKey:entry.parentKey,title:entry.title,kind:entry.kind,contentType:entry.contentType,modulePath,url:entry.url,lastModifiedAt:entry.lastModifiedAt,outlineScannedAt:course.lastScannedAt,outlineStale:course.stale===true,locked:entry.locked,
            description:entry.description || '',descriptionStatus:entry.descriptionStatus || (entry.description?'synced':'not_synced'),descriptionTruncated:entry.descriptionTruncated===true,
            cacheSupported:!!format,mimeType:format?.mimeType || null,extension:format?.extension || null,cachedDocumentId:fresh?id:null,availability:entry.kind==='module'?(entry.description?'module landing-page text included; cite url':'module metadata only; no landing-page text available'):fresh?'cache entry present; verify with get_cached_document':format?'not cached; use request_document with courseId and key':'catalog only; retrieval not supported'});
        }
      }
    }
    return {entries:entries.slice(offset,offset+limit),total:entries.length,nextOffset:offset+limit<entries.length?offset+limit:null,coverage:'Saved catalog, including uncached resources and module landing-page descriptions. Descriptions are source text, not PDF contents; cite each entry url and check outlineScannedAt, outlineStale, descriptionStatus and descriptionTruncated. Does not search PDF contents or download files. For a course hierarchy, pass courseId with no query and follow pagination; parentKey and modulePath preserve nesting.'};
  }
  async requestDocument({courseId,key,retry=false,waitSeconds=10}={}) {
    this.checkWait(waitSeconds);
    if(typeof courseId!=='string' || !/^\d+$/.test(courseId) || typeof key!=='string' || !/^document:\d+$/.test(key) || typeof retry!=='boolean') throw new Error('Use courseId and a document key from search_catalog.');
    const result=await this.request('/v1/requests',false,{method:'POST',body:{courseId,key,retry}});
    return this.waitForDocument(result,waitSeconds);
  }
  async requestCatalogSync({semesterId,retry=false,waitSeconds=10}={}) {
    this.checkWait(waitSeconds);
    if((semesterId!=null && (typeof semesterId!=='string' || !/^\d+$/.test(semesterId))) || typeof retry!=='boolean') throw new Error('Use an optional semesterId returned by discovery or list_courses.');
    const result=await this.request('/v1/requests/catalog-sync',false,{method:'POST',body:{...(semesterId!=null?{semesterId}:{}),retry}});
    return this.waitForCatalogSync(result,waitSeconds);
  }
  async getCatalogSync({requestId,waitSeconds=10}={}) {
    this.checkWait(waitSeconds);
    if(typeof requestId!=='string' || !/^[a-f0-9-]{36}$/.test(requestId)) throw new Error('Use a requestId returned by request_catalog_sync.');
    return this.waitForCatalogSync(await this.request(`/v1/requests/${requestId}`),waitSeconds);
  }
  async waitForCatalogSync(result,seconds) {
    if(result.kind!=='catalog-sync') throw new Error('This request is not a catalog sync.');
    const deadline=Date.now()+seconds*1000;
    while(['queued','fetching'].includes(result.state) && result.workerConnected && Date.now()<deadline) {
      await delay(Math.min(1000,deadline-Date.now()));result=await this.request(`/v1/requests/${result.requestId}`);
    }
    if(result.state==='ready' && result.scope==='discovery') {
      const catalog=await this.request('/v1/catalog');
      return {...result,semesters:catalog.availableSemesters || [],semestersDiscoveredAt:catalog.discoveredAt};
    }
    return result;
  }
  checkWait(seconds) {if(!Number.isInteger(seconds) || seconds<0 || seconds>20) throw new Error('waitSeconds must be an integer from 0 to 20.');}
  async getRequest({requestId,waitSeconds=10}={}) {
    this.checkWait(waitSeconds);
    if(typeof requestId!=='string' || !/^[a-f0-9-]{36}$/.test(requestId)) throw new Error('Use a request ID returned by request_document.');
    return this.waitForDocument(await this.request(`/v1/requests/${requestId}`),waitSeconds);
  }
  async waitForDocument(result,seconds) {
    const deadline=Date.now()+seconds*1000;
    while(['queued','fetching'].includes(result.state) && result.workerConnected && Date.now()<deadline) {
      await delay(Math.min(1000,deadline-Date.now()));result=await this.request(`/v1/requests/${result.requestId}`);
    }
    if(result.state==='ready') return {...result,document:await this.get(result.documentId),readingRequired:'Read the MCP resource bytes before answering. The cache is encrypted and no localPath is created by default. If the client requires a local file, the user must enable temporary exports in extension Settings, then explicitly request export_document. Metadata is not document content.'};
    return result;
  }
  validId(id) {if(typeof id!=='string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Use a document ID returned by list_cached_documents.');return id;}
  async get(id) {
    this.validId(id);
    const {document}=await this.request(`/v1/cache/documents/${id}`);
    const format=documentFormat(document.sourceUrl,{provider:this.provider});
    if(!format) throw new Error('Unsupported cached document format.');
    return {...document,provider:this.provider,uri:`brightspace-cache://${this.provider==='demo'?'demo/':''}documents/${id}`,encryptedAtRest:true,handoff:'MCP resource bytes; no plaintext file created',mimeType:format.mimeType,extension:format.extension,sourceUrl:`${sourceConfig(this.provider).base}/d2l/le/lessons/${document.courseId}/topics/${document.topicId}`};
  }
  async exportDocument({id,acknowledgePlaintext}={}) {
    this.validId(id);if(acknowledgePlaintext!==true)throw new Error('Explicitly acknowledge the temporary unencrypted file export.');
    return this.request('/v1/cache/exports',false,{method:'POST',body:{id,acknowledgePlaintext:true}});
  }
  async readResource(uri) {
    if(this.provider==='nyu' && /^brightspace-cache:\/\/demo\/documents\/[a-f0-9]{64}$/.test(uri))return this.forProvider('demo').readResource(uri);
    const pattern=this.provider==='demo'?/^brightspace-cache:\/\/demo\/documents\/([a-f0-9]{64})$/:/^brightspace-cache:\/\/documents\/([a-f0-9]{64})$/;
    const id=uri?.match(pattern)?.[1];
    this.validId(id);
    const document=await this.get(id);
    if(document.bytes>10*1024*1024) throw new Error('This document exceeds the 10 MB embedded resource limit. If the user needs a local copy, enable temporary exports in extension Settings and explicitly use export_document. No plaintext path was created.');
    const bytes=await this.request(`/v1/cache/files/${id}`,true);
    return {contents:[{uri,mimeType:document.mimeType,blob:bytes.toString('base64')}]};
  }
}
