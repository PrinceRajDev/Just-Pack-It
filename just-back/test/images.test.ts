import {describe,it,expect} from "vitest";
import sharp from "sharp";
import {prepareImage} from "../src/images/service.js";
describe("image content validation",()=>{
  it("decodes actual bytes, strips metadata and bounds dimensions",async()=>{
    const data=await sharp({create:{width:2000,height:1000,channels:3,background:"red"}}).withMetadata().jpeg().toBuffer();
    const result=await prepareImage(data,"image/jpeg");const metadata=await sharp(result).metadata();
    expect(metadata.format).toBe("webp");expect(metadata.width).toBe(1600);expect(metadata.height).toBe(800);expect(metadata.exif).toBeUndefined();
  });
  it("rejects malformed files and mismatched declarations",async()=>{
    await expect(prepareImage(Buffer.from("not an image"),"image/png")).rejects.toMatchObject({code:"INVALID_IMAGE"});
    const png=await sharp({create:{width:2,height:2,channels:3,background:"red"}}).png().toBuffer();
    await expect(prepareImage(png,"image/jpeg")).rejects.toMatchObject({code:"INVALID_IMAGE"});
    await expect(prepareImage(Buffer.alloc(0),"image/png")).rejects.toMatchObject({code:"EMPTY_IMAGE"});
    await expect(prepareImage(Buffer.alloc(5*1024*1024+1),"image/png")).rejects.toMatchObject({code:"IMAGE_TOO_LARGE"});
  });
});
