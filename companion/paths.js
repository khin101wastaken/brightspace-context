import path from 'node:path';
import os from 'node:os';
export function cacheDirectory() {
  const defaultDirectory=process.platform==='win32'?
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),'BrightspaceContext','cache'):
    path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(),'.cache'),'brightspace-context');
  return path.resolve(process.env.BRIGHTSPACE_CACHE_DIR || defaultDirectory);
}
