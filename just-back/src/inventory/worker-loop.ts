/** Injectable scheduling loop; no overlap, and stop waits for in-flight work. */
export function startExpiryLoop<T>({run,onResult,onError,intervalMs=15_000}:{run:()=>Promise<T>;onResult:(result:T)=>void;onError:(error:unknown)=>void;intervalMs?:number}){
  if(!Number.isInteger(intervalMs) || intervalMs<1000)throw new Error("Invalid worker interval");
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  let active:Promise<void>;
  const tick=async()=>{
    try {onResult(await run());}catch(error){onError(error);}
    finally {if(!stopped)timer=setTimeout(()=>{active=tick();},intervalMs);}
  };
  active=tick();
  return {stop:async()=>{stopped=true;if(timer)clearTimeout(timer);await active;}};
}
