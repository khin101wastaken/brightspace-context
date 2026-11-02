import {writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

export async function replaceFile(source,destination) {
  for(let attempt=0;;attempt++) {
    try {await rename(source,destination);return;}
    catch(error) {
      // Windows antivirus/OneDrive can briefly hold an existing destination.
      if(attempt>=5 || !['EPERM','EACCES','EBUSY'].includes(error.code)) throw error;
      await delay(20*2**attempt);
    }
  }
}
export async function atomicWrite(filename,contents,options) {
  const temporary=`${filename}.${randomUUID()}.tmp`;
  try {await writeFile(temporary,contents,options);await replaceFile(temporary,filename);}
  finally {await unlink(temporary).catch(()=>{});}
}
