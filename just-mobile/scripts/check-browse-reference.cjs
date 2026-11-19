const { chromium } = require('../../just-front/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const data = path.resolve(__dirname, '../qa/home-reference');
  const output = path.resolve(__dirname, '../qa/browse-reference');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    const errors = [];
    let brandedFixture = false;
    await page.route('https://test-assets.invalid/grocery-photo-*.png', route => route.fulfill({path:path.join(output,new URL(route.request().url()).pathname.slice(1))}));
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://just-pack-it-bq64.onrender.com/**',async route=>{
      const url = new URL(route.request().url());
      const resource = url.pathname.slice(1);
      if (brandedFixture && resource === 'products/grocery-test-1') {
        const product = JSON.parse(fs.readFileSync(path.join(data,'products.json'),'utf8'))[0];
        return route.fulfill({json:{...product,id:'grocery-test-1',name:'Yelakki bananas',unit:'6 pieces',price:45},headers:{'access-control-allow-origin':'*'}});
      }
      if(resource.startsWith('auth/')) return route.abort(); // No login submitted in navigation QA.
      if(/^shops\/[^/]+\/products$/.test(resource)) {
        const products=JSON.parse(fs.readFileSync(path.join(data,'products.json'),'utf8'));
        return route.fulfill({body:JSON.stringify(products.filter(item=>item.shopId===resource.split('/')[1])),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
      }
      let items = JSON.parse(fs.readFileSync(path.join(data,resource+'.json'),'utf8'));
      if (brandedFixture && resource === 'products') {
        items = ['Amul','Tata Sampann','Aashirvaad'].map((brand,index) => ({
          ...items[0], id: 'brand-test-' + index, name: 'Test product ' + index,
          attributes: [{label:'Brand',value:brand}],
        }));
      }
      if (brandedFixture && resource === 'products' && (url.searchParams.get('category') === 'grocery-kirana' || url.searchParams.get('q') === 'tomato')) {
        const photo = items[0].image;
        items = ['Farm fresh tomatoes', 'Yelakki bananas', 'Premium basmati rice', 'Fresh milk'].map((name,index) => ({
          ...items[0], id: 'grocery-test-' + index, name, description: 'Tomato search fixture', attributes: [], categorySlug:'grocery-kirana',
          image: fs.existsSync(path.join(output,`grocery-photo-${index}.png`)) ? `https://test-assets.invalid/grocery-photo-${index}.png` : photo,
          unit:['500 g','6 pieces','1 kg','500 ml'][index], price:[24,45,120,30][index],
          variants:[], stock:5,
        }));
        const sort = url.searchParams.get('sort');
        if (sort === 'price_asc') items.sort((a,b)=>a.price-b.price);
        if (sort === 'price_desc') items.sort((a,b)=>b.price-a.price);
        if (sort === 'name') items.sort((a,b)=>a.name.localeCompare(b.name));
      }
      if (url.searchParams.has('category')) items = items.filter(item=>item.categorySlug===url.searchParams.get('category'));
      const q = url.searchParams.get('q')?.trim().toLowerCase();
      if (brandedFixture && resource === 'shops' && q === 'tomato') items = [{...items[0], description: 'Tomato search fixture'}];
      if(q) items=items.filter(item=>[item.name,item.description,item.tagline,item.locality].filter(Boolean).some(text=>text.toLowerCase().includes(q)));
      await route.fulfill({body:JSON.stringify(items),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
    });
    await page.goto(process.env.PREVIEW_URL || 'http://localhost:8084');
    await page.getByText('Shops around you',{exact:true}).waitFor({timeout:60000});
    await page.getByText('Browse',{exact:true}).click();
    await page.getByPlaceholder('Search products, shops & brands').waitFor();
    // Simulate the reference phone's OS insets; no fake status/battery UI.
    await page.addStyleTag({content:'[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}'});
    await page.screenshot({path:path.join(output,'browse-initial.png')});
    assert.equal(await page.getByRole('tab',{name:'Categories',selected:true}).count(),1);
    for(const name of ['Groceries & staples','Fruits & vegetables','Dairy & eggs','Bakery','Pet Supplies']) assert.equal(await page.getByRole('button',{name,exact:true}).count(),1);
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(output,'browse-390.png')});
    await page.getByRole('button',{name:'Pet Supplies',exact:true}).scrollIntoViewIfNeeded();
    await page.getByLabel('Notifications',{exact:true}).click();
    await page.getByText('Notifications',{exact:true}).waitFor();
    await page.getByText('← Home',{exact:true}).click();
    await page.getByRole('button',{name:'Groceries & staples',exact:true}).click();
    await page.getByText('No products are available in this category yet.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Back to Browse categories',exact:true}).click();
    await page.getByRole('button',{name:'Explore nearby shops',exact:true}).click();
    await page.getByText('Shops near Raiyam',{exact:true}).waitFor();
    await page.getByText('2 shops',{exact:true}).waitFor();
    await page.getByText('OM CYBER CAFE RAIYAM',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'shops-390.png')});
    for (const [width,height] of [[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({width,height});
      const card = await page.getByRole('button',{name:'OM CYBER CAFE RAIYAM',exact:true}).boundingBox();
      assert.ok(card && Math.abs(card.width - (width - 40)) < 2);
      await page.screenshot({path:path.join(output,`shops-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    const shopSearch = page.getByRole('textbox',{name:'Search products, shops and brands'});
    await shopSearch.fill('cyber');
    await page.getByText('1 shop',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'pet shop',exact:true}).count(),0);
    await shopSearch.fill('no-matching-shop');
    await page.getByText('No matching shops in this area.',{exact:true}).waitFor();
    await shopSearch.fill('');
    await page.getByText('2 shops',{exact:true}).waitFor();
    await page.getByText('OM CYBER CAFE RAIYAM',{exact:true}).click();
    await page.getByText('Fresh picks for today',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Back from shop',exact:true}).click();
    await page.getByRole('tab',{name:'Brands',exact:true}).click();
    await page.getByText('No brands have been added in this area yet.',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'Categories',exact:true}).click();
    await page.getByRole('textbox',{name:'Search products, shops and brands'}).fill('dog');
    await page.getByRole('button',{name:'View dog food',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'search-390.png')});
    await page.getByRole('textbox',{name:'Search products, shops and brands'}).fill('zz-no-match');
    await page.getByText('No products found.',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Search products, shops and brands'}).fill('');
    for(const width of [360,375,430]) {
      await page.setViewportSize({width,height:844});
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(output,`browse-${width}.png`)});
    }
    await page.getByText('Home',{exact:true}).click();
    await page.getByText('Shops around you',{exact:true}).waitFor();
    await page.getByText('Bag',{exact:true}).click();
    await page.getByText('Your bag is empty',{exact:true}).waitFor();
    await page.getByText('Orders',{exact:true}).click();
    await page.getByText('Sign in to view orders',{exact:true}).waitFor();
    await page.getByText('Account',{exact:true}).click();
    await page.getByText('Sign in to shop',{exact:true}).waitFor();
    await page.getByText('Browse',{exact:true}).click();
    await page.getByPlaceholder('Search products, shops & brands').waitFor();
    assert.deepEqual(errors,[]);
    await page.getByRole('textbox',{name:'Search products, shops and brands'}).fill('dog');
    await page.getByRole('button',{name:'View dog food',exact:true}).waitFor();
    await page.getByText('+ Add',{exact:true}).click();
    await page.getByText('Bag · 1',{exact:true}).click();
    await page.getByText('Your bag',{exact:true}).waitFor();
    await page.getByText('dog food',{exact:true}).waitFor();
    brandedFixture = true;
    await page.evaluate(() => sessionStorage.removeItem('jpi.bag.guest'));
    await page.reload();
    await page.getByText('Shops around you',{exact:true}).waitFor();
    await page.getByText('Browse',{exact:true}).click();
    await page.addStyleTag({content:'[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}'});
    await page.getByRole('tab',{name:'Brands',exact:true}).click();
    const card = page.getByRole('button',{name:/^Amul/});
    await card.waitFor();
    for (const [width,height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({width,height});
      const box = await card.boundingBox();
      assert.ok(box && Math.abs(box.width - (width - 40)) < 2);
      await page.screenshot({path:path.join(output,`brands-${width}.png`)});
    }
    await page.getByRole('textbox',{name:'Search products, shops and brands'}).fill('amul');
    await page.getByRole('button',{name:/^Amul/}).waitFor();
    assert.equal(await page.getByRole('button',{name:/^Tata Sampann/}).count(),0);
    await card.click();
    await page.getByRole('button',{name:'View Test product 0',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'View Test product 1',exact:true}).count(),0);
    await page.getByRole('tab',{name:'Categories',exact:true}).click();
    await page.getByRole('textbox',{name:'Search products, shops and brands'}).fill('');
    await page.getByRole('button',{name:'Groceries & staples',exact:true}).click();
    const gridCards = page.getByRole('button',{name:/^View (Farm fresh|Yelakki|Premium|Fresh milk)/});
    await gridCards.first().waitFor();
    for (const [width,height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({width,height});
      const boxes = await Promise.all([gridCards.nth(0).boundingBox(),gridCards.nth(1).boundingBox()]);
      assert.equal(Math.round(boxes[0].y),Math.round(boxes[1].y));
      if (fs.existsSync(path.join(output,'grocery-photo-0.png'))) {
        await page.waitForFunction(() => [...document.images].some(img => img.src.includes('grocery-photo') && img.complete && img.naturalWidth > 0));
      }
      await page.screenshot({path:path.join(output,`groceries-${width}.png`)});
    }
    await page.getByRole('button',{name:'All groceries',exact:true}).click();
    for (const [option,first] of [['Price: High to Low','Premium basmati rice'],['Price: Low to High','Farm fresh tomatoes'],['Name: A to Z','Farm fresh tomatoes'],['Popular','Farm fresh tomatoes']]) {
      await page.getByRole('button',{name:/^Sort:/}).click();
      const request = page.waitForResponse(response=>response.url().includes('category=grocery-kirana'));
      await page.getByRole('button',{name:option,exact:true}).click();
      await request;
      await gridCards.first().waitFor();
      assert.equal(await gridCards.first().getAttribute('aria-label'),'View '+first);
    }
    await page.getByRole('textbox',{name:'Search in groceries'}).fill('banana');
    await page.getByRole('button',{name:'View Yelakki bananas',exact:true}).waitFor();
    assert.equal(await gridCards.count(),1);
    await page.getByText('+ Add',{exact:true}).click();
    await page.getByText('Bag · 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'View Yelakki bananas',exact:true}).click();
    await page.getByRole('button',{name:'Back from product',exact:true}).waitFor();
    await page.getByRole('button',{name:'Back from product',exact:true}).click();
    await page.getByRole('button',{name:'Back to Browse categories',exact:true}).click();
    await page.evaluate(() => sessionStorage.removeItem('jpi.bag.guest'));
    await page.reload();
    await page.getByText('Shops around you',{exact:true}).waitFor();
    await page.getByText('Browse',{exact:true}).click();
    await page.addStyleTag({content:'[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}'});
    const search = page.getByRole('textbox',{name:'Search products, shops and brands'});
    await search.fill('tomato');
    await page.getByRole('tab',{name:'Products 4',exact:true}).waitFor();
    await page.getByRole('tab',{name:'Shops 1',exact:true}).waitFor();
    await page.getByRole('tab',{name:'Brands 0',exact:true}).waitFor();
    await search.blur();
    for (const [width,height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:path.join(output,`search-tomato-${width}.png`)});
    }
    await page.getByRole('tab',{name:'Shops 1',exact:true}).click();
    await page.getByRole('button',{name:'OM CYBER CAFE RAIYAM',exact:true}).click();
    await page.getByRole('button',{name:'Back from shop',exact:true}).click();
    await page.getByRole('tab',{name:'Brands 0',exact:true}).click();
    await page.getByText('No brands found.',{exact:true}).waitFor();
    await search.fill('AmUl');
    await page.getByRole('button',{name:/^Amul/}).click();
    await page.getByRole('button',{name:'View Test product 0',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'View Test product 1',exact:true}).count(),0);
    await page.getByRole('button',{name:'Clear search',exact:true}).click();
    await page.getByRole('tab',{name:'Categories',selected:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: Browse regression, category shopping, and global search counts, result tabs and navigation at four widths.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
