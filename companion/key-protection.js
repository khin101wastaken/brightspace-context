import {spawn} from 'node:child_process';
import path from 'node:path';

// Only a small key crosses this bridge, through anonymous pipes. No secrets in
// arguments, environment variables, scripts on disk, or diagnostic output.
const script=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; try { $r=[Console]::In.ReadToEnd() | ConvertFrom-Json; if($r.operation -eq 'directory') { $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($r.data)); $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); [IO.Directory]::SetAccessControl($p,$acl); $out=[Text.Encoding]::UTF8.GetBytes('ok') } else { $b=[Convert]::FromBase64String($r.data); $scope=[System.Security.Cryptography.DataProtectionScope]::CurrentUser; if($r.operation -eq 'protect') { $out=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,$scope) } elseif($r.operation -eq 'unprotect') { $out=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,$scope) } else { throw 'Invalid operation' } }; [Console]::Out.Write([Convert]::ToBase64String($out)); exit 0 } catch { [Console]::Error.Write('Windows account key protection failed.'); exit 1 }`;
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
    child.stdin.end(JSON.stringify({operation,data:Buffer.from(bytes).toString('base64')}));
  });
}
export const windowsKeyProtection={protect:bytes=>call('protect',bytes),unprotect:bytes=>call('unprotect',bytes)};
export const restrictDirectory=directory=>call('directory',Buffer.from(directory));
