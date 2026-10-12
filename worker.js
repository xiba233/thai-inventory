"use strict";
// No application requests leave the browser. Only immutable runtime assets are fetched.
let python, database, namespace, queue=Promise.resolve(), fallbackNext=0, fallbackPending=new Map();
const DB_PATH='/inventory-data/inventory.db';
function progress(message){postMessage({progress:message});}
function errorDetail(e){return (e?.name?e.name+': ':'')+(e?.message||String(e));}
function fallbackCall(action,bytes,revision){return new Promise((resolve,reject)=>{
 const id=++fallbackNext;fallbackPending.set(id,{resolve,reject});postMessage({fallbackRequest:id,action,bytes,revision});
});}
function openStore(name){return new Promise((resolve,reject)=>{
 let settled=false;const finish=(error,value)=>{if(settled){value?.close();return;}settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(new Error('打开标准存储超时，请关闭其他同网址标签页后重新读取。')),15000);
 let req;try{req=indexedDB.open(name,1);}catch(e){finish(new Error('标准存储无法打开（'+errorDetail(e)+'）'));return;}
 req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('data'))req.result.createObjectStore('data');};
 req.onsuccess=()=>finish(null,req.result);
 req.onerror=()=>finish(new Error('标准存储无法打开（'+errorDetail(req.error)+'）'));
 req.onblocked=()=>finish(new Error('标准存储被其他页面占用，请关闭其他同网址标签页后重新读取。'));
});}
function readStore(){if(database.mode==='local')return fallbackCall('read');return new Promise((resolve,reject)=>{
 const tx=database.transaction('data','readonly'),req=tx.objectStore('data').get('current');let record;
 req.onsuccess=()=>record=req.result;tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error);
});}
function saveStore(bytes,revision){if(database.mode==='local')return fallbackCall('save',bytes,revision);return new Promise((resolve,reject)=>{
 const tx=database.transaction('data','readwrite'),store=tx.objectStore('data'),req=store.get('current');let value;
 req.onsuccess=()=>{if((req.result?.revision||0)!==revision){tx.abort();return;}
  value={bytes:bytes.slice(),revision:revision+1,savedAt:new Date().toISOString()};store.put(value,'current');};
 tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(new Error(tx.error?.name==='QuotaExceededError'?'浏览器存储空间不足，修改未保存。请先导出备份并释放空间。':'其他标签页已经更新数据，本次修改未保存。请重新读取后再操作。'));
 tx.onerror=()=>{};
});}
async function start(name,fallback={}){
 if(database)return;
 namespace=name;progress('正在加载运行组件，首次打开约需下载 13 MB，请稍候…');
 importScripts('./pyodide.js');
 python=await loadPyodide({indexURL:new URL('./',self.location.href).href});
 progress('正在加载 Excel 解析与库存计算功能…');
 await python.loadPackage(['sqlite3','tzdata']);
 const response=await fetch('./business.zip');if(!response.ok)throw new Error('计算组件下载失败，请检查网络后重新打开。');
 python.unpackArchive(new Uint8Array(await response.arrayBuffer()),'zip',{extractDir:'/app'});
 await python.runPythonAsync("import sys\nsys.path.insert(0, '/app')\nfrom browser_bridge import request\nfrom pathlib import Path\nPath('/inventory-data').mkdir(exist_ok=True)");
 if(fallback.exists){
  if(!fallback.available)throw new Error('本浏览器之前使用兼容保存，现在被阻止：'+fallback.error+'。请允许此网站保存设备数据后重新读取，不要清除网站数据。');
  database={mode:'local',reason:'继续使用本浏览器之前的兼容保存数据。'};
 }else{
  try{database=await openStore(namespace);}catch(e){
   if(!fallback.available)throw new Error(e.message+'；兼容存储也不可用（'+(fallback.error||'未提供')+'）。请使用普通窗口，在浏览器网站设置中允许此网址保存设备数据，然后重新读取。不要清除已有网站数据。');
   database={mode:'local',reason:e.message};
  }
 }
 progress('正在读取本浏览器保存的数据…');
}
function same(a,b){return a?.length===b?.length&&a.every((v,i)=>v===b[i]);}
function reset(bytes){if(bytes)python.FS.writeFile(DB_PATH,bytes);else if(python.FS.analyzePath(DB_PATH).exists)python.FS.unlink(DB_PATH);}
async function handle(message){
 try{
  await start(message.namespace,message.fallback);
  const stored=await readStore(),revision=stored?.revision||0;reset(stored?.bytes);
  python.globals.set('browser_request_json',JSON.stringify({path:message.path,data:message.data}));
  const encoded=await python.runPythonAsync('request(browser_request_json)');
  const result=JSON.parse(encoded),bytes=python.FS.readFile(DB_PATH);let durable=stored;
  try{if(!same(bytes,stored?.bytes))durable=await saveStore(bytes,revision);}catch(e){reset(stored?.bytes);throw e;}
  postMessage({id:message.id,...result,storage:{mode:database.mode==='local'?'local':'indexeddb',reason:database.reason,savedAt:durable?.savedAt,revision:durable?.revision,bytes:durable?.bytes.length}});
 }catch(e){postMessage({id:message.id,ok:false,error:e.message||String(e)});}
}
self.onmessage=event=>{
 if(event.data.fallbackReply){const request=fallbackPending.get(event.data.fallbackReply);if(request){fallbackPending.delete(event.data.fallbackReply);event.data.ok?request.resolve(event.data.value):request.reject(new Error(event.data.error));}return;}
 queue=queue.then(()=>handle(event.data)).catch(e=>postMessage({id:event.data.id,ok:false,error:String(e)}));
};
