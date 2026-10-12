"use strict";
const inventoryStore=(()=>{
 const namespace='thai-inventory:'+new URL('./',document.baseURI).pathname;
 const fallbackKey=namespace+':sqlite-fallback-v1';
 let worker,next=0,queue=Promise.resolve(),status={},pending=new Map();
 let runtime={phase:'idle',message:'正在准备浏览器运行组件…',error:null};
 function report(update){runtime={...runtime,...update};window.dispatchEvent(new CustomEvent('inventory-runtime',{detail:{...runtime}}));}
 function reason(e){return (e?.name?e.name+': ':'')+(e?.message||String(e));}
 function readFallback(){
  const text=localStorage.getItem(fallbackKey);if(text===null)return undefined;
  const value=JSON.parse(text);
  if(value.format!=='thai-inventory-sqlite-v1'||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.base64!=='string')throw new Error('兼容保存数据格式异常，请保留网站数据并使用完整备份恢复。');
  const decoded=atob(value.base64),bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  return {bytes,revision:value.revision,savedAt:value.savedAt};
 }
 function saveFallback(bytes,revision){
  const previous=readFallback();if((previous?.revision||0)!==revision)throw new Error('其他标签页已经更新数据，本次修改未保存。请重新读取后再操作。');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const savedAt=new Date().toISOString(),value={format:'thai-inventory-sqlite-v1',base64:btoa(binary),revision:revision+1,savedAt};
  try{localStorage.setItem(fallbackKey,JSON.stringify(value));}catch(e){throw new Error('兼容存储未能保存（'+reason(e)+'）。原数据保留；请下载完整备份，检查网站存储权限或剩余空间后重试。');}
  return {bytes:bytes.slice(),revision:value.revision,savedAt};
 }
 function storageOptions(){
  let exists=false;const probe=fallbackKey+':probe';
  try{exists=localStorage.getItem(fallbackKey)!==null;if(!navigator.locks)return {available:false,exists,error:'本浏览器缺少安全串行保存功能，请使用新版 Chrome 或 Edge。'};localStorage.setItem(probe,'1');localStorage.removeItem(probe);return {available:true,exists};}
  catch(e){return {available:false,exists,error:reason(e)};}
 }
 function fail(error){
  const message=error.message||String(error);report({phase:'error',error:message,message:'启动或读取失败'});
  for(const r of pending.values()){clearTimeout(r.timer);r.reject(error);}pending.clear();
  if(worker){worker.terminate();worker=null;}
 }
 function createWorker(){
  if(worker)return worker;
  if(typeof Worker==='undefined')throw new Error('这个浏览器不支持后台计算，请使用新版 Chrome 或 Edge。');
  const instance=new Worker(new URL('./worker.js?v=20261012-storage2',document.baseURI));worker=instance;
  instance.onmessage=({data})=>{
   if(worker!==instance)return;
   if(data.fallbackRequest){
    let reply;try{reply={ok:true,value:data.action==='read'?readFallback():data.action==='save'?saveFallback(data.bytes,data.revision):(()=>{throw new Error('未知存储操作');})()};}
    catch(e){reply={ok:false,error:e.message||String(e)};}
    instance.postMessage({fallbackReply:data.fallbackRequest,...reply});return;
   }
   if(data.progress){report({phase:'loading',message:data.progress,error:null});return;}
   const request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timer);
   if(data.storage)status=data.storage;
   if(data.ok){report({phase:'ready',message:'数据已读取并保存',error:null});request.resolve(data.value);}
   else{const error=new Error(data.error||'运行失败，未收到具体原因。');report({phase:'error',error:error.message});request.reject(error);}
  };
  instance.onerror=e=>{e.preventDefault?.();fail(new Error('浏览器计算组件启动失败：'+(e.message||'组件下载中断')+'。请重新读取；已有数据不会清空。'));};
  instance.onmessageerror=()=>fail(new Error('浏览器计算组件返回内容无法读取，请重新读取。'));
  return instance;
 }
 function send(path,data){return new Promise((resolve,reject)=>{
  try{
   const instance=createWorker(),id=++next;
   const timer=runtime.phase!=='ready'?setTimeout(()=>fail(new Error('运行组件加载超过 3 分钟。请检查网络后重新读取；不要清除网站数据。')),180000):null;
   pending.set(id,{resolve,reject,timer});if(runtime.phase!=='ready')report({phase:'loading',message:'正在启动浏览器内计算…',error:null});
   instance.postMessage({id,namespace,path,data,fallback:storageOptions()});
  }catch(e){fail(e);reject(e);}
 });}
 function request(path,data){const run=()=>navigator.locks?navigator.locks.request(namespace,()=>send(path,data)):send(path,data);
  const result=queue.then(run);queue=result.catch(()=>{});return result;}
 return {request,get status(){return {...status};},get runtime(){return {...runtime};}};
})();
