export function searchTermPattern(terms,{global=false}={}) {
  const needles=[...new Set(terms.filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(!needles.length) return null;
  const alternatives=needles.map(term=>{
    const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // Multi-character terms can be incomplete words. Single letters remain
    // standalone words, so "I" does not highlight "Introduction" or "Film".
    return escaped+([...term].length===1?'(?![\\p{L}\\p{N}\\p{M}])':'');
  });
  // Every term starts at a word boundary; filename separators count too.
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(?:${alternatives.join('|')})`,global?'giu':'iu');
}

// Course text stays text: matching never inserts LMS content with innerHTML.
export function appendHighlightedText(element,text,terms) {
  const value=String(text??''),document=element.ownerDocument,pattern=searchTermPattern(terms,{global:true});
  if(!pattern) {element.append(document.createTextNode(value));return;}
  let start=0;
  for(const match of value.matchAll(pattern)) {
    if(match.index>start) element.append(document.createTextNode(value.slice(start,match.index)));
    const mark=document.createElement('mark');mark.className='search-highlight';mark.textContent=match[0];element.append(mark);
    start=match.index+match[0].length;
  }
  if(start<value.length) element.append(document.createTextNode(value.slice(start)));
}
