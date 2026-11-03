import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2] || path.join(project,'docs/roadmap.json'));
const output=path.resolve(process.argv[3] || path.dirname(source));
const data=JSON.parse(await readFile(source,'utf8'));
const labels={done:'DONE',next:'NEXT',planned:'PLANNED',research:'RESEARCH',deferred:'DEFERRED'};
const id=value=>typeof value==='string' && /^[a-z][a-z0-9_]*$/.test(value);
const text=value=>typeof value==='string' && value.trim().length>0;
const fail=message=>{throw new Error(`Invalid roadmap: ${message}`);};
if(data.schemaVersion!==1 || !text(data.title) || !text(data.scope) || !Array.isArray(data.phases) || !data.phases.length || !Array.isArray(data.milestones) || !data.milestones.length || !Array.isArray(data.edges)) fail('expected schemaVersion 1, title, scope, phases, milestones and edges.');
const phases=new Map(),milestones=new Map();
for(const phase of data.phases) {
  if(!id(phase.id) || phases.has(phase.id) || !text(phase.title)) fail('phase IDs must be unique and titles nonempty.');
  phases.set(phase.id,phase);
}
for(const milestone of data.milestones) {
  if(!id(milestone.id) || milestones.has(milestone.id) || !phases.has(milestone.phase) || !text(milestone.title) || !Object.hasOwn(labels,milestone.status) || !text(milestone.deliverable) || !Array.isArray(milestone.acceptance) || !milestone.acceptance.length || !milestone.acceptance.every(text) || (milestone.evidence!==undefined && (!Array.isArray(milestone.evidence) || !milestone.evidence.length || !milestone.evidence.every(text)))) fail(`check milestone ${milestone.id || '(missing ID)'}.`);
  milestones.set(milestone.id,milestone);
}
const children=new Map([...milestones.keys()].map(key=>[key,[]])),edges=new Set();
for(const edge of data.edges) {
  const key=`${edge.from}:${edge.to}`;
  if(!milestones.has(edge.from) || !milestones.has(edge.to) || edge.from===edge.to || edges.has(key) || !['requires','optional'].includes(edge.kind)) fail(`invalid or duplicate edge ${key}.`);
  edges.add(key);children.get(edge.from).push(edge.to);
}
const active=new Set(),visited=new Set();
function visit(key) {
  if(active.has(key)) fail(`dependency cycle at ${key}.`);
  if(visited.has(key)) return;
  active.add(key);for(const child of children.get(key)) visit(child);active.delete(key);visited.add(key);
}
for(const key of milestones.keys()) visit(key);
const escape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','&#124;').replaceAll('\n','<br/>');
const chart=[
  '%% Generated from roadmap.json. Edit the source, then run npm run roadmap.',
  '%%{init: {"theme":"base","themeVariables":{"fontFamily":"Segoe UI, system-ui, sans-serif","fontSize":"14px","lineColor":"#94a3b8","clusterBkg":"#f8fafc","clusterBorder":"#cbd5e1","primaryTextColor":"#0f172a"},"flowchart":{"curve":"basis","nodeSpacing":24,"rankSpacing":42,"htmlLabels":true}}}%%',
  'flowchart TB',
];
for(const phase of data.phases) {
  chart.push(`  subgraph p_${phase.id}["${escape(phase.title)}"]`,'    direction LR');
  for(const m of data.milestones.filter(m=>m.phase===phase.id)) chart.push(`    m_${m.id}["${labels[m.status]}<br/>${escape(m.title)}"]:::${m.status}`);
  chart.push('  end');
}
for(const edge of data.edges) chart.push(`  m_${edge.from} ${edge.kind==='requires'?'-->':'-.->'} m_${edge.to}`);
chart.push(
  '  classDef done fill:#e8f5ee,stroke:#319465,color:#164b33,stroke-width:1.5px;',
  '  classDef next fill:#ede9fe,stroke:#7c3aed,color:#4c1d95,stroke-width:3px;',
  '  classDef planned fill:#eef3f9,stroke:#94a3b8,color:#334155,stroke-width:1px;',
  '  classDef research fill:#fff4df,stroke:#d99a24,color:#783c0b,stroke-width:1.5px;',
  '  classDef deferred fill:#f5f5f5,stroke:#b4b9c2,color:#626b79,stroke-dasharray:4 3;',
);
const mermaid=chart.join('\n')+'\n';
const counts=Object.keys(labels).map(status=>`${data.milestones.filter(m=>m.status===status).length} ${status}`).join(' | ');
const document=[`# ${data.title}`,'',data.scope,'',`**${counts}**`,'',
  '> Editable source: [roadmap.json](roadmap.json). Reusable structure: [roadmap.schema.json](roadmap.schema.json). Regenerate with `npm run roadmap`.',
  '', '**Reading the chart:** green = working; purple = recommended next; blue-gray = planned; amber = needs validation; dashed gray = deferred. Solid arrows are prerequisites. Dashed arrows are optional follow-ups, not release blockers. No dates or effort estimates are implied.',
  '', '```mermaid',mermaid.trimEnd(),'```','',
  '## Update or reuse','',
  '1. Edit milestones in `roadmap.json`: keep each `id` stable, set its `status`, and describe its deliverable and acceptance criteria.',
  '2. Add phases or dependencies as needed. Every edge references milestone IDs; the generator rejects missing references, duplicate edges and cycles.',
  '3. Run `npm run roadmap`. Commit the source and regenerated files together.',
  '4. For another project, copy the JSON/schema and run `node scripts/generate-roadmap.js path/to/roadmap.json output-directory`.',
  '', 'The schema supports editor validation. The generator performs structural and graph checks without adding project dependencies. The `.mmd` output can be used directly in Mermaid-compatible tools.',
];
for(const phase of data.phases) {
  document.push('',`## ${phase.title}`);
  for(const m of data.milestones.filter(m=>m.phase===phase.id)) {
    document.push('',`### ${m.title} - ${labels[m.status]}`,'',m.deliverable,'','Acceptance:','',...m.acceptance.map(value=>`- ${value}`));
    if(m.evidence) document.push('','Evidence:','',...m.evidence.map(value=>`- ${value}`));
    const incoming=data.edges.filter(edge=>edge.to===m.id && edge.kind==='requires').map(edge=>milestones.get(edge.from).title);
    if(incoming.length) document.push('',`Prerequisites: ${incoming.join('; ')}.`);
  }
}
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'roadmap.mmd'),mermaid);
await writeFile(path.join(output,'ROADMAP.md'),document.join('\n')+'\n');
console.log(`Generated roadmap: ${data.milestones.length} milestones, ${data.edges.length} edges, no cycles.`);
console.log(path.join(output,'ROADMAP.md'));
