// Keep the existing layer controls and their export state; expose checkbox semantics.
function syncCheckbox(button){button.setAttribute('role','checkbox');button.setAttribute('aria-checked',button.getAttribute('aria-pressed')==='true'?'true':'false')}
function checkboxes(root){for(const button of root.querySelectorAll('.layerMenuPanel button.soloLayer'))syncCheckbox(button)}
export function initDisplayControls(){
 checkboxes(document);
 const observer=new MutationObserver(records=>{for(const record of records)if(record.target.matches('.layerMenuPanel button.soloLayer'))syncCheckbox(record.target)});
 observer.observe(document.querySelector('.shell'),{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
}
export function organizeComparisonControls(root){
 for(const card of root.querySelectorAll('.compareTrialCard')){
  const layers=card.querySelector('.compareTrialLayers'),explore=document.createElement('div'),camera=document.createElement('div');
  explore.className='compareControlGroup';explore.setAttribute('role','group');explore.setAttribute('aria-label','Explore this replay');
  camera.className='compareControlGroup compareCameraGroup';camera.setAttribute('role','group');camera.setAttribute('aria-label','Camera and matching');
  explore.append(card.querySelector('.compareTrialFocus'),layers.querySelector('[data-compare-keypoints]'));
  camera.append(layers.querySelector('[data-compare-snap]'),layers.querySelector('[data-compare-match]'));
  layers.before(explore);layers.after(camera);
  const readout=card.querySelector('.compareTrialFocusValue');explore.after(readout);
  const trail=card.querySelector('[data-compare-sweep-moment]')?.closest('label');if(trail)layers.querySelectorAll('.layerMenuPanel')[0].append(trail);
 }
 checkboxes(root);
}
