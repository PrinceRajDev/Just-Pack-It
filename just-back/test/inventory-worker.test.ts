import {afterEach,describe,it,expect,vi} from "vitest";
import {startExpiryLoop} from "../src/inventory/worker-loop.js";
afterEach(()=>vi.useRealTimers());
describe("inventory expiry scheduling",()=>{
  it("starts immediately, never overlaps and waits for an active pass on shutdown",async()=>{
    vi.useFakeTimers();let finish!:(value:number)=>void;
    const run=vi.fn(()=>new Promise<number>(resolve=>{finish=resolve;})),result=vi.fn();
    const loop=startExpiryLoop({run,onResult:result,onError:vi.fn(),intervalMs:1000});
    await vi.advanceTimersByTimeAsync(10_000);expect(run).toHaveBeenCalledTimes(1);
    let stopped=false;const stop=loop.stop().then(()=>{stopped=true;});await Promise.resolve();expect(stopped).toBe(false);
    finish(1);await stop;expect(result).toHaveBeenCalledWith(1);
    await vi.advanceTimersByTimeAsync(10_000);expect(run).toHaveBeenCalledTimes(1);
  });
  it("recovers from a failed pass and cancels future timers",async()=>{
    vi.useFakeTimers();const error=vi.fn(),result=vi.fn(),run=vi.fn().mockRejectedValueOnce(new Error("isolated failure")).mockResolvedValue(2);
    const loop=startExpiryLoop({run,onResult:result,onError:error,intervalMs:1000});
    await vi.advanceTimersByTimeAsync(1000);expect(error).toHaveBeenCalledTimes(1);expect(run).toHaveBeenCalledTimes(2);expect(result).toHaveBeenCalledWith(2);
    await loop.stop();await vi.advanceTimersByTimeAsync(5000);expect(run).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid intervals",()=>{expect(()=>startExpiryLoop({run:async()=>0,onResult:vi.fn(),onError:vi.fn(),intervalMs:0})).toThrow();});
});
