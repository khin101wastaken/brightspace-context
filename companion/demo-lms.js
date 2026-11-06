import {readFile} from 'node:fs/promises';

// This fixture is public local sample data, never a proxy to NYU or the vault.
const assets=new Map([
  ['demo.css','text/css'],['demo.js','text/javascript'],['index.html','text/html'],
  ['field-guide.pdf','application/pdf'],
  ['fair-experiment.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['observation-worksheet.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);
const semesterId='990001';
const courses=[{OrgUnitId:990101,Name:'Demo: Urban Garden Lab',TypeId:3},{OrgUnitId:990102,Name:'Demo: Research Methods',TypeId:3}];
const module=(id,title,modules=[],topics=[],description)=>({ModuleId:id,Title:title,Modules:modules,Topics:topics,...(description===undefined?{}:{Description:{Html:description}})});
const topic=(id,title,file,extra={})=>({TopicId:id,Title:title,TypeIdentifier:'File',Url:'/demo/content/'+file,LastModifiedDate:'2026-01-01T00:00:00Z',...extra});
export function demoOutline(courseId,revision=false) {
  if(courseId==='990101')return {Modules:[module(991001,'Fieldwork',[
    // No Description here: exercises the real module-detail fallback request.
    module(991002,'Week 1: Observation',[],[
      topic(992001,'Urban garden field guide','field-guide.pdf'),
      topic(992002,'Observation worksheet','observation-worksheet.docx'),
      topic(992004,'Locked sample reading','field-guide.pdf',{IsLocked:true}),
      ...(revision?[topic(992005,'New reading: updated field guide','field-guide.pdf')]:[]),
    ]),
  ],[],'<p>Start with the field guide, then complete the observation worksheet.</p>'),module(991003,'Reference links',[],[
    {TopicId:992006,Title:'Project source and support',TypeIdentifier:'Link',Url:'https://github.com/khin101wastaken/brightspace-context'},
  ],'<p>External links stay catalog-only. Locked files cannot be retrieved.</p>')]};
  if(courseId==='990102')return {Modules:[module(991101,'Experiment design',[],[
    topic(992101,'Designing a fair experiment','fair-experiment.pptx'),
  ],'<p>Read the slides. Compare the watering schedules while keeping soil, plants and sunlight comparable.</p>')]};
  return null;
}
export function createDemoLms() {
  let signedIn=true,revision=false;
  const reply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  return {async handle(req,res,url,host) {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    // The only public mutation changes in-memory fictional fixtures. Cross-site
    // requests cannot control it or access protected companion APIs.
    if(url.pathname==='/demo/control') {
      if(req.method!=='POST' || req.headers.origin!==`http://${host}` || req.headers['content-type']!=='application/json')return reply(res,403,{error:'Use the demo page controls on this computer.'});
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>512)return reply(res,413,{error:'Too large.'});}
      let value;try{value=JSON.parse(raw);}catch{return reply(res,400,{error:'Invalid JSON.'});}
      if(value.action==='sign-out')signedIn=false;
      else if(value.action==='sign-in')signedIn=true;
      else if(value.action==='add-reading')revision=true;
      else if(value.action==='reset'){signedIn=true;revision=false;}
      else return reply(res,400,{error:'Unknown demo action.'});
      return reply(res,200,{signedIn,revision});
    }
    if(!['GET','HEAD'].includes(req.method))return reply(res,405,{error:'Read-only demo route.'});
    if(url.pathname==='/demo/state')return reply(res,200,{signedIn,revision,semesterId,courses});
    if(url.pathname.startsWith('/demo/d2l/') || url.pathname.startsWith('/demo/content/')) {
      if(!signedIn)return reply(res,401,{error:'Simulated session expired. Choose Restore demo access on the demo LMS page.'});
      if(url.pathname==='/demo/d2l/le/manageCourses/api/mysemesters')return reply(res,200,[{OrgUnitId:Number(semesterId),Name:'Demo 2026 Fall'}]);
      if(url.pathname==='/demo/d2l/le/manageCourses/api/mycourses')return reply(res,200,{Courses:url.searchParams.get('parentOrgUnitIds')===semesterId?courses:[],Bookmark:null});
      const toc=url.pathname.match(/^\/demo\/d2l\/api\/le\/1\.82\/(\d+)\/content\/toc$/);
      if(toc){const outline=demoOutline(toc[1],revision);return reply(res,outline?200:404,outline??{error:'Demo course not found.'});}
      const detail=url.pathname.match(/^\/demo\/d2l\/api\/le\/1\.82\/990101\/content\/modules\/(\d+)$/);
      if(detail && detail[1]==='991002')return reply(res,200,{Id:991002,Type:0,Description:{Html:`<p>Meet at the east gate on Tuesday at 09:00. Bring a notebook, ruler and water bottle.</p><p>Read Urban Garden: Field Guide and use the Observation worksheet.</p>${revision?'<p>Update: a new field-guide reading has been added. Review it before the next visit.</p>':''}`}});
    }
    let name=null;
    if(['/demo','/demo/'].includes(url.pathname) || /^\/demo\/d2l\/le\/lessons\/(990101|990102)\/(units|topics)\/\d+$/.test(url.pathname))name='index.html';
    else if(['/demo/demo.css','/demo/demo.js'].includes(url.pathname))name=url.pathname.split('/').at(-1);
    else if(url.pathname.startsWith('/demo/content/'))name=url.pathname.slice('/demo/content/'.length);
    if(!assets.has(name))return reply(res,404,{error:'Demo page or file not found.'});
    const bytes=await readFile(new URL('./demo-assets/'+name,import.meta.url));
    res.writeHead(200,{'Content-Type':assets.get(name),'Content-Length':bytes.length,...(/\.(pdf|pptx|docx)$/.test(name)?{'Content-Disposition':`attachment; filename="${name}"`}:{})});
    res.end(req.method==='HEAD'?undefined:bytes);
  }};
}
