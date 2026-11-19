const { chromium } = require('../../just-front/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const data=path.resolve(__dirname,'../qa/home-reference');
  const output=path.resolve(__dirname,'../qa/shop-reference');
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let openFixture = false;
    const assets = path.resolve(output,'../browse-reference');
    await page.route('https://test-assets.invalid/open-cover.png', route => route.fulfill({path:path.join(output,'open-cover.png')}));
    await page.route('https://test-assets.invalid/grocery-photo-*.png', route => route.fulfill({path:path.join(assets,new URL(route.request().url()).pathname.slice(1))}));
    await page.route('https://just-pack-it-bq64.onrender.com/**',async route=>{
      const url=new URL(route.request().url());const resource=url.pathname.slice(1);
      let items;
      if(/^products\/[^/]+$/.test(resource)) items=JSON.parse(fs.readFileSync(path.join(data,'products.json'),'utf8')).find(item=>item.id===resource.split('/')[1]);
      else if(/^shops\/[^/]+\/products$/.test(resource)) items=JSON.parse(fs.readFileSync(path.join(output,'pet-products.json'),'utf8'));
      else items=JSON.parse(fs.readFileSync(path.join(data,resource+'.json'),'utf8'));
      if(openFixture && resource==='shops') items=items.map(shop=>shop.name==='pet shop'?{
        ...shop,name:'Sharma Kirana Store',isOpen:true,scheduleLabel:'8 am–10 pm',description:'Your daily essentials, from your local shop.',
        address:'Shop 8, Paud Road, Kothrud, Pune',distanceKm:0.8,rating:4.8,ratingCount:126,
        coverImage:fs.existsSync(path.join(output,'open-cover.png'))?'https://test-assets.invalid/open-cover.png':shop.coverImage,
      }:shop);
      if(openFixture && /^shops\/[^/]+\/products$/.test(resource)) items=['Farm fresh tomatoes','Yelakki bananas','Basmati rice'].map((name,i)=>({
        ...items[0], id:'shop-fixture-'+i,name,unit:['500 g','6 pieces','1 kg'][i],price:[24,61,120][i],
        categorySlug:i===2?'grocery-kirana':'fruits-vegetables',
        image:fs.existsSync(path.join(assets,`grocery-photo-${i}.png`))?`https://test-assets.invalid/grocery-photo-${i}.png`:items[0].image,
      }));
      const q=url.searchParams.get('q')?.toLowerCase();if(q)items=items.filter(item=>`${item.name} ${item.description||''}`.toLowerCase().includes(q));
      await route.fulfill({body:JSON.stringify(items),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
    });
    await page.goto(process.env.PREVIEW_URL||'http://localhost:8084');
    await page.getByText('Shops around you',{exact:true}).waitFor({timeout:60000});
    await page.addStyleTag({content:'[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}'});
    const openShop=async()=>{
      await page.getByText('Browse',{exact:true}).click();
      await page.getByRole('tab',{name:'Shops',exact:true}).click();
      await page.getByText('pet shop',{exact:true}).click();
      await page.getByRole('button',{name:'View dog food',exact:true}).waitFor();
    };
    await openShop();await page.waitForTimeout(500);
    await page.getByTestId('shop-info').getByText(/^Closed/).waitFor();
    await page.screenshot({path:path.join(output,'shop-390-empty-bag.png')});
    await page.getByRole('button',{name:'Save shop to favourites',exact:true}).click();
    await page.getByRole('button',{name:'Remove shop from favourites',exact:true}).waitFor();
    await page.getByRole('button',{name:'Back from shop',exact:true}).click();
    await page.getByPlaceholder('Search products, shops & brands').waitFor();
    await page.getByRole('tab',{name:'Shops',exact:true}).click();
    await page.getByText('pet shop',{exact:true}).click();
    await page.getByRole('button',{name:'Remove shop from favourites',exact:true}).waitFor();
    await page.getByRole('button',{name:'Remove shop from favourites',exact:true}).click();
    await page.getByRole('button',{name:'Save shop to favourites',exact:true}).waitFor();
    await page.getByRole('button',{name:'Add dog food',exact:true}).click();
    await page.getByText('1 item · ₹50',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Increase dog food',exact:true}).click();
    await page.getByText('2 items · ₹100',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Decrease dog food',exact:true}).click();
    await page.getByRole('button',{name:'Decrease dog food',exact:true}).click();
    assert.equal(await page.getByTestId('shop-cart').count(),0);
    await page.getByRole('button',{name:'Add dog food',exact:true}).click();
    await page.getByRole('textbox',{name:'Search this shop',exact:true}).fill('no-match-product');
    await page.getByText('No products match these filters.',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Search this shop',exact:true}).fill('dog');
    await page.getByRole('button',{name:'View dog food',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Search this shop',exact:true}).fill('');
    await page.getByRole('tab',{name:'Pet Supplies',exact:true}).click();
    await page.getByRole('button',{name:'Sort and filter products',exact:true}).click();
    await page.getByRole('radio',{name:'Price: low to high',exact:true}).click();
    await page.getByRole('checkbox',{name:'In stock only',exact:true}).click();
    await page.getByRole('button',{name:'Show products',exact:true}).click();
    await page.getByRole('button',{name:'View dog food',exact:true}).click();
    await page.getByText('A fresher kind of local',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Back from product',exact:true}).click();
    await page.getByRole('tab',{name:'All',exact:true}).click();
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(output,'shop-390.png')});
    for(const width of [360,375,430]){
      await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const bar=await page.getByTestId('shop-cart').boundingBox();assert.ok(bar.y+bar.height<=824);
      await page.screenshot({path:path.join(output,`shop-${width}.png`)});
    }
    await page.getByRole('button',{name:'View shop bag',exact:true}).click();
    await page.getByText('Your bag',{exact:true}).waitFor();await page.getByText('dog food',{exact:true}).waitFor();
    openFixture=true;
    await page.evaluate(()=>sessionStorage.removeItem('jpi.bag.guest'));
    await page.setViewportSize({width:390,height:844});
    await page.reload();
    await page.getByText('Shops around you',{exact:true}).waitFor();
    await page.addStyleTag({content:'[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}'});
    await page.getByText('Browse',{exact:true}).click();
    await page.getByRole('tab',{name:'Shops',exact:true}).click();
    await page.getByRole('button',{name:'Sharma Kirana Store',exact:true}).click();
    await page.getByTestId('shop-info').getByText(/^Open · 8 am/).waitFor();
    await page.getByRole('tab',{name:'Groceries',exact:true}).click();
    await page.getByRole('button',{name:'View Basmati rice',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'View Farm fresh tomatoes',exact:true}).count(),0);
    await page.getByRole('tab',{name:'Produce',exact:true}).click();
    await page.getByRole('button',{name:'View Farm fresh tomatoes',exact:true}).waitFor();
    await page.getByRole('button',{name:'Add Farm fresh tomatoes',exact:true}).click();
    await page.getByRole('button',{name:'Add Yelakki bananas',exact:true}).click();
    await page.getByText('2 items · ₹85',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'All',exact:true}).click();
    await page.getByTestId('shop-catalogue').evaluate(node => { node.scrollTop = 0; });
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,'open-shop-390.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: Browse → Shop, favourite save/remove/persistence, search, category filter, sort/stock sheet, Product Details, Add/+/-/zero, ₹50/₹100 totals, sticky bag, 360/375/390/430px, existing Bag navigation.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
