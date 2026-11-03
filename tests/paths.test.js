import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheDirectory} from '../companion/paths.js';

test('Windows companion and MCP share a cache despite different AppData environments',()=>{
  const home='C:\\Users\\Student';
  const normal=cacheDirectory({platform:'win32',home,env:{LOCALAPPDATA:home+'\\AppData\\Local'}});
  const isolated=cacheDirectory({platform:'win32',home,env:{LOCALAPPDATA:home+'\\AppData\\Local\\Packages\\sandbox.example\\AC'}});
  assert.equal(normal,'C:\\Users\\Student\\BrightspaceContext\\cache');
  assert.equal(normal,isolated);
});
test('explicit cache overrides and Unix cache locations remain supported',()=>{
  assert.equal(cacheDirectory({platform:'win32',home:'C:\\Users\\Student',env:{BRIGHTSPACE_CACHE_DIR:'D:\\Course Cache'}}),'D:\\Course Cache');
  assert.equal(cacheDirectory({platform:'linux',home:'/home/student',env:{}}),'/home/student/.cache/brightspace-context');
  assert.equal(cacheDirectory({platform:'linux',home:'/home/student',env:{XDG_CACHE_HOME:'/local/cache'}}),'/local/cache/brightspace-context');
  assert.equal(cacheDirectory({platform:'darwin',home:'/Users/student',env:{BRIGHTSPACE_CACHE_DIR:'/local/course-cache'}}),'/local/course-cache');
});
