const vm=require('node:vm'), fs=require('node:fs'), assert=require('node:assert/strict');
function fixture(settings={}) {
 let t=0, serial=0, timers=new Map(), Klass;
 const clock={setTimeout(fn,ms){const id=++serial;timers.set(id,{at:t+ms,fn});return id},clearTimeout(id){timers.delete(id)}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../smart-camera-switcher.js','utf8'),{
  HTMLElement:class{constructor(){this.dataset={}}},window:clock,customElements:{get:()=>undefined,define:(type,k)=>{assert.equal(type,'smart-camera-switcher');Klass=k}},
  Date:{now:()=>t}, performance:{now:()=>t}, document:{createElement:tag=>{
   if(tag==='canvas') return {isPreview:true,style:{},setAttribute(){},getContext(){return {drawImage(source){if(source.bad)throw Error('synthetic'); canvases.push(source)}}},remove(){slots=slots.filter(x=>x!==this)}};
   const slot={className:'',dataset:{},querySelector:()=>({}),remove(){slots=slots.filter(s=>s!==slot)}};
   slot.classList={contains:x=>slot.className.split(' ').includes(x),remove:x=>{slot.className=slot.className.split(' ').filter(y=>y!==x).join(' ')},add:x=>{slot.className+=' '+x}};
   return slot;
  }}
 });
 let slots=[], media={}, thumbs={}, canvases=[], preparations=0, calls=[], selector='auto', active='a';
 const c=new Klass();
 const cameras=['a','b','c'].map(id=>({id,entity:'camera.'+id}));
 c.querySelectorAll=()=>[];c.setConfig({cameras,selector_entity:'input_select.x',active_entity:'sensor.x',...settings});
 c._hasRendered=true;c._renderedCameraCount=3;c._renderedActiveId='a';
 c.querySelector=()=>({append(s){slots.push(s)},querySelectorAll:()=>slots.filter(x=>!x.isPreview)});
 c.querySelectorAll=s=>s==='.thumb'?Object.entries(thumbs).map(([id,m])=>({dataset:{camera:id},shadowRoot:{children:[m]}})):s.endsWith('.prepared')?slots.filter(x=>!x.isPreview&&x.classList.contains('prepared')):slots.filter(x=>!x.isPreview);
 c._configurePictureCard=(_el,camera)=>{
  preparations++;
  const slot=slots.at(-1);
  const video=media[camera.id];
  if(video) slot.children=[{shadowRoot:{children:[{shadowRoot:{children:[video]}}]}}];
 };c._updateSelectorState=()=>{};c._updateChildHass=()=>{};
 function state(nextSelector=selector,nextActive=active){
  selector=nextSelector;active=nextActive;
  c.hass={states:{'input_select.x':{state:selector},'sensor.x':{state:active},...Object.fromEntries(cameras.map(x=>[x.entity,{state:'streaming'}]))},callService(_d,_m,p){calls.push({option:p.option,t})}};
 }
 function tick(to){while(true){const e=[...timers].filter(([,v])=>v.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!e)break;t=e[1].at;timers.delete(e[0]);e[1].fn()}t=to;}
 state();
 return {c,cameras,state,tick,calls,prepared:()=>preparations, media, thumbs, canvases};
}
const native=()=>{
 let callbacks=new Map(),count=0;const retained=[];
 return {tagName:'VIDEO',videoWidth:640,videoHeight:360,readyState:4,paused:false,ended:false,
 requestVideoFrameCallback(fn){retained.push(fn);callbacks.set(++count,fn);return count},
 cancelVideoFrameCallback(id){callbacks.delete(id)},active(){return callbacks.size},
 fire(mediaTime=1,presentedFrames=1,presentationTime){const [id,fn]=[...callbacks][0]??[];if(fn){callbacks.delete(id);fn(0,{mediaTime,presentedFrames,presentationTime})}},
 old(){retained[0]?.(0,{mediaTime:100,presentedFrames:100})}
 };
};
const still=()=>({tagName:'IMG',naturalWidth:640,naturalHeight:480,complete:true});
{
 const {c,cameras,state,calls,tick,media,thumbs,canvases}=fixture({manual_timeout_seconds:5});
 const b=media.b=native();const img=thumbs.b=still();
 c._selectCamera(cameras[1]);const same=c._viewerSlotFor('b');assert.equal(canvases[0],img);
 assert.equal(c.dataset.cameraPreviewPhase,'thumbnail');state('b','none');
 tick(2000);assert.equal(c._renderedActiveId,'b');assert.equal(c._viewerSlotFor('b'),same);
 b.old();tick(9000);assert.ok(c._manualPreview);assert.deepEqual(calls,[{option:'b',t:0}]);
 b.fire(1,1,8900);tick(9250);b.fire(1,2,9200);assert.ok(c._manualPreview,'static time does not count');
 tick(9500);b.fire(2,3,9450);assert.equal(c._manualPreview,undefined);
 assert.equal(c.dataset.cameraPreviewPhase,'live');
 tick(14499);assert.equal(calls.length,1);tick(14500);assert.deepEqual(calls,[{option:'b',t:0},{option:'auto',t:14500}]);
 state('auto','a');assert.equal(c._renderedActiveId,'a');assert.equal(c.dataset.cameraPreviewPhase,'auto');
}
{
 const {c,cameras,state,calls,tick,media,thumbs}=fixture({manual_timeout_seconds:5});
 const b=media.b=native();const third=media.c=native();thumbs.b=still();
 state('auto','c');c._selectCamera(cameras[1]);third.old();state('auto','c');
 tick(250);b.fire();assert.equal(c._renderedActiveId,'b');assert.ok(c._manualPreview);
 state('b','c');tick(500);b.fire(1,1,300);assert.ok(c._manualPreview);
 c._selectCamera(cameras[2]);b.old();state('c','c');
 tick(700);third.fire();assert.equal(c._renderedActiveId,'c');assert.equal(c._manualPreview,undefined);
 tick(900);third.fire(1,1,850);tick(1150);third.fire(2,2,1100);
 assert.equal(c.dataset.cameraPreviewPhase,'live');tick(6150);assert.equal(calls.at(-1).option,'auto');
}
{
 const {c,cameras,state,tick,media,calls}=fixture({manual_timeout_seconds:5});
 const b=media.b={tagName:'VIDEO',videoWidth:640,videoHeight:360,readyState:4,currentTime:0,webkitDecodedFrameCount:1};
 c._selectCamera(cameras[1]);state('b');tick(8000);assert.equal(calls.length,1);assert.equal(c.dataset.cameraPreviewPhase,'waiting');
 b.currentTime=10;tick(8250);assert.equal(c.dataset.cameraPreviewPhase,'waiting');
 b.webkitDecodedFrameCount=2;tick(8500);assert.equal(c.dataset.cameraPreviewPhase,'live');
 tick(13500);assert.equal(calls.at(-1).option,'auto');
}
{
 const {c,state,tick,media,prepared}=fixture();const b=media.b=native();state('auto','b');
 tick(350);b.fire();assert.equal(c._renderedActiveId,'b');state('auto','none');
 tick(3349);assert.equal(c._renderedActiveId,'b');tick(3350);assert.equal(c._renderedActiveId,'a');
 state('auto','c');tick(5350);assert.equal(c._renderedActiveId,'a');state('auto','c');assert.equal(prepared(),3);
}
{
 const {c,cameras,state,tick,media,calls}=fixture({manual_timeout_seconds:5});
 media.b={tagName:'VIDEO',videoWidth:640,videoHeight:360,readyState:4,currentTime:10};
 c._selectCamera(cameras[1]);state('b');tick(25000);assert.equal(calls.length,1);c.disconnectedCallback();
}
console.log('PASS: delayed past 8s, stale/pre-promotion and static frames rejected; early/live promotion uses visible progress; Fire fallback requires both counters; unsupported pins; latest manual, motion, default and cleanup.');
