export function searchTermPattern(terms,{global=false,prefixTerms=terms}={}) {
  const prefixes=new Set(prefixTerms);
  const needles=[...new Set(terms.filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(!needles.length) return null;
  const alternatives=needles.map(term=>{
    const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // Only explicitly unfinished terms may match prefixes. Single letters
    // always stay standalone, so "I" never matches "Introduction" or "Film".
    return escaped+(!prefixes.has(term) || [...term].length===1?'(?![\\p{L}\\p{N}\\p{M}])':'');
  });
  // Every term starts at a word boundary; filename separators count too.
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(?:${alternatives.join('|')})`,global?'giu':'iu');
}

// Course text stays text: matching never inserts LMS content with innerHTML.
export function appendHighlightedText(element,text,terms,{prefixTerms=terms}={}) {
  const value=String(text??''),document=element.ownerDocument,pattern=searchTermPattern(terms,{global:true,prefixTerms});
  if(!pattern) {element.append(document.createTextNode(value));return;}
  let start=0;
  for(const match of value.matchAll(pattern)) {
    if(match.index>start) element.append(document.createTextNode(value.slice(start,match.index)));
    const mark=document.createElement('mark');mark.className='search-highlight';mark.textContent=match[0];element.append(mark);
    start=match.index+match[0].length;
  }
  if(start<value.length) element.append(document.createTextNode(value.slice(start)));
}

// Descriptions retain logical line/paragraph breaks from Brightspace. Terms
// from separate schedule entries must not combine into one apparent match.
export function matchingPassages(text,patterns) {
  if(!patterns.length) return [];
  const ranges=[];
  for(const line of String(text??'').matchAll(/[^\r\n]+/g)) {
    if(patterns.every(pattern=>pattern.test(line[0]))) ranges.push({start:line.index,end:line.index+line[0].length});
  }
  return ranges;
}

export function appendHighlightedPassages(element,text,terms,{prefixTerms=terms}={}) {
  const value=String(text??''),document=element.ownerDocument;
  const patterns=terms.filter(Boolean).map(term=>searchTermPattern([term],{prefixTerms}));
  let start=0;
  for(const range of matchingPassages(value,patterns)) {
    if(range.start>start) element.append(document.createTextNode(value.slice(start,range.start)));
    appendHighlightedText(element,value.slice(range.start,range.end),terms,{prefixTerms});
    start=range.end;
  }
  if(start<value.length || !value.length) element.append(document.createTextNode(value.slice(start)));
}
