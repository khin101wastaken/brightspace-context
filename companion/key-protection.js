import {spawn} from 'node:child_process';
import path from 'node:path';

// Only a small key crosses this bridge, through anonymous pipes. No secrets in
// arguments, environment variables, scripts on disk, or diagnostic output.
// MCP hosts can omit PSModulePath. Use .NET directly instead of autoloading
// Add-Type, ConvertFrom-Json or New-Object through PowerShell's module catalog.
// The private pipe protocol is an operation line followed by base64 bytes.
const script=`$ErrorActionPreference='Stop'
try {
  [void][Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a')
  $raw=[Console]::In.ReadToEnd()
  $separator=$raw.IndexOf([char]10)
  if($separator -lt 1) { throw 'Invalid request' }
  $operation=$raw.Substring(0,$separator)
  $bytes=[Convert]::FromBase64String($raw.Substring($separator+1))
  if($operation -eq 'directory') {
    $directory=[Text.Encoding]::UTF8.GetString($bytes)
    $acl=[Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true,$false)
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
    [IO.Directory]::SetAccessControl($directory,$acl)
    $out=[Text.Encoding]::UTF8.GetBytes('ok')
  } else {
    $scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
    if($operation -eq 'protect') { $out=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,$scope) }
    elseif($operation -eq 'unprotect') { $out=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,$scope) }
    else { throw 'Invalid operation' }
  }
  [Console]::Out.Write([Convert]::ToBase64String($out))
  exit 0
} catch { [Console]::Error.Write('Windows account key protection failed.'); exit 1 }`;
async function call(operation,bytes) {
  if(process.platform!=='win32') throw Object.assign(new Error('Encrypted storage currently requires Windows account key protection. No plaintext fallback is available.'),{code:'KEY_PROTECTION_UNAVAILABLE'});
  return new Promise((resolve,reject)=>{
    const executable=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',failed=false;
    const fail=()=>{if(failed)return;failed=true;clearTimeout(timeout);child.kill();reject(Object.assign(new Error('Cannot unlock encrypted storage with this Windows account. Keep the existing vault and key files; do not reset them.'),{code:'KEY_PROTECTION_FAILED'}));};
    const timeout=setTimeout(fail,15000);
    child.on('error',fail);child.stdin.on('error',fail);child.stderr.on('data',()=>{});
    child.stdout.on('data',chunk=>{output+=chunk.toString('ascii');if(output.length>65536)fail();});
    child.on('close',code=>{if(failed)return;clearTimeout(timeout);if(code!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(output.trim()))return fail();resolve(Buffer.from(output.trim(),'base64'));});
    child.stdin.end(operation+'\n'+Buffer.from(bytes).toString('base64'));
  });
}
export const windowsKeyProtection={protect:bytes=>call('protect',bytes),unprotect:bytes=>call('unprotect',bytes)};
export const restrictDirectory=directory=>call('directory',Buffer.from(directory));
