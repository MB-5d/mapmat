const {createPrivateScanCaptureStore}=require('./privateScanCapture');
const {saveScreenshotObject,readScreenshotObject}=require('./screenshotStorage');
const imageAssets=require('../stores/imageAssetStore');
const maps=require('../stores/mapStore');
const policy=require('../policies/permissionPolicy');
let store;
function getPrivateCaptureStore(){
 if(!store)store=createPrivateScanCaptureStore({encryptionKey:process.env.PRIVATE_SCAN_CAPTURE_KEY,saveObject:saveScreenshotObject,readObject:readScreenshotObject});
 return store;
}
async function resolvePrivateMapAccess(userId,key){
 const binding=await imageAssets.getPrivateImageBindingAsync(key);
 if(!binding)return null;
 let map=await maps.getMapForUserAsync(binding.map_id,userId);
 if(!map)map=await maps.getMapAccessibleToUserAsync(binding.map_id,userId).catch(()=>null);
 if(!map)return null;
 const role=policy.resolveResourceRole({actorUserId:userId,resourceOwnerUserId:map.user_id,membershipRole:map.membership_role||null});
 if(!policy.can(policy.ACTIONS.MAP_READ,role))return null;
 return{mapId:binding.map_id,ownerUserId:binding.owner_user_id};
}
// Only call after the request's map permissions have been verified.
async function readPrivateImageForMap(key,mapId){
 const binding=await imageAssets.getPrivateImageBindingAsync(key);
 if(!binding || binding.map_id!==mapId)return null;
 return getPrivateCaptureStore().read({ownerKey:'user:'+binding.owner_user_id,mapId,key});
}
module.exports={getPrivateCaptureStore,resolvePrivateMapAccess,readPrivateImageForMap};
