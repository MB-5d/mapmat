function authError(url, message='Sign in to this site to capture its protected pages.') {
  return Object.assign(new Error(message),{status:409,code:'scan_auth_required',url});
}
function claimCaptureLogins({records,sessionIds,ownerKey,sessions,now=Date.now()}) {
  const origins=new Map();
  for(const {node} of records)if(node.authCaptureRequired || node.authPreviewUnavailable){
    const url=new URL(node.url);origins.set(url.origin,node.url);
  }
  const allowed=new Set((Array.isArray(sessionIds)?sessionIds:[]).slice(-10).map(String));
  const claims=[];
  for(const [origin,url] of origins){
    const session=[...sessions.values()].find(s=>allowed.has(s.id)&&s.ownerKey===ownerKey&&s.origin===origin
      &&s.status==='ready'&&s.storageState&&s.expiresAt>now&&!s.jobId);
    if(!session)throw authError(url);
    claims.push(session);
  }
  // No await before every session is checked and reserved.
  claims.forEach(s=>{s.jobId='capture-pending';});
  return claims;
}
function validateCaptureClaim(session,{ownerKey,jobId,url,now=Date.now()}) {
  if(!session || session.ownerKey!==ownerKey || session.jobId!==jobId || session.expiresAt<=now
    || session.status!=='ready' || !session.storageState || new URL(url).origin!==session.origin) throw authError(url,'This site login expired. Sign in again to continue image capture.');
}
module.exports={claimCaptureLogins,validateCaptureClaim,authError};
