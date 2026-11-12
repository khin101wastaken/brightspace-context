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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
<title>Brightspace Context · Privacy Policy</title>
<link rel="stylesheet" href="/assets/site.css"></head>
<body><header class="site-header"><a class="brand" href="/setup/"><img src="/assets/icon.png" alt="" width="28" height="28">Brightspace Context</a><nav class="site-nav" aria-label="Main navigation"><a href="/setup/">Setup</a><a href="/demo/">Sample courses</a><a href="/review/">Reviewer guide</a><a href="/" aria-current="page">Privacy</a></nav></header><main class="site-main reading"><article>${content}</article><nav class="site-links" aria-label="Help"><a href="/setup/">Setup and download</a><a href="https://github.com/khin101wastaken/brightspace-context" target="_blank" rel="noopener noreferrer">Source on GitHub</a><a href="mailto:khinaungwrk@gmail.com">Support</a></nav><footer>Published by Khin Aung · Local course-resource companion</footer></main></body></html>`;
const output=path.join(root,'sites/brightspace-context-privacy/dist');await mkdir(path.join(output,'assets'),{recursive:true});
await writeFile(path.join(output,'index.html'),html);
await cp(path.join(root,'extension/icons/icon-48.png'),path.join(output,'assets/icon.png'));
await cp(path.join(root,'store/site.css'),path.join(output,'assets/site.css'));
console.log('Rendered static privacy policy: '+path.join(output,'index.html'));
