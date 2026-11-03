import path from 'node:path';
import os from 'node:os';
export function cacheDirectory({platform=process.platform,env=process.env,home=os.homedir()}={}) {
  const paths=platform==='win32'?path.win32:path.posix;
  // AppData can be redirected independently for desktop tools and normal apps.
  // A home-relative path gives both processes the same explicit local location.
  const defaultDirectory=platform==='win32'?
    paths.join(home,'BrightspaceContext','cache'):
    paths.join(env.XDG_CACHE_HOME || paths.join(home,'.cache'),'brightspace-context');
  return paths.resolve(env.BRIGHTSPACE_CACHE_DIR || defaultDirectory);
}
