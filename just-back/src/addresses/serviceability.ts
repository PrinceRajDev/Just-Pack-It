type Point={type:"Point";coordinates:number[]};
function validPin(pin?:Point|null):pin is Point {
 return !!pin && pin.coordinates.length===2 && pin.coordinates.every(Number.isFinite) && Math.abs(pin.coordinates[0]!)<=180 && Math.abs(pin.coordinates[1]!)<=90;
}
export function pinCoverage(address?:Point|null,shop?:Point|null):{code:string;message:string}|null{
 if(!validPin(address))return {code:"ADDRESS_LOCATION_MISSING",message:"Add a valid map pin to your saved address to check the shop’s 6 km delivery limit."};
 if(!validPin(shop))return {code:"SHOP_LOCATION_MISSING",message:"This shop has no valid map pin, so its delivery distance cannot be verified."};
 const rad=(degrees:number)=>degrees*Math.PI/180,[lng1,lat1]=address.coordinates,[lng2,lat2]=shop.coordinates;
 const a=Math.sin(rad(lat2!-lat1!)/2)**2+Math.cos(rad(lat1!))*Math.cos(rad(lat2!))*Math.sin(rad(lng2!-lng1!)/2)**2;
 const km=6371.0088*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));
 return km>6?{code:"ADDRESS_OUTSIDE_RADIUS",message:"Your delivery pin is more than 6 km from this shop (straight-line distance). Choose another shop or pickup."}:null;
}
