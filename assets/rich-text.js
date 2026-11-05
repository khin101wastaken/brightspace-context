import {Parser} from 'htmlparser2';

// Build-time source for extension/rich-text.js. Parsing creates no browser DOM,
// executes no markup, and never fetches images, frames or linked resources.
const blocks=new Set(['p','div','section','article','header','footer','blockquote','h1','h2','h3','h4','h5','h6','ul','ol','li','tr','table','pre']);
const ignored=new Set(['script','style','iframe','object','template','noscript']);
const clean=text=>text.replace(/\r\n?/g,'\n').replace(/[\t\f\v \u00a0]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
export function descriptionText(description,baseUrl) {
  let htmlText='',parts=[],suppressed=0,stack=[];
  if(typeof description?.Html==='string' && description.Html.trim()) {
    const parser=new Parser({
      onopentag(name,attributes) {
        const hidden=suppressed>0 || ignored.has(name) || Object.hasOwn(attributes,'hidden') || attributes['aria-hidden']==='true';
        if(hidden) suppressed++;
        let href=null;
        if(!hidden) {
          if(blocks.has(name) || name==='br') parts.push('\n');
          if(name==='li') parts.push('• ');
          if(name==='td' || name==='th') parts.push(' | ');
          if(name==='a' && attributes.href) {
            try {const url=new URL(attributes.href,baseUrl);if(['http:','https:'].includes(url.protocol) && !url.username && !url.password) href=url.href;} catch {}
          }
          if(name==='img' && attributes.alt?.trim()) parts.push(attributes.alt);
        }
        stack.push({name,hidden,href,start:parts.length});
      },
      ontext(text) {if(!suppressed) parts.push(text.replace(/\s+/g,' '));},
      onclosetag(name) {
        const item=stack.pop();
        if(!item) return;
        if(item.hidden) {suppressed--;return;}
        if(item.href && !parts.slice(item.start).join('').includes(item.href)) parts.push(` (${item.href})`);
        if(blocks.has(name)) parts.push('\n');
      },
    },{decodeEntities:true});
    parser.end(description.Html);
    htmlText=clean(parts.join(''));
  }
  const text=htmlText || clean(typeof description?.Text==='string'?description.Text:'');
  return {description:text.slice(0,16000),descriptionTruncated:text.length>16000};
}
