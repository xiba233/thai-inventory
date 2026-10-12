"use strict";
// No application requests leave the browser. Only immutable runtime assets are fetched.
let python, database, namespace, queue=Promise.resolve();
const DB_PATH='/inventory-data/inventory.db';
function progress(message){postMessage({progress:message});}
function openStore(name){return new Promise((resolve,reject)=>{
 const req=indexedDB.open(name,1);req.onupgradeneeded=()=>req.result.createObjectStore('data');
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('浏览器不允许保存数据，请使用普通窗口并允许网站存储。'));
});}
function readStore(){return new Promise((resolve,reject)=>{
 const tx=database.transaction('data','readonly'),req=tx.objectStore('data').get('current');let record;
 req.onsuccess=()=>record=req.result;tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error);
});}
function saveStore(bytes,revision){return new Promise((resolve,reject)=>{
 const tx=database.transaction('data','readwrite'),store=tx.objectStore('data'),req=store.get('current');let value;
 req.onsuccess=()=>{if((req.result?.revision||0)!==revision){tx.abort();return;}
  value={bytes:bytes.slice(),revision:revision+1,savedAt:new Date().toISOString()};store.put(value,'current');};
 tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(new Error(tx.error?.name==='QuotaExceededError'?'浏览器存储空间不足，修改未保存。请先导出备份并释放空间。':'其他标签页已经更新数据，本次修改未保存。请重新读取后再操作。'));
 tx.onerror=()=>{};
});}
async function start(name){
 if(database)return;
 namespace=name;progress('正在加载运行组件，首次打开约需下载 13 MB，请稍候…');
 importScripts('./pyodide.js');
 python=await loadPyodide({indexURL:new URL('./',self.location.href).href});
 progress('正在加载 Excel 解析与库存计算功能…');
 await python.loadPackage(['sqlite3','tzdata']);
 const response=await fetch('./business.zip');if(!response.ok)throw new Error('计算组件下载失败，请检查网络后重新打开。');
 python.unpackArchive(new Uint8Array(await response.arrayBuffer()),'zip',{extractDir:'/app'});
 await python.runPythonAsync("import sys\nsys.path.insert(0, '/app')\nfrom browser_bridge import request\nfrom pathlib import Path\nPath('/inventory-data').mkdir(exist_ok=True)");
 database=await openStore(namespace);progress('正在读取本浏览器保存的数据…');
}
function same(a,b){return a?.length===b?.length&&a.every((v,i)=>v===b[i]);}
function reset(bytes){if(bytes)python.FS.writeFile(DB_PATH,bytes);else if(python.FS.analyzePath(DB_PATH).exists)python.FS.unlink(DB_PATH);}
async function handle(message){
 try{
  await start(message.namespace);
  const stored=await readStore(),revision=stored?.revision||0;reset(stored?.bytes);
  python.globals.set('browser_request_json',JSON.stringify({path:message.path,data:message.data}));
  const encoded=await python.runPythonAsync('request(browser_request_json)');
  const result=JSON.parse(encoded),bytes=python.FS.readFile(DB_PATH);let durable=stored;
  try{if(!same(bytes,stored?.bytes))durable=await saveStore(bytes,revision);}catch(e){reset(stored?.bytes);throw e;}
  postMessage({id:message.id,...result,storage:{savedAt:durable?.savedAt,revision:durable?.revision,bytes:durable?.bytes.length}});
 }catch(e){postMessage({id:message.id,ok:false,error:e.message||String(e)});}
}
self.onmessage=event=>{queue=queue.then(()=>handle(event.data)).catch(e=>postMessage({id:event.data.id,ok:false,error:String(e)}));};
