// Per-process capacity. Deployment instance count must be bounded separately.
function createIsolatedBrowserPool({open,limit=3}) {
 const leases=new Set();let stopping=false;
 async function acquire(options){
  if(stopping||leases.size>=limit)throw Object.assign(Error('All isolated browsers are busy. Try again shortly.'),{status:429,code:'scan_auth_capacity'});
  const slot={};leases.add(slot);
  const opening=Promise.resolve().then(()=>open(options));let closing;
  slot.close=()=>closing||(closing=opening.then(lease=>lease.close()).then(()=>{leases.delete(slot);}));
  try {
   const lease=await opening;
   lease.browser.on('disconnected',()=>slot.close().catch(()=>{}));
   if(stopping){await slot.close();throw Object.assign(Error('Browser service is restarting.'),{status:503});}
   return {...lease,close:slot.close};
  }catch(error){if(!error.cleanupPending)leases.delete(slot);throw error;}
 }
 async function close(){stopping=true;await Promise.allSettled([...leases].map(slot=>slot.close()));}
 return {acquire,close};
}
module.exports={createIsolatedBrowserPool};
