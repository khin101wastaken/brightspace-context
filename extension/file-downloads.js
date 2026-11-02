const ORIGIN='https://brightspace.nyu.edu';
const SUPPORTED=/\.(pdf|docx?|pptx?|xlsx?|csv|txt|md|rtf|png|jpe?g|gif|webp|zip)$/i;

export function downloadableFile(entry) {
  if(entry?.contentType!=='file' || entry.locked) return null;
  try {
    const url=new URL(entry.sourceUrl);
    if(url.origin!==ORIGIN || !url.pathname.startsWith('/content/') || url.username || url.password) return null;
    const name=decodeURIComponent(url.pathname.split('/').at(-1));
    return SUPPORTED.test(name)?{url:url.href,name}:null;
  } catch {return null;}
}

function segment(value) {
  let name=String(value).normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,70).replace(/[.\s]+$/g,'');
  if(!name) name='Untitled';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name='_'+name;
  return name;
}

export function downloadPlan(catalog,key) {
  const entry=catalog?.entries.find(e=>e.key===key), file=downloadableFile(entry);
  if(!file) throw new Error('This item is not a supported Brightspace-hosted file. Open it in Brightspace instead.');
  const byKey=new Map(catalog.entries.map(e=>[e.key,e])), folders=[], seen=new Set([key]);
  for(let parent=byKey.get(entry.parentKey);parent;parent=byKey.get(parent.parentKey)) {
    if(seen.has(parent.key)) throw new Error('Invalid module hierarchy. Rescan the course.');
    seen.add(parent.key);folders.unshift(segment(parent.title));
  }
  const dot=file.name.lastIndexOf('.');
  const name=`${segment(file.name.slice(0,dot))} [${segment(entry.id)}]${file.name.slice(dot).toLowerCase()}`;
  return {url:file.url,filename:['Brightspace',segment(catalog.title || `Course ${catalog.courseId}`),...folders,name].join('/')};
}

export function validateFileResponse(response) {
  if(response.status===401 || response.status===403 || response.redirected) throw new Error('Sign into Brightspace again, then retry the download.');
  if(!response.ok) throw new Error(`File unavailable (HTTP ${response.status}).`);
  const type=response.headers.get('content-type') || '';
  if(/text\/html|application\/xhtml/i.test(type)) throw new Error('Brightspace returned a web page instead of the file. Sign in again or open the item in Brightspace.');
}

export function downloadState(item) {
  if(item.error) {
    if(item.error==='USER_CANCELED') return {state:'canceled',error:item.error,message:'Chrome canceled the download (USER_CANCELED). Try Save as… if no dialog appeared.'};
    const explanations={
      USER_SHUTDOWN:'The browser closed before the download finished.',
      FILE_FAILED:'Chrome could not save the file.',
      FILE_ACCESS_DENIED:'Chrome could not write to the selected download folder.',
      FILE_NAME_TOO_LONG:'The course/module folder path is too long to save.',
      FILE_NO_SPACE:'There is not enough space in the download location.',
      SERVER_UNAUTHORIZED:'Brightspace requires you to sign in again.',
      SERVER_FORBIDDEN:'Brightspace denied the download request.',
      NETWORK_FAILED:'The file transfer failed on the network.',
      SERVER_FAILED:'The file server failed to complete the download.',
      FILE_BLOCKED:'Chrome or a device policy blocked this file. Check Chrome Downloads.',
    };
    return {state:'failed',error:item.error,message:`${explanations[item.error] || 'Chrome interrupted the download.'} (${item.error})`};
  }
  if(item.state==='interrupted') return {state:'failed',message:'Download interrupted. Retry from the catalog.'};
  if(item.state==='complete') {
    let origin;
    try {origin=new URL(item.finalUrl || item.url).origin;} catch {origin=null;}
    if(origin!==ORIGIN || /text\/html|application\/xhtml/i.test(item.mime || '')) return {state:'failed',message:'Unexpected file response. Check Chrome Downloads and sign into Brightspace again.'};
    return {state:'complete',message:'Saved'};
  }
  return {state:'in_progress',message:'Downloading…'};
}
