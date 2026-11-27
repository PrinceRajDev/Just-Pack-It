import {z} from "zod";

type Coordinates = {latitude:number;longitude:number};
const responseSchema = z.object({routes:z.array(z.object({duration:z.string().regex(/^\d+(?:\.\d+)?s$/)})).optional()});

export async function estimateRoute(key:string, origin:Coordinates, destination:Coordinates) {
  try {
    const response=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"routes.duration"},
      body:JSON.stringify({origin:{location:{latLng:origin}},destination:{location:{latLng:destination}},travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE"}),
      signal:AbortSignal.timeout(4000),
    });
    if(!response.ok)return null;
    const parsed=responseSchema.safeParse(await response.json());
    const duration=parsed.success ? parsed.data.routes?.[0]?.duration : undefined;
    if(!duration)return null;
    const minutes=Math.ceil(Number(duration.slice(0,-1))/60);
    return Number.isSafeInteger(minutes) ? minutes : null;
  } catch {return null;}
}
