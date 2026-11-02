import { expect, it, vi } from "vitest";
import { readFulfilment } from "../src/cart/fulfilment.js";
const state = vi.hoisted(() => ({ownerId:"owner"}));
vi.mock("../src/addresses/routes.js", () => ({Address:{findOne:vi.fn(() => ({lean:async()=>({_id:"address",version:1,pincode:"999999"})}))}}));
vi.mock("../src/catalogue/owner-eligibility.js", () => ({activeSellerIds:async()=>["owner"]}));
vi.mock("../src/catalogue/models.js", () => ({Area:{find:()=>({lean:async()=>[]})},Category:{find:()=>({lean:async()=>[]})},Shop:{find:()=>({lean:async()=>[{_id:"shop",ownerId:state.ownerId,fulfilment:[],areaIds:[],openingHours:[],timezone:"Asia/Kolkata"}]})}}));
it("returns an explicit ownership blocker without exposing delivery choices", async () => {
  const result=await readFulfilment("owner",{addressId:"address",shopIds:["shop"]});
  expect(result.shops[0]).toEqual({shopId:"shop",options:[],issues:[{code:"OWN_SHOP_PURCHASE",message:"You cannot buy from your own shop."}]});
});
