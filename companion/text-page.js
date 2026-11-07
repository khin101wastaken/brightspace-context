export function validateTextOptions({offset=0,limit=12000}={}) {
  if(!Number.isSafeInteger(offset) || offset<0 || !Number.isInteger(limit) || limit<1 || limit>16000)throw new Error('Use a nonnegative integer offset and a limit from 1 to 16000 characters.');
}
export function textPage(text,{offset=0,limit=12000}={}) {
  validateTextOptions({offset,limit});
  if(offset>text.length)throw new Error('Offset exceeds document text length. Start at offset 0.');
  if(offset>0 && /[\uDC00-\uDFFF]/.test(text[offset] || '') && /[\uD800-\uDBFF]/.test(text[offset-1]))throw new Error('Offset splits a character; use nextOffset from the preceding page.');
  let end=Math.min(text.length,offset+limit);
  if(end<text.length && /[\uD800-\uDBFF]/.test(text[end-1] || ''))end--;
  if(end===offset && offset<text.length)throw new Error('Limit is too small for this character; use a limit of at least 2.');
  return {text:text.slice(offset,end),offset,nextOffset:end<text.length?end:null,totalCharacters:text.length,hasMore:end<text.length};
}
