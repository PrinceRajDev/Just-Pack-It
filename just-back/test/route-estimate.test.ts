import {afterEach,expect,it,vi} from "vitest";
import {estimateRoute} from "../src/delivery/route-estimate.js";

const rider={latitude:26.01,longitude:86.02};
const dropoff={latitude:26.04,longitude:86.07};
afterEach(()=>vi.unstubAllGlobals());

it("requests a traffic-aware road duration and rounds up to minutes",async()=>{
  const fetchRoute=vi.fn().mockResolvedValue(Response.json({routes:[{duration:"125.2s"}]}));
  vi.stubGlobal("fetch",fetchRoute);
  expect(await estimateRoute("test-key",rider,dropoff)).toBe(3);
  const [url,request]=fetchRoute.mock.calls[0];
  expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
  expect(JSON.parse(request.body)).toMatchObject({origin:{location:{latLng:rider}},destination:{location:{latLng:dropoff}},routingPreference:"TRAFFIC_AWARE"});
});

it("leaves the estimate unavailable when the provider returns no usable route",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({routes:[{duration:"unknown"}]})));
  expect(await estimateRoute("test-key",rider,dropoff)).toBeNull();
});
