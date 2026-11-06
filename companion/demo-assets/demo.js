const courses=document.getElementById('courses'),feedback=document.getElementById('feedback');
const json=async url=>{const response=await fetch(url);if(!response.ok)throw new Error(`Demo access unavailable (HTTP ${response.status}). Restore demo access above.`);return response.json();};
function note(html){const box=document.createElement('div');box.className='notes';/* Only packaged synthetic prose; never inject fetched markup. */const plain=new DOMParser().parseFromString(html,'text/html');for(const p of plain.body.querySelectorAll('p')){const text=document.createElement('p');text.textContent=p.textContent;box.append(text);}return box;}
async function renderModule(module,courseId){
  const row=document.createElement('details');row.open=true;
  const title=document.createElement('summary');title.textContent=module.Title;row.append(title);
  const description=module.Description??(await json(`/demo/d2l/api/le/1.82/${courseId}/content/modules/${module.ModuleId}`)).Description;
  if(description)row.append(note(description.Html));
  for(const child of module.Modules)row.append(await renderModule(child,courseId));
  const files=document.createElement('ul');files.className='files';
  for(const topic of module.Topics){const li=document.createElement('li'),kind=document.createElement('small');kind.textContent=topic.TypeIdentifier==='File'?topic.Url.split('.').at(-1).toUpperCase():'LINK';li.append(kind);if(topic.IsLocked){li.append(topic.Title+' · Locked sample');li.className='locked';}else{const a=document.createElement('a');a.textContent=topic.Title;a.href=topic.Url;if(topic.TypeIdentifier==='File')a.download='';else{a.target='_blank';a.rel='noopener noreferrer';}li.append(a);}files.append(li);}row.append(files);return row;
}
async function refresh(){
  courses.replaceChildren();const state=await json('/demo/state');
  document.getElementById('access').textContent=`${state.signedIn?'Demo access ready':'Demo access expired'}${state.revision?' · Reading added':''}`;
  if(!state.signedIn){const p=document.createElement('p');p.textContent='Demo session expired. Restore demo access to browse or sync the fictional courses.';courses.append(p);return;}
  for(const course of state.courses){const section=document.createElement('article');section.className='course';const h=document.createElement('h3');h.textContent=course.Name;section.append(h);const outline=await json(`/demo/d2l/api/le/1.82/${course.OrgUnitId}/content/toc`);for(const module of outline.Modules)section.append(await renderModule(module,course.OrgUnitId));courses.append(section);}
}
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;try{const response=await fetch('/demo/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:button.dataset.action})});if(!response.ok)throw new Error('Could not change the demo state.');feedback.textContent=button.dataset.action==='add-reading'?'Sample reading added. Sync the demo semester again to see the change.':button.dataset.action==='sign-out'?'Demo access expired. Test an uncached retrieval or fresh sync.':button.dataset.action==='reset'?'Sample content reset. Sync again to refresh the saved catalog.':'Demo access restored. Retry the blocked request.';await refresh();}catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}
}));
refresh().catch(error=>{feedback.textContent=error.message;});
