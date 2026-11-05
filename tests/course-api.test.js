import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenOutline,filterOutline} from '../extension/course-api.js';
import {readCourseOutline} from '../extension/brightspace-client.js';
import {descriptionText} from '../extension/rich-text.js';
import {mergeCatalog} from '../extension/catalog.js';

const topic=(id,title,order=1)=>({TopicId:id,Title:title,SortOrder:order,TypeIdentifier:'File',Url:'/content/test.pdf',Description:{Text:'Congestion control'}});
const module=(id,title,modules=[],topics=[],order=1)=>({ModuleId:id,Title:title,Modules:modules,Topics:topics,SortOrder:order});
test('full ToC recursively preserves nested hierarchy and mixed module/topic order',()=>{
  const entries=flattenOutline({Modules:[module(10,'Networking',[module(20,'Transport',[],[topic(21,'TCP')],2)],[topic(11,'Overview',1)])]},'100');
  assert.deepEqual(entries.map(e=>e.key),['module:10','document:11','module:20','document:21']);
  assert.equal(entries.at(-1).parentKey,'module:20');
  assert.equal(entries.at(-1).sourceUrl,'https://brightspace.nyu.edu/content/test.pdf');
  assert.equal(entries.at(-1).contentType,'file');
});
test('complete snapshots replace stale DOM catalog entries, including removed items',()=>{
  const result=mergeCatalog({courseId:'100',entries:[{key:'document:999'}]},{courseId:'100',coverage:'full-toc',entries:[]});
  assert.equal(result.entries.length,0); assert.equal(result.coverage,'full-toc');
});
test('metadata search retains ancestors and searches module paths and descriptions',()=>{
  const entries=flattenOutline({Modules:[module(10,'Networks',[],[topic(11,'Lecture')])]},'100');
  assert.deepEqual(filterOutline(entries,'congestion').map(e=>e.key),['module:10','document:11']);
  assert.equal(filterOutline(entries,'Networks Lecture').length,2);
  assert.equal(filterOutline(entries,'unmatched').length,0);
});
test('rejects malformed trees and unsafe links; excludes hidden branches',()=>{
  assert.throws(()=>flattenOutline({Modules:[{ModuleId:1}]},'100'),/missing nested/);
  assert.throws(()=>flattenOutline({Modules:[module(1,'A'),module(1,'B')]},'100'),/duplicate/);
  const entries=flattenOutline({Modules:[module(10,'Visible',[],[{...topic(11,'Bad URL'),Url:'javascript:alert(1)'}]),{...module(20,'Hidden'),IsHidden:true}]},'100');
  assert.equal(entries.length,2);assert.equal(entries[1].sourceUrl,null);
});
test('session request uses the fixed course endpoint and rejects HTML, auth and throttling errors',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'https://brightspace.nyu.edu/d2l/api/le/1.82/100/content/toc');
    assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');
    return new Response(JSON.stringify({Modules:[]}),{headers:{'content-type':'application/json'}});
  });
  // location is available in the injected browser function, but not Node.
  globalThis.location={origin:'https://brightspace.nyu.edu'};
  try {
    assert.deepEqual(await readCourseOutline('100'),{Modules:[]});
    for(const [response,expected] of [
      [new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}}),/sign-in page/],
      [new Response('',{status:401}),/Sign into/],
      [new Response('',{status:403}),/denied/],
      [new Response('',{status:429}),/limiting/],
    ]) {t.mock.method(globalThis,'fetch',async()=>response);await assert.rejects(readCourseOutline('100'),expected);}
    await assert.rejects(readCourseOutline('../other'),/Invalid course ID/);
  } finally {delete globalThis.location;}
});

test('landing HTML preserves readings, film titles, paragraphs, links and entities as plain text',()=>{
  const html='<p><strong>Reading:</strong></p><ul><li>Dahl RE. Adolescent brain development &amp; opportunities.</li><li><a href="https://example.com/reading?a=1&amp;b=2" title="x > y">Do Your Friends Actually Like You?</a></li></ul><p>Film:<br>&ldquo;Me, Earl and the Dying Girl&rdquo; (&copy; 2015)</p>';
  const value=descriptionText({Html:html,Text:''},'https://brightspace.nyu.edu/d2l/home/100');
  assert.match(value.description,/Reading:\n/);assert.match(value.description,/• Dahl RE.* & opportunities/);
  assert.match(value.description,/Do Your Friends Actually Like You\? \(https:\/\/example.com\/reading\?a=1&b=2\)/);
  assert.match(value.description,/Film:\n“Me, Earl and the Dying Girl” \(© 2015\)/);
  assert.equal(value.descriptionTruncated,false);
  const entries=flattenOutline({Modules:[{...module(10,'Topic 9'),Description:{Html:html}}]},'100');
  assert.equal(filterOutline(entries,'Dahl opportunities')[0].key,'module:10');
});

test('landing text ignores executable/hidden markup and unsafe destinations without creating a DOM',()=>{
  const {description}=descriptionText({Html:'<style>secret-style</style><script>secret-script</script><iframe src="https://example.com">secret-frame</iframe><p hidden>secret-hidden<span>also-hidden</span></p><p>Visible <a href="javascript:alert(1)">citation</a><img src="https://example.com/image" alt="Film poster"></p><a href="/content/reference.html">Reference</a>'},'https://brightspace.nyu.edu/d2l/home/100');
  assert.doesNotMatch(description,/secret|javascript|src=|<p>|also-hidden/);
  assert.match(description,/Visible citationFilm poster/);assert.match(description,/Reference \(https:\/\/brightspace.nyu.edu\/content\/reference.html\)/);
});

test('text-only, missing and oversized descriptions remain bounded with explicit truncation',()=>{
  assert.deepEqual(descriptionText(null),{description:'',descriptionTruncated:false});
  assert.equal(descriptionText({Text:'Reading:\nDahl RE.'}).description,'Reading:\nDahl RE.');
  const long=descriptionText({Text:'x'.repeat(16001)});assert.equal(long.description.length,16000);assert.equal(long.descriptionTruncated,true);
});
