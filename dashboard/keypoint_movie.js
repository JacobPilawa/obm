// Snapshot only the on-screen card state; signals are reloaded from local data.
export function movieCardState(card,stage){
 if(!card||card.hidden||!card.getClientRects().length)return null;
 const box=card.getBoundingClientRect(),frame=stage.getBoundingClientRect();
 return {x:box.left-frame.left,y:box.top-frame.top,width:box.width,height:box.height};
}
