import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const client=new Client({name:'brightspace-handoff-check',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../mcp/start.js',import.meta.url))],
  ...(process.env.BRIGHTSPACE_CACHE_DIR?{env:{BRIGHTSPACE_CACHE_DIR:process.env.BRIGHTSPACE_CACHE_DIR}}:{}),stderr:'inherit'});
try {
  await client.connect(transport);
  const listed=await client.callTool({name:'list_cached_documents',arguments:{query:process.argv.slice(2).join(' '),limit:1}});
  if(listed.isError) throw new Error(listed.content[0].text);
  const {documents}=JSON.parse(listed.content[0].text);
  if(!documents.length) throw new Error('No matching cached PDF. Cache a PDF in Chrome first.');
  const prepared=await client.callTool({name:'get_cached_document',arguments:{id:documents[0].id}});
  if(prepared.isError) throw new Error(prepared.content[0].text);
  const file=JSON.parse(prepared.content[0].text);
  const localBytes=await readFile(file.localPath);
  if(createHash('sha256').update(localBytes).digest('hex')!==file.sha256) throw new Error('Local PDF did not match the cached checksum.');
  let binaryResourceVerified=false;
  if(file.bytes<=10*1024*1024) {
    const resource=await client.readResource({uri:file.uri});
    binaryResourceVerified=Buffer.from(resource.contents[0].blob,'base64').equals(localBytes);
    if(!binaryResourceVerified) throw new Error('MCP PDF bytes did not match the local file.');
  }
  console.log(JSON.stringify({title:file.title,course:file.courseTitle,modulePath:file.modulePath,localPath:file.localPath,bytes:file.bytes,binaryResourceVerified,sourceUrl:file.sourceUrl,note:'Transport verified. A ChatGPT host still needs to read the actual PDF to answer content questions.'},null,2));
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await client.close();}
