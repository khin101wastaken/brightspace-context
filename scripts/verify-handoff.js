import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const client=new Client({name:'brightspace-handoff-check',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../mcp/start.js',import.meta.url))],
  env:Object.fromEntries(['BRIGHTSPACE_CACHE_DIR','BRIGHTSPACE_COMPANION_PORT'].filter(key=>process.env[key]).map(key=>[key,process.env[key]])),stderr:'inherit'});
try {
  await client.connect(transport);
  const listed=await client.callTool({name:'list_cached_documents',arguments:{query:process.argv.slice(2).join(' '),limit:1}});
  if(listed.isError) throw new Error(listed.content[0].text);
  const {documents}=JSON.parse(listed.content[0].text);
  if(!documents.length) throw new Error('No matching cached document. Cache a supported file in Chrome first.');
  const prepared=await client.callTool({name:'get_cached_document',arguments:{id:documents[0].id}});
  if(prepared.isError) throw new Error(prepared.content[0].text);
  const file=JSON.parse(prepared.content[0].text);
  let binaryResourceVerified=false;
  if(file.bytes<=10*1024*1024) {
    const resource=await client.readResource({uri:file.uri});
    const bytes=Buffer.from(resource.contents[0].blob,'base64');
    binaryResourceVerified=bytes.length===file.bytes && createHash('sha256').update(bytes).digest('hex')===file.sha256;
    if(!binaryResourceVerified) throw new Error('MCP document bytes did not match the cached checksum.');
  }
  let textPagesVerified=0,textCharacters=0;
  if(['pdf','docx','pptx'].includes(file.extension)) {
    let offset=0;
    do {
      const response=await client.callTool({name:'read_document_text',arguments:{id:file.id,offset,sha256:file.sha256}});
      if(response.isError)throw new Error(response.content[0].text);
      const page=JSON.parse(response.content[0].text);textCharacters+=page.text.length;textPagesVerified++;offset=page.nextOffset;
      if(offset===null && textCharacters!==page.totalCharacters)throw new Error('Text pages did not cover the complete extracted text.');
    }while(offset!==null);
  }
  console.log(JSON.stringify({title:file.title,course:file.courseTitle,modulePath:file.modulePath,bytes:file.bytes,binaryResourceVerified,textPagesVerified,textCharacters,sourceUrl:file.sourceUrl,note:'SDK transport and available document text pages verified without a plaintext export. This does not prove that a particular ChatGPT host rendered a file attachment or hyperlink.'},null,2));
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await client.close();}
