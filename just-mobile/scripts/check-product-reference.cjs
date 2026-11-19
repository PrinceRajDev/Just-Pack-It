const {chromium}=require('../../just-front/node_modules/playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const data=path.resolve(__dirname,'../qa/home-reference'),output=path.resolve(__dirname,'../qa/product-reference');
 const live=JSON.parse(fs.readFileSync(path.join(output,'product.json'),'utf8'));
 const liveShops=JSON.parse(fs.readFileSync(path.join(data,'shops.json'),'utf8'));
 const liveProducts=JSON.parse(fs.readFileSync(path.join(data,'products.json'),'utf8'));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  for(const fixture of [false,true]){
   const context=await browser.newContext({viewport:{width:440,height:1040},deviceScaleFactor:1});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   // The positive multi-offer case is isolated HTTP test data only. It never
   // enters application code, the backend, or a production database.
   const own=fixture?{...live,unit:'500 g',price:28,mrp:35,stock:7,attributes:[{label:'Brand',value:'QA-only matched brand'}],variants:[{id:'qa-own-500',label:'500 g',price:28,stock:3},{id:'qa-own-1kg',label:'1 kg',price:52,stock:4}],images:[live.image,liveShops[0].coverImage]}:live;
   const other=fixture?{...own,id:liveProducts.find(item=>item.id!==live.id).id,shopId:liveShops.find(shop=>shop.id!==live.shopId).id,price:32,mrp:40,variants:[{id:'qa-other-500',label:'500 g',price:32,stock:3},{id:'qa-other-1kg',label:'1000 g',price:60,stock:2}]}:null;
   const products=fixture?[own,other]:liveProducts;
   const shops=fixture?liveShops.map(shop=>({...shop,isOpen:true})):liveShops;
   await page.route('https://just-pack-it-bq64.onrender.com/**',async route=>{
    const url=new URL(route.request().url()),resource=url.pathname.slice(1);let result;
    if(resource===`products/${live.id}`)result=own;
    else if(/^shops\/[^/]+\/products$/.test(resource))result=products.filter(item=>item.shopId===resource.split('/')[1]);
    else if(resource==='products')result=products;
    else if(resource==='shops')result=shops;
    else result=JSON.parse(fs.readFileSync(path.join(data,resource+'.json'),'utf8'));
    await route.fulfill({body:JSON.stringify(result),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
   });
   await page.goto(process.env.PREVIEW_URL||'http://localhost:8084');await page.getByText('Good shops. Close by.',{exact:true}).waitFor({timeout:60000});
   await page.addStyleTag({content:'[data-testid="buyer-shell"],[data-testid="product-safe"]{padding-top:40px!important;padding-bottom:20px!important}'});
   await page.getByText('Browse',{exact:true}).click();await page.getByRole('tab',{name:'Shops',exact:true}).click();await page.getByText('pet shop',{exact:true}).click();
   await page.getByRole('button',{name:'View dog food',exact:true}).click();
   const add=page.getByRole('button',{name:'Add selected product to bag',exact:true});await add.waitFor();await page.waitForFunction(()=>{const e=document.querySelector('[data-testid="product-add"]');return e&&e.getAttribute('aria-disabled')!=='true';});
   await page.getByRole('radio',{name:'Shop pet shop',exact:true}).waitFor();
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="product-gallery"] img')].some(image=>image.complete&&image.naturalWidth>0));
   await page.waitForTimeout(400);
   if(!fixture){
    await page.getByText('No other verified equivalent offers are available.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Image 1 of 1',exact:true}).count(),1);
    await page.screenshot({path:path.join(output,'product-440x1040.png')});
    await page.getByRole('button',{name:'Save product to favourites',exact:true}).click();await page.getByRole('button',{name:'Remove product from favourites',exact:true}).waitFor();
    await page.getByRole('button',{name:'Back from product',exact:true}).click();await page.getByRole('button',{name:'View dog food',exact:true}).click();
    await page.getByRole('button',{name:'Remove product from favourites',exact:true}).waitFor();
    await page.getByRole('button',{name:'Add selected product to bag',exact:true}).click();
    const lines=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('jpi.bag.guest')||'[]'));assert.equal(lines[0].price,50);assert.equal(lines[0].quantity,1);
    for(const [width,height] of [[440,844],[390,844],[360,800],[375,812],[430,932]]){
     await page.setViewportSize({width,height});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
     await page.getByTestId('product-scroll').evaluate(element=>{element.scrollTop=0;});
     const bar=await page.getByTestId('product-add').boundingBox();assert.ok(bar.y+bar.height<=height-20);
     await page.screenshot({path:path.join(output,`product-${width}x${height}.png`)});
     const footer=page.getByText('Available from pet shop.',{exact:true});await footer.scrollIntoViewIfNeeded();
     const footerBox=await footer.boundingBox(),ctaBox=await add.boundingBox();assert.ok(footerBox.y+footerBox.height<=ctaBox.y);
     if(width===390)await page.screenshot({path:path.join(output,'product-390-bottom.png')});
    }
    await page.getByRole('button',{name:'Back from product',exact:true}).click();await page.getByRole('button',{name:'View shop bag',exact:true}).click();await page.getByText('Your bag',{exact:true}).waitFor();
   }else{
    await page.getByText('20% less than MRP',{exact:true}).waitFor();await page.getByText('BEST NEARBY PRICE',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Image 2 of 2',exact:true}).click();await page.waitForTimeout(400);
    assert.equal(await page.getByTestId('product-gallery').locator('div').evaluateAll(elements=>elements.some(element=>element.scrollLeft>100)),true);
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    assert.equal(await page.getByTestId('product-gallery').locator('div').evaluateAll(elements=>elements.some(element=>element.scrollLeft>300)),true);
    await page.setViewportSize({width:440,height:1040});await page.waitForTimeout(300);
    await page.getByRole('radio',{name:'Pack 1 kg',exact:true}).click();await page.getByText('Add to bag · ₹52',{exact:true}).waitFor();
    assert.equal(await page.getByText('20% less than MRP',{exact:true}).count(),0);
    await page.getByRole('radio',{name:'Shop OM CYBER CAFE RAIYAM',exact:true}).click();await page.getByText('Add to bag · ₹60',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'product-test-only-offers.png')});
    await add.click();await add.click();
    const lines=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('jpi.bag.guest')||'[]'));
    assert.equal(lines[0].productId,other.id);assert.equal(lines[0].variantId,'qa-other-1kg');assert.equal(lines[0].shopId,other.shopId);assert.equal(lines[0].price,60);assert.equal(lines[0].quantity,2);assert.equal(lines[0].unit,'1000 g');
    assert.equal(await add.isDisabled(),true);
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: live product, favourite persistence, image/empty-offer truthfulness, shared bag, 440x1040/440x844/390x844/360x800/375x812/430x932. Isolated fixtures: carousel, MRP/discount, pack/seller switching, preserved equivalent pack, correct variant payload and stock cap.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
