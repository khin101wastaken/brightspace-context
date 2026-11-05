export function validateSyncSpec(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['semesterId'].includes(key))) throw new Error('Use only an optional semesterId for catalog sync.');
  if(value.semesterId!=null && (typeof value.semesterId!=='string' || !/^\d+$/.test(value.semesterId))) throw new Error('Use a semesterId returned by semester discovery or list_courses.');
  return value.semesterId==null?{}:{semesterId:value.semesterId};
}
export function validateProgress(value) {
  if(!value || !['discovering','listing_courses','scanning','saving'].includes(value.phase)) throw new Error('Invalid catalog sync progress.');
  const result={phase:value.phase};
  for(const key of ['completed','total']) if(value[key]!=null) {
    if(!Number.isInteger(value[key]) || value[key]<0 || value[key]>200) throw new Error('Invalid catalog sync progress count.');
    result[key]=value[key];
  }
  if(result.completed!=null && result.total!=null && result.completed>result.total) throw new Error('Invalid catalog sync progress count.');
  return result;
}
