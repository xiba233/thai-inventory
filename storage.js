"use strict";
const inventoryStore=(()=>{
 const scope=new URL('./',document.baseURI).pathname;
 const namespace='thai-inventory:'+scope;
 const worker=new Worker(new URL('./worker.js',document.baseURI));
 let next=0,queue=Promise.resolve(),status={},pending=new Map();
 worker.onmessage=({data})=>{
  if(data.progress){const n=document.getElementById('loading-text');if(n)n.textContent=data.progress;return;}
  const request=pending.get(data.id);if(!request)return;pending.delete(data.id);
  if(data.storage)status=data.storage;
  if(data.ok)request.resolve(data.value);else request.reject(new Error(data.error));
 };
 worker.onerror=()=>{for(const request of pending.values())request.reject(new Error('浏览器运行组件未能启动，请检查网络后重新打开页面。'));pending.clear();};
 function send(path,data){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});worker.postMessage({id,namespace,path,data});});}
 function request(path,data){const run=()=>navigator.locks?navigator.locks.request(namespace,()=>send(path,data)):send(path,data);
  const result=queue.then(run);queue=result.catch(()=>{});return result;}
 return {request,get status(){return {...status};}};
})();
