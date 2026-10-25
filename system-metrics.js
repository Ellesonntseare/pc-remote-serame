'use strict';
const os=require('node:os');
const {execFile}=require('node:child_process');
function percent(value){return Number.isFinite(value)&&value>=0&&value<=100?Math.round(value):null;}
function normalize(value={}){
  return {gpu:percent(value.gpu),disk:percent(value.disk),gpuName:typeof value.gpuName==='string'?value.gpuName.slice(0,180):null};
}
function createSystemMetrics({disabled=false,read,now=Date.now}={}){
  const basic={os:process.platform==='win32'?'Windows '+(Number(os.release().split('.')[2])>=22000?'11':'10'):os.type(),processor:os.cpus()[0]?.model.trim()||null,memoryGB:Math.round(os.totalmem()/1073741824)};
  let detail=normalize(),busy=false,last=-Infinity,closed=false,child=null;
  function refresh(){
    if(closed||busy||disabled||now()-last<30000||process.platform!=='win32'&&!read)return;
    busy=true;last=now();
    const callback=(error,output)=>{busy=false;child=null;if(closed||error)return;try{detail=normalize(typeof output==='string'?JSON.parse(output.trim()):output);}catch{}};
    if(read){Promise.resolve().then(read).then(result=>callback(null,result),error=>callback(error));return;}
    // Fixed queries, once per 30 seconds across all clients. Missing GPU drivers
    // remain null instead of appearing as a fabricated zero percent reading.
    const script="$ErrorActionPreference='Stop'; $disk=Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Measure-Object -Property Size,FreeSpace -Sum; $size=($disk|Where-Object Property -eq 'Size').Sum; $free=($disk|Where-Object Property -eq 'FreeSpace').Sum; $adapter=Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name; $gpu=$null; try{$engines=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop | Where-Object Name -Like '*engtype_3D*'); if($engines.Count){$gpu=[math]::Min(100,($engines|Measure-Object UtilizationPercentage -Sum).Sum)}}catch{}; @{disk=$(if($size -gt 0){[math]::Round(100*(1-$free/$size))}else{$null});gpu=$gpu;gpuName=$adapter}|ConvertTo-Json -Compress";
    child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:32768},callback);
  }
  return {get(){refresh();return {...basic,...detail};},close(){closed=true;child?.kill();child=null;}};
}
module.exports={createSystemMetrics,normalize};
