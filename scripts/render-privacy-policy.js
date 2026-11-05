import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=text=>escape(text).replace(/`([^`]+)`/g,'<code>$1</code>').replaceAll('khinaungwrk@gmail.com','<a href="mailto:khinaungwrk@gmail.com">khinaungwrk@gmail.com</a>');
const markdown=await readFile(path.join(root,'store/privacy-policy.md'),'utf8');
if(/\[(?:PUBLIC|PUBLISHER|SUPPORT)/.test(markdown)) throw new Error('Unfilled policy placeholder.');
const content=markdown.trim().split(/\r?\n\s*\r?\n/).map(block=>{
  if(block.startsWith('# ')) return `<h1>${inline(block.slice(2))}</h1>`;
  if(block.startsWith('## ')) return `<h2>${inline(block.slice(3))}</h2>`;
  return `<p>${block.split(/\r?\n/).map(inline).join('<br>')}</p>`;
}).join('\n');
const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="How Brightspace Context handles course resources, local storage, companion pairing and optional AI-client access.">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'">
<title>Brightspace Context · Privacy Policy</title>
<style>:root{font:16px/1.75 system-ui,-apple-system,Segoe UI,sans-serif;color:#292736;background:#faf9fc}*{box-sizing:border-box}body{margin:0}header{max-width:880px;margin:auto;padding:34px 28px 20px;display:flex;align-items:center;gap:12px;color:#6543a3;font-size:12px;letter-spacing:1.4px;font-weight:650}header img{width:32px;height:32px}main{max-width:880px;margin:auto;padding:0 28px 64px}article{background:#fff;border:1px solid #e8e2ee;border-radius:18px;padding:40px 48px}h1{font-size:36px;line-height:1.2;letter-spacing:-1.1px;margin:0 0 24px;max-width:600px}h2{font-size:20px;line-height:1.4;margin:36px 0 12px;padding-top:26px;border-top:1px solid #eee9f3}p{margin:12px 0;color:#504b5d}h1+p{color:#71647f;font-size:13px;margin-bottom:30px}a{color:#6543a3;text-decoration-thickness:1px;text-underline-offset:3px;overflow-wrap:anywhere}a:focus-visible{outline:2px solid #9874c3;outline-offset:4px}code{font:13px/1.6 ui-monospace,monospace;background:#f2edf8;padding:3px 5px;border-radius:4px;overflow-wrap:anywhere}footer{padding:22px 2px;color:#81768e;font-size:12px}@media(max-width:600px){header{padding:24px 18px 18px}main{padding:0 14px 32px}article{padding:28px 22px;border-radius:12px}h1{font-size:29px}h2{font-size:19px}}</style></head>
<body><header><img src="assets/icon.png" alt="" width="32" height="32">BRIGHTSPACE CONTEXT</header><main><article>${content}</article><nav aria-label="Help"><a href="/setup/">Setup and download</a> · <a href="https://github.com/khin101wastaken/brightspace-context" target="_blank" rel="noopener noreferrer">Source on GitHub</a> · <a href="mailto:khinaungwrk@gmail.com">Support</a></nav><footer>Published by Khin Aung · Local course-resource companion</footer></main></body></html>`;
const output=path.join(root,'sites/brightspace-context-privacy/dist');await mkdir(path.join(output,'assets'),{recursive:true});
await writeFile(path.join(output,'index.html'),html);
await cp(path.join(root,'extension/icons/icon-48.png'),path.join(output,'assets/icon.png'));
console.log('Rendered static privacy policy: '+path.join(output,'index.html'));
