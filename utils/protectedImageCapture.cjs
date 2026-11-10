// Explicit capture-later uses the existing image job, never the public URL cache.
async function captureProtectedImage({ session, url, captureType, mapId, ownerUserId,
  context, fetchPage, verifyAccess, assertSafeUrl, classify, hasPasswordGate,
  preparePage, waitForReady, resizeBuffer, store, register, width, height, maxHeight, quality, scale = 1 }) {
  let asset;
  await verifyAccess();
  if (new URL(url).origin !== session.origin) throw Object.assign(Error('Sign in to this page’s site before capturing it.'),{code:'scan_auth_required',status:409});
  await fetchPage(context, await assertSafeUrl(url), async (page,response) => {
    await verifyAccess();
    if(new URL(response.finalUrl).origin!==session.origin || response.status>=400
      || classify({...response,url}).isAuthStatus || await hasPasswordGate(page,session.origin)) {
      throw Object.assign(Error('This site login ended. Sign in again to continue image capture.'),{code:'scan_auth_required',status:409});
    }
    await page.setViewportSize({width,height}); await preparePage(page);
    await waitForReady(page,{verifyAccess});
    const final={...response,html:await page.content(),finalUrl:page.url()};
    if(new URL(final.finalUrl).origin!==session.origin || classify({...final,url}).isAuthStatus || await hasPasswordGate(page,session.origin)) throw Object.assign(Error('This site login ended.'),{code:'scan_auth_required',status:409});
    if(classify({...final,url}).scanStatus!=='active') throw Error('Protected page did not finish loading.');
    const fullHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
    if(captureType==='full' && fullHeight>maxHeight) throw Error('Full capture exceeds the height limit.');
    const buffer=await page.screenshot({type:'jpeg',quality,fullPage:captureType==='full',animations:'disabled',timeout:15000});
    const smallBuffer=await resizeBuffer(buffer);
    await verifyAccess();
    asset=await store.save({ownerKey:'user:'+ownerUserId,mapId,buffer});
    await register({storageKey:asset.key,mapId,ownerUserId});
    const small=await store.save({ownerKey:'user:'+ownerUserId,mapId,buffer:smallBuffer});
    await register({storageKey:small.key,mapId,ownerUserId});
    asset={...asset,width:width*scale,height:(captureType==='full'?fullHeight:height)*scale,private:true,thumbnailUrl:small.url,
      ...(captureType==='thumb'?{thumbnailFullUrl:asset.url}:{}),type:captureType};
  });
  return asset;
}
module.exports={captureProtectedImage};
