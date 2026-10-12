"use strict";
function downloadBackup(value){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='泰国库存完整备份_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function exportFullBackup(){const value=await api('backup-export');downloadBackup(value);return value;}
function renderBackup(parent){
 const intro=card('数据保存在您现在使用的浏览器','GitHub 提供固定网址，库存、采购和设置保存在本设备的这个浏览器里。导入的 Excel 和业务数据不会上传到 GitHub。');
 intro.append(notice('换电脑、换浏览器或清除网站数据前，请先下载完整备份。其他设备不会自动同步；需要在那台设备恢复备份。','info'));
 intro.append(el('p','最近保存：'+timestamp(inventoryStore.status.savedAt)+'；本地数据大小：'+num((inventoryStore.status.bytes||0)/1024,1)+' KB。关闭网页再打开会读取已保存的数据。'));
 parent.append(intro);
 const download=card('第一步：下载完整备份','备份包含库存、导入历史、SKU 周期、清仓状态、采购、出货与在途记录。表格的“导出筛选结果”只导出一部分，不是完整备份。');
 const b=button('下载完整备份',async()=>{b.disabled=true;try{await exportFullBackup();toast('完整备份已生成，请在浏览器下载列表中查看，并妥善保存。');}catch(e){toast(e.message,true);}finally{b.disabled=false;}},'primary');download.append(b,el('p','建议每次完成当天操作后备份一次。备份含您的业务数据，请保存在自己的文件夹，不要放进公开 GitHub 仓库。','muted'));parent.append(download);
 const restore=card('第二步：在新设备恢复，或找回旧数据','点击下面的按钮选择本系统导出的 .json 完整备份。恢复会替换这个浏览器当前的全部业务数据，不能把两份备份叠加。');
 const file=input('file','',{accept:'.json,application/json','aria-label':'选择完整备份文件'});const feedback=notice('请选择完整备份文件。','info');let selected=null;
 file.addEventListener('change',async()=>{selected=null;try{const f=file.files[0];if(!f)return;if(f.size>50*1024*1024)throw new Error('备份超过 50 MB，请联系维护人员。');const value=JSON.parse(await f.text());if(value.format!=='thai-inventory-data-v1'||!value.tables)throw new Error('这不是完整备份；库存表请去“数据导入”。');selected=value;feedback.textContent='已选择：'+f.name+'；备份时间：'+timestamp(value.exported_at)+'；库存商品记录：'+(value.tables.products?.rows.length??'未知')+' 条。';}catch(e){feedback.textContent='文件不能恢复：'+e.message;selected=null;}});
 const apply=button('核对并恢复完整备份',()=>{
  if(!selected){toast('请先选择有效完整备份。',true);return;}
  const root=purchasingModal('确认恢复完整备份');root.append(notice('将用这份备份替换本浏览器当前库存、采购、出货、清仓状态、设置和历史。确认时会先自动下载当前数据备份。请保存该下载文件，以便需要时恢复。'));
  const confirm=button('先备份当前数据，再恢复所选备份',async()=>{confirm.disabled=true;try{await exportFullBackup();const result=await api('backup-restore',selected);await refresh();$('detail').close();toast(result.message);}catch(e){actionFeedback(root,e.message,true);confirm.disabled=false;}},'primary');root.append(button('返回，不恢复',()=>$('detail').close()),confirm);
 },'primary');append(restore,field('选择完整备份文件',file),feedback,apply);parent.append(restore);
 const daily=card('建议的日常使用顺序');daily.append(el('p','打开固定网址 → 导入库存 Excel → 查看风险与补货 → 录入当天采购 / 实际出货 → 下载完整备份。'),el('p','多人使用时请约定一个人维护主备份。其他人导入该备份查看；静态版没有共同数据库，也不会自动合并同时修改的两份数据。','muted'));parent.append(daily);
}
