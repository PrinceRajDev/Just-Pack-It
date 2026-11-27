const { chromium } = require("../../just-front/node_modules/playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const output = path.resolve(__dirname, "../qa/guest-home");
  const snapshot = path.resolve(__dirname, "../qa/home-reference");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let emptyMarket = false;
    let areaRequests = 0;
    let categoryRequests = 0;
    let releaseStartup;
    const startup = new Promise(resolve => { releaseStartup = resolve; });
    await page.route("https://just-pack-it-bq64.onrender.com/**", async route => {
      const url = new URL(route.request().url());
      const resource = url.pathname.slice(1);
      if (resource === "areas") {
        areaRequests++;
        await startup;
      }
      if (resource.startsWith("auth/")) return route.abort();
      let records = JSON.parse(fs.readFileSync(path.join(snapshot, resource + ".json"), "utf8"));
      if (emptyMarket && (resource === "shops" || resource === "products")) records = [];
      const category = url.searchParams.get("category");
      if (resource === "products" && category) categoryRequests++;
      const query = url.searchParams.get("q")?.toLowerCase();
      if (category) records = records.filter(item => item.categorySlug === category);
      if (query) records = records.filter(item => item.name.toLowerCase().includes(query));
      await route.fulfill({ json: records, headers: { "access-control-allow-origin": "*" } });
    });
    let failRegistrationOptions = false;
    await page.route("**/auth/registration-options", route => {
      const headers = {"access-control-allow-origin":"*"};
      if (failRegistrationOptions) {
        failRegistrationOptions = false;
        return route.fulfill({status:503,json:{message:"Try again"},headers});
      }
      return route.fulfill({json:{emailOtpRequired:true,emailOtpAvailable:true},headers});
    });
    await page.goto(process.env.PREVIEW_URL || "http://localhost:8084", { timeout: 60000 });
    const loader = page.getByRole("heading", {name:"Loading JustPackIt…",exact:true});
    await loader.waitFor();
    const startupScreen = page.getByTestId("startup-screen");
    await startupScreen.getByText("JustPackIt", { exact: true }).waitFor();
    assert.equal(await page.getByText("Bag", { exact: true }).count(), 0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loader.waitFor();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(await page.getByText("Loading Raiyam",{exact:true}).count(),0);
    releaseStartup();
    await loader.waitFor({state:"hidden"});
    await page.getByText("Shop by category", { exact: true }).waitFor();
    await page.getByRole("heading", {name:"Your neighbourhood, delivered."}).waitFor();
    await page.waitForFunction(() => {
      const photo = document.querySelector('[data-testid="home-hero-photo"] img');
      return photo && photo.complete && photo.naturalWidth > 0;
    });
    const shell = page.getByTestId("buyer-shell");
    const backgroundIs = (element, expected) =>
      page.waitForFunction(({ node, color }) => getComputedStyle(node).backgroundColor === color,
        { node: element, color: expected });
    const shellNode = await shell.elementHandle();
    await page.emulateMedia({ colorScheme: "dark" });
    await backgroundIs(shellNode, "rgb(255, 249, 242)");
    await page.screenshot({ path: path.join(output, "guest-system-dark-390.png") });
    await page.emulateMedia({ colorScheme: "light" });
    await backgroundIs(shellNode, "rgb(255, 249, 242)");
    await page.addStyleTag({content:'[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}'});
    for (const [width,height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(300);
      const tiles = await Promise.all(["Groceries","Vegetables","Fruits","Dairy","Bakery","Personal care","Home care","Snacks"].map(name => page.getByRole("button",{name,exact:true}).boundingBox()));
      assert.ok(tiles.every(tile => tile && tile.x >= 0 && tile.x + tile.width <= width));
      assert.equal(new Set(tiles.map(tile => Math.round(tile.y))).size,2);
      await page.screenshot({path:path.join(output,`guest-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"Change browsing area"}).click();
    await page.getByText("Choose browsing area",{exact:true}).waitFor();
    const selectedArea = page.getByRole("radio",{name:"Raiyam",exact:true});
    assert.equal(await selectedArea.getAttribute("aria-checked"),"true");
    await selectedArea.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="delivery-area-sheet"]')?.getBoundingClientRect().bottom <= innerHeight + 1);
    await page.screenshot({path:path.join(output,"delivery-area-390.png")});
    await page.getByText("Raiyam is currently the only available browsing area.", { exact: true }).waitFor();
    const beforeReselect = areaRequests;
    await selectedArea.click();
    await page.getByTestId("delivery-area-sheet").waitFor({state:"hidden"});
    assert.equal(areaRequests, beforeReselect);
    for (const name of ["Groceries","Vegetables","Fruits","Dairy","Bakery","Personal care","Home care","Snacks"]) {
      await page.getByRole("button",{name,exact:true}).click();
      await page.getByText("No active products are available in this category",{exact:true}).waitFor();
      if (name === "Groceries") {
        const beforeRefresh = categoryRequests;
        await page.getByRole("button", { name: "Refresh products", exact: true }).click();
        await page.getByText("No active products are available in this category", { exact: true }).waitFor();
        assert.equal(categoryRequests, beforeRefresh + 1);
      }
      await page.getByRole("button",{name:"Back to Home"}).click();
    }
    await page.getByRole("button",{name:"More →",exact:true}).click();
    await page.getByText("All categories",{exact:true}).waitFor();
    const allCategories = page.getByTestId("all-categories");
    for (const width of [360,390,430]) {
      await page.setViewportSize({width,height:844});
      await page.waitForFunction(viewportWidth => {
        const [first, second] = Array.from(document.querySelectorAll('[data-testid="all-categories"] [data-testid="all-category-card"]')).map(card => card.getBoundingClientRect());
        return first && second && Math.abs(first.y - second.y) < 1 && second.right >= viewportWidth - 22 && second.right <= viewportWidth;
      }, width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(() => document.querySelector('[data-testid="all-categories"]')?.getBoundingClientRect().top < 1);
    const photos = await allCategories.getByTestId("all-category-photo").evaluateAll(items => items.slice(0,4).map(item => item.getBoundingClientRect().height));
    assert.ok(photos.length >= 3 && photos.every(height => height >= 105 && height <= 115));
    await page.screenshot({path:path.join(output,"all-categories-390.png")});
    await allCategories.getByRole("button",{name:"Electronics & Mobile Accessories",exact:true}).click();
    await page.getByRole("button",{name:"Back to Home"}).click();
    for (const name of ["Explore shops","See all"]) {
      await page.getByRole("button",{name,exact:true}).click();
      await page.getByText("Shops in Raiyam",{exact:true}).waitFor();
      const shopFilter = page.getByRole("textbox", { name: "Filter shops" });
      await shopFilter.fill("missing-shop-fixture");
      await page.getByRole("heading", { name: "No matching shops", exact: true }).waitFor();
      await page.getByRole("button", { name: "Clear filter", exact: true }).click();
      assert.equal(await shopFilter.inputValue(), "");

      await page.getByText("←",{exact:true}).first().click();
    }
    await page.getByRole("button",{name:"Search products, shops & brands"}).click();
    await page.getByRole("textbox",{name:"Search products, shops and brands"}).fill("dog");
    await page.getByRole("button",{name:"View dog food",exact:true}).waitFor();
    for (const [tab,heading] of [["Bag","Your bag is waiting."],["Orders","Sign in to view orders"],["Account","Your neighbourhood starts here."],["Browse","Search products, shops & brands"],["Home","Shop by category"]]) {
      if (tab === "Account") failRegistrationOptions = true;
      await page.getByText(tab,{exact:true}).click();
      if (tab === "Browse") await page.getByPlaceholder(heading).waitFor(); else await page.getByText(heading,{exact:true}).waitFor();
      if (tab === "Account") {
        await page.getByTestId("buyer-account-hub").screenshot({path:path.join(output,"account-390.png")});
        await page.getByText("Sign in / Create account",{exact:true}).click();
        await page.getByTestId("buyer-sign-in").waitFor();
        await page.getByTestId("buyer-sign-in").screenshot({path:path.join(output,"buyer-signin-390.png")});
        await page.getByRole("button",{name:"Create account",exact:true}).click();
        const registration = page.getByTestId("buyer-sign-up");
        await registration.getByRole("heading",{name:"Account details",exact:true}).waitFor();
        const signupName = registration.getByLabel("Your name", {exact:true});
        await signupName.fill("Aditi Test");
        await registration.getByRole("button",{name:"Retry registration settings",exact:true}).click();
        await registration.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
        assert.equal(await signupName.inputValue(), "Aditi Test");
        const confirmPassword = registration.getByLabel("Confirm password", {exact:true});
        await registration.getByLabel("Password", {exact:true}).fill("fixture-password");
        await confirmPassword.fill("another-password");
        const mismatch = registration.getByText("Passwords must match.", {exact:true});
        await mismatch.waitFor();
        await confirmPassword.fill("fixture-password");
        await mismatch.waitFor({state:"hidden"});
        assert.equal(await registration.getByRole("button",{name:"Create account",exact:true}).isDisabled(),true);
        await registration.screenshot({path:path.join(output,"buyer-signup-390.png")});
        const signupHeaders = {"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"POST, OPTIONS"};
        await page.route("**/auth/email-otp/send", route => route.request().method() === "OPTIONS"
          ? route.fulfill({status:204,headers:signupHeaders})
          : route.fulfill({status:202,headers:signupHeaders,json:{challengeId:"buyer-qa-code",expiresAt:new Date(Date.now()+600000).toISOString(),resendAfterSeconds:60}}));
        await page.route("**/auth/register", route => {
          if (route.request().method() === "OPTIONS") return route.fulfill({status:204,headers:signupHeaders});
          const payload = route.request().postDataJSON();
          assert.equal(payload.phone, "+919876543210");
          assert.equal(payload.email, "buyer@example.test");
          if (payload.emailOtp === "111111") return route.fulfill({status:400,headers:signupHeaders,json:{code:"OTP_INVALID",message:"Invalid code"}});
          assert.equal(payload.emailOtp, "628415");
          return route.fulfill({status:409,headers:signupHeaders,json:{code:"DUPLICATE",message:"A record with this identifier already exists"}});
        });
        await registration.getByLabel("Mobile number",{exact:true}).fill("+91 98765 43210");
        await registration.getByLabel("Email",{exact:true}).fill("Buyer@example.test");
        await registration.getByRole("button",{name:"Send email code",exact:true}).click();
        const buyerCode = registration.getByLabel("Email verification code",{exact:true});
        await buyerCode.fill("111111");
        await registration.getByRole("button",{name:"Create account",exact:true}).click();
        await registration.getByRole("alert").filter({hasText:"That email code is invalid or expired."}).waitFor();
        assert.equal(await buyerCode.inputValue(), "");
        await buyerCode.fill("628 415");
        await registration.getByRole("button",{name:"Create account",exact:true}).click();
        await registration.getByRole("alert").filter({hasText:"An account already uses this mobile number or email."}).waitFor();
        await registration.getByRole("button",{name:"Back to sign in",exact:true}).last().click();
        await page.getByRole("button", {name:"Back from sign in"}).click();
        await page.getByTestId("buyer-account-hub").waitFor();
      }
    }
    await page.getByText("Account",{exact:true}).last().click();
    const sellerFixture = { userId:"seller-fixture", name:"Anita Sharma", role:"seller", token:"seller-fixture-token", isDemo:false };
    const secondSeller = {...sellerFixture,userId:"second-seller",name:"Second Seller",token:"second-seller-token"};
    const sellerHeaders = {"access-control-allow-origin":"*", "access-control-allow-headers":"*", "access-control-allow-methods":"GET, POST, OPTIONS"};
    let sellerAttempts = 0;
    await page.route("**/auth/login", async route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({status:204,headers:sellerHeaders});
      const credentials=route.request().postDataJSON();
      if (credentials.phone === "+919876543211") {
        assert.equal(credentials.password,"fixture-second-password");
        return route.fulfill({json:secondSeller,headers:sellerHeaders});
      }
      assert.deepEqual(credentials,{phone:"+919876543210",password:"fixture-password"});
      if (++sellerAttempts === 1) return route.fulfill({status:401,json:{message:"Invalid phone or password",code:"INVALID_CREDENTIALS",requestId:"seller-qa-reference"},headers:sellerHeaders});
      await route.fulfill({json:sellerFixture,headers:sellerHeaders});
    });
    let approvalStatus = "pending";
    await page.route("**/seller/shop", route => route.request().method() === "OPTIONS" ? route.fulfill({status:204,headers:sellerHeaders}) : route.fulfill({json:{
      name:route.request().headers().authorization === `Bearer ${secondSeller.token}` ? "Second Seller Shop" : "Fixture Kirana",
      status:approvalStatus,
    },headers:sellerHeaders}));
    await page.getByRole("button",{name:"Seller access",exact:true}).click();
    await page.getByRole("heading",{name:"Welcome back"}).waitFor();
    await page.getByTestId("seller-access-cover").locator("img").evaluate(image => image.decode());
    await page.screenshot({path:path.join(output,"seller-signin-390.png"),animations:"disabled"});
    await page.getByLabel("Mobile number",{exact:true}).fill("91 98765 43210");
    await page.getByLabel("Password",{exact:true}).fill("fixture-password");
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await page.getByText("Invalid phone or password",{exact:true}).waitFor();
    await page.getByText("Support reference: seller-qa-reference",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await page.getByRole("heading",{name:"Your shop is under review"}).waitFor();
    approvalStatus = "approved";
    await page.getByRole("button", { name: "Refresh shop status", exact: true }).click();
    await page.getByRole("heading", { name: "Your shop is approved", exact: true }).waitFor();
    await page.route("**/seller/**", route => new URL(route.request().url()).pathname === "/seller/shop"
      ? route.fallback()
      : route.fulfill({json:{},headers:sellerHeaders}));
    await page.getByRole("button",{name:"Close",exact:true}).click();
    await page.getByRole("button",{name:"Seller access",exact:true}).click();
    const reopenedSeller = page.getByTestId("native-seller-workspace");
    await reopenedSeller.waitFor();
    await reopenedSeller.getByRole("button",{name:"Close",exact:true}).click();
    approvalStatus = "pending";
    await page.getByRole("button",{name:"Seller access",exact:true}).click();
    await page.getByRole("heading",{name:"Your shop is under review",exact:true}).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jpi.seller.session")).role),"seller");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("jpi.buyer.session")),null);
    await page.getByRole("button",{name:"Close",exact:true}).click();
    await page.route("**/auth/me", route => route.fulfill({status:503,headers:sellerHeaders,json:{message:"Temporarily unavailable"}}));
    await page.getByRole("button",{name:"Seller access",exact:true}).click();
    await page.getByRole("heading",{name:"Your shop is under review"}).waitFor();
    await page.unroute("**/auth/me");
    await page.route("**/auth/logout", route => route.fulfill({status:204,headers:sellerHeaders}));
    await page.route("**/auth/registration-options", route => route.fulfill({json:{emailOtpRequired:true,emailOtpAvailable:true},headers:sellerHeaders}));
    await page.route("**/auth/email-otp/send", route => route.fulfill({json:{challengeId:"fixture-challenge",expiresAt:new Date(Date.now()+600000).toISOString(),resendAfterSeconds:60},headers:sellerHeaders}));
    await page.route("**/auth/register/seller", async route => {
      if (route.request().method()==="OPTIONS") return route.fulfill({status:204,headers:sellerHeaders});
      const payload = route.request().postDataJSON();
      assert.equal(payload.emailOtp,"628415");
      assert.equal(payload.emailChallengeId,"fixture-challenge");
      assert.equal(payload.shop.name,"Fixture Kirana");
      assert.equal(payload.shop.since,2020);
      assert.deepEqual(payload.shop.fulfilment,["pickup"]);
      assert.ok(payload.shop.categoryIds[0] && payload.shop.serviceAreaIds[0]);
      await route.fulfill({status:201,json:sellerFixture,headers:sellerHeaders});
    });
    await page.getByRole("button",{name:"Sign out of seller account"}).click();
    await page.getByRole("heading",{name:"Welcome back"}).waitFor();
    assert.equal(await page.getByLabel("Mobile number",{exact:true}).inputValue(),"");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("jpi.seller.session")),null);
    await page.getByLabel("Mobile number",{exact:true}).fill("9876543211");
    await page.getByLabel("Password",{exact:true}).fill("fixture-second-password");
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await page.getByText("Second Seller Shop",{exact:true}).waitFor();
    assert.equal(await page.getByText("Fixture Kirana",{exact:true}).count(),0);
    assert.equal(await page.getByTestId("native-seller-workspace").count(),0);
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jpi.seller.session")).userId),secondSeller.userId);
    await page.getByRole("button",{name:"Sign out of seller account"}).click();
    await page.getByRole("heading",{name:"Welcome back"}).waitFor();
    await page.getByRole("button",{name:/Create account/}).click();
    await page.getByLabel("Full name",{exact:true}).fill("Anita Sharma");
    await page.getByLabel("Mobile number",{exact:true}).fill("91 98765 43210");
    await page.getByLabel("Email address",{exact:true}).fill("seller@example.test");
    await page.getByLabel("Password",{exact:true}).fill("fixture-password");
    await page.getByRole("button",{name:"Send email code",exact:true}).click();
    await page.getByLabel("6-digit verification code").fill("628415");
    await page.screenshot({path:path.join(output,"seller-email-390.png"),animations:"disabled"});
    await page.getByRole("button",{name:"Continue with code",exact:true}).click();
    await page.getByLabel("Shop name",{exact:true}).fill("Fixture Kirana");
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByText("Select a category for your shop.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Choose shop category",exact:true}).click();
    await page.getByRole("button",{name:"Grocery & Kirana",exact:true}).click();
    await page.getByLabel("Year opened",{exact:true}).fill("2020");
    const onboardingChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose shop photo", exact: true }).click();
    const shopPhoto = fs.readFileSync(path.resolve(__dirname, "../assets/startup-parcel.jpg"));
    await (await onboardingChooser).setFiles({ name: "shop.jpg", mimeType: "image/jpeg", buffer: shopPhoto });
    await page.getByLabel("Selected shop cover", { exact: true }).waitFor();
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByLabel("Shop address",{exact:true}).fill("Shop 2, Main Road");
    await page.getByRole("button",{name:"Choose service area",exact:true}).click();
    await page.getByRole("button",{name:/Raiyam/}).click();
    await page.getByRole("checkbox",{name:/Customer pickup/}).click();
    await page.getByRole("button",{name:"Review shop",exact:true}).click();
    await page.getByText("Step 5 of 5 · Review & submit", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit address & fulfilment", exact: true }).click();
    assert.equal(await page.getByLabel("Shop address", { exact: true }).inputValue(), "Shop 2, Main Road");
    await page.getByRole("button", { name: "Back to review", exact: true }).click();
    await page.getByLabel("Shop cover preview", { exact: true }).waitFor();
    await page.route("**/seller/shop", route => route.fulfill({json:{name:"Fixture Kirana",status:approvalStatus,version:1},headers:sellerHeaders}));
    await page.route("**/seller/image-upload", route => route.fulfill({json:{enabled:true,maxBytes:5242880,types:["image/jpeg"]},headers:sellerHeaders}));
    let onboardingUploads = 0;
    await page.route("**/seller/shop/image", async route => {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fulfill({status:204,headers:sellerHeaders});
      assert.equal(request.headers()["x-shop-version"], "1");
      assert.deepEqual(request.postDataBuffer(), shopPhoto);
      onboardingUploads++;
      if (onboardingUploads === 1) return route.fulfill({status:503,json:{message:"Photo processing is busy."},headers:sellerHeaders});
      await route.fulfill({json:{coverImage:"https://images.example.test/fixture-shop.webp",status:"pending",version:2},headers:sellerHeaders});
    });
    await page.getByRole("button",{name:"Submit shop for approval",exact:true}).click();
    await page.getByRole("button",{name:"Retry shop photo upload",exact:true}).click();
    await page.getByText("Shop cover photo submitted for review.",{exact:true}).waitFor();
    assert.equal(onboardingUploads, 2);
    await page.getByRole("heading",{name:"Your shop is under review"}).waitFor();
    await page.getByRole("button",{name:"Sign out of seller account"}).click();
    await page.getByRole("heading",{name:"Welcome back"}).waitFor();
    await page.getByRole("button",{name:"Close",exact:true}).click();
    await page.getByText("Sign in / Create account",{exact:true}).click();
    const buyerSignIn = page.getByTestId("buyer-sign-in");
    await buyerSignIn.getByLabel("Mobile number",{exact:true}).fill("9876543210");
    await buyerSignIn.getByLabel("Password",{exact:true}).fill("fixture-password");
    const attemptsBeforeHandoff = sellerAttempts;
    await buyerSignIn.getByRole("button",{name:"Sign in",exact:true}).click();
    await page.getByRole("heading",{name:"Your shop is under review"}).waitFor();
    assert.equal(sellerAttempts,attemptsBeforeHandoff+1);
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("jpi.seller.session"))?.role === "seller");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("jpi.buyer.session")),null);
    let sellerShop = {id:"shop-qa",version:1,name:"Fixture Kirana",locality:"Raiyam",status:"approved",address:"Shop 2, Main Road",fulfilment:["platform_delivery"],timezone:"Asia/Kolkata",openingHours:[],categoryIds:["grocery"],serviceAreaIds:["raiyam"]};
    let sellerOrder = {id:"order-line",orderId:"seller-order-one",version:1,status:"placed",createdAt:"2026-11-20T08:30:00Z",fulfilment:"platform_delivery",paymentMethod:"cod",paymentStatus:"unpaid",amountDue:119,total:119,itemsSubtotal:89,deliveryFee:30,lines:[{name:"Tomatoes",qty:1,variantLabel:"1 kg",price:89}]};
    let sellerProduct = {id:"seller-product",name:"Tomatoes",unit:"1 kg",stock:9,price:89,active:true,categoryId:"cb9f993a-4595-476c-8ead-f22410a0b007",version:1,shopId:"shop-qa"};
    await page.route("**/seller/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if(method==="OPTIONS") return route.fulfill({status:204,headers:{...sellerHeaders,"access-control-allow-methods":"GET, POST, PATCH, OPTIONS"}});
      assert.equal(route.request().headers().authorization,"Bearer seller-fixture-token");
      let json;
      if(pathname==="/seller/shop") json=sellerShop;
      if(pathname==="/seller/dashboard") json={todayOrders:1,pendingPayment:1,counts:{[sellerOrder.status]:1},lowStock:{count:0,outOfStock:0,items:[]}};
      if(pathname==="/seller/orders") json=[sellerOrder];
      if(pathname.startsWith("/seller/orders/")&&method==="PATCH"){
        const input=route.request().postDataJSON();
        assert.equal(input.version,sellerOrder.version);
        sellerOrder={...sellerOrder,status:input.status,version:sellerOrder.version+1};
        json=sellerOrder;
      }
      if(pathname.endsWith("/pickup")&&method==="POST"){
        assert.deepEqual(route.request().postDataJSON(),{version:sellerOrder.version,partnerId:"rider-qa",confirmHandoff:true});
        sellerOrder={...sellerOrder,version:sellerOrder.version+1,delivery:{state:"picked_up",partnerId:"rider-qa"}};
        json=sellerOrder;
      }
      if(pathname==="/seller/products") json=[sellerProduct];
      if(pathname==="/seller/products" && method==="POST"){
        const input=route.request().postDataJSON();
        assert.equal(input.name,"Fixture rice");
        json={...input,id:"new-fixture-product",version:1,shopId:"shop-qa"};
      }
      if(pathname==="/seller/products/seller-product") json=sellerProduct;
      if(pathname==="/seller/products/seller-product/variants/small" && method==="PATCH"){
        const input=route.request().postDataJSON();
        assert.equal(input.version,sellerProduct.version);
        assert.equal(input.stock,12);
        json={id:"small",label:input.label,price:input.price,stock:input.stock};
        sellerProduct={...sellerProduct,version:sellerProduct.version+1,variants:[json,sellerProduct.variants[1]]};
      }
      if(pathname==="/seller/image-upload") json={enabled:true,maxBytes:5242880,types:["image/jpeg","image/png","image/webp"]};
      if(pathname==="/seller/products/seller-product/image"){
        assert.equal(method,"POST");
        assert.equal(route.request().headers()["content-type"],"image/png");
        assert.equal(route.request().headers()["x-product-version"],String(sellerProduct.version));
        assert.equal(route.request().postDataBuffer().subarray(0,8).toString("hex"),"89504e470d0a1a0a");
        sellerProduct={...sellerProduct,image:"https://images.example.test/tomatoes.webp",version:sellerProduct.version+1};
        json=sellerProduct;
      }
      if(pathname.endsWith("/inventory")&&method==="PATCH"){
        assert.deepEqual(route.request().postDataJSON(),{stock:7,version:sellerProduct.version});
        sellerProduct={...sellerProduct,stock:7,version:sellerProduct.version+1};
        json=sellerProduct;
      }
      if(pathname==="/seller/shop/availability"){
        const input=route.request().postDataJSON();
        assert.deepEqual(input.openingHours,[{day:1,opens:"09:00",closes:"18:00"}]);
        assert.equal(input.version,sellerShop.version);
        sellerShop={...sellerShop,...input,version:sellerShop.version+1};
        json=sellerShop;
      }
      if(pathname==="/seller/shop/image"){
        assert.equal(method,"POST");
        assert.equal(route.request().headers()["content-type"],"image/png");
        assert.equal(route.request().headers()["x-shop-version"],String(sellerShop.version));
        assert.equal(route.request().postDataBuffer().subarray(0,8).toString("hex"),"89504e470d0a1a0a");
        sellerShop={...sellerShop,coverImage:"https://images.example.test/fixture-shop.webp",status:"pending",version:sellerShop.version+1};
        json={coverImage:sellerShop.coverImage,status:sellerShop.status,version:sellerShop.version};
      }
      assert.ok(json,"Unexpected seller route "+pathname);
      return route.fulfill({json,headers:sellerHeaders});
    });
    await page.route("**/settlements?*",route => route.fulfill({json:{items:[{id:"payout-qa",orderId:"seller-order-one",posted:true,payoutAmount:99,payout:{state:"recorded",reference:"fixture-bank-reference",recordedAt:"2026-11-20T20:00:00Z"}}]},headers:sellerHeaders}));
    await page.getByRole("button",{name:"Set up your shop",exact:true}).click();
    const workspace=page.getByTestId("native-seller-workspace");
    await workspace.getByRole("button",{name:"Logout",exact:true}).click();
    await workspace.getByRole("heading",{name:"Sign out of Seller?",exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Keep working",exact:true}).click();
    await workspace.getByRole("button",{name:"Logout",exact:true}).waitFor();
    await workspace.getByText("Fixture Kirana",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:/^Low stock/}).click();
    await workspace.getByText("No products in this view",{exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"Home",exact:true}).click();
    await workspace.getByRole("button",{name:/^New orders/}).waitFor();
    await workspace.getByRole("heading",{name:"Needs attention",exact:true}).waitFor();
    await workspace.getByRole("button",{name:/Order #RDER-ONE.*Accept order/}).click();
    await workspace.getByText("seller-order-one",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Accept order",exact:true}).waitFor();
    await workspace.getByRole("button",{name:/Back to orders/}).click();
    await workspace.getByRole("tab",{name:"Home",exact:true}).click();
    await page.screenshot({path:path.join(output,"seller-workspace-390.png"),animations:"disabled"});
    const workspaceNode = await workspace.elementHandle();
    await page.emulateMedia({ colorScheme: "dark" });
    await backgroundIs(workspaceNode, "rgb(255, 249, 242)");
    await page.screenshot({ path: path.join(output, "seller-workspace-system-dark-390.png"), animations: "disabled" });
    await page.emulateMedia({ colorScheme: "light" });
    await backgroundIs(workspaceNode, "rgb(255, 249, 242)");
    await workspace.getByRole("button",{name:/^New orders/}).click();
    await workspace.getByText("Cash due ₹119",{exact:true}).waitFor();
    await workspace.getByText(/20 Nov 2026.*2:00\s*pm IST/i).waitFor();
    await workspace.getByRole("button",{name:/^Order #/}).waitFor();
    await workspace.getByTestId("seller-dispatch-art").locator("img").evaluate(image => image.decode());
    await page.screenshot({path:path.join(output,"seller-orders-390.png"),animations:"disabled"});
    await workspace.getByLabel("Search order ID",{exact:true}).fill("#RDER-ONE");
    await workspace.getByRole("heading",{name:"Search results",exact:true}).waitFor();
    await workspace.getByRole("button",{name:/^Order #RDER-ONE/}).waitFor();
    await workspace.getByLabel("Search order ID",{exact:true}).fill("missing-order");
    await workspace.getByText("No matching order ID",{exact:true}).waitFor();
    await workspace.getByRole("button", { name: "Clear search", exact: true }).click();
    await workspace.getByTestId("seller-dispatch-art").waitFor();
    await workspace.getByLabel("Search order ID", { exact: true }).fill("missing-order");
    await workspace.getByRole("button",{name:"Clear order search",exact:true}).click();
    await workspace.getByRole("button",{name:"Customer pickup",exact:true}).click();
    await workspace.getByText("No orders in this view",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Show all methods",exact:true}).click();
    await workspace.getByRole("button",{name:"Platform rider",exact:true}).click();
    await workspace.getByRole("button",{name:/^Order #RDER-ONE/}).waitFor();
    await workspace.getByRole("button",{name:"All methods",exact:true}).click();
    for (const [label, tab] of [["Accept order","Preparing"],["Start packing","Preparing"],["Mark ready for pickup","Ready"]]) {
      await workspace.getByRole("button",{name:/^Order #/}).getByText(`${label}  ›`,{exact:true}).waitFor();
      await workspace.getByRole("button",{name:/^Order #/}).click();
      if (label === "Mark ready for pickup") {
        await workspace.getByRole("checkbox",{name:/^Tomatoes,/}).click();
        await workspace.getByText("1 of 1 checked",{exact:true}).waitFor();
        await workspace.getByRole("button",{name:/Back to orders/}).click();
        await workspace.getByRole("button",{name:/^Order #.*1 of 1 checked/}).waitFor();
        await workspace.getByRole("button",{name:/^Order #/}).click();
        await workspace.getByText("1 of 1 checked",{exact:true}).waitFor();
      }
      if (label === "Accept order") await page.screenshot({path:path.join(output,"seller-order-detail-390.png"),animations:"disabled"});
      await workspace.getByRole("button",{name:label,exact:true}).click();
      await workspace.getByRole("tab",{name:tab,exact:true}).click();
      await workspace.getByText(sellerOrder.status==="accepted"?"Accepted":sellerOrder.status==="preparing"?"Preparing":"Ready for pickup",{exact:true}).last().waitFor();
    }
    await workspace.getByRole("button",{name:/^Order #/}).click();
    await workspace.getByText("Waiting for a platform rider to claim this order.",{exact:true}).waitFor();
    sellerOrder={...sellerOrder,version:sellerOrder.version+1,delivery:{state:"claimed",partnerId:"rider-qa"}};
    await workspace.getByRole("button",{name:"Refresh rider status",exact:true}).click();
    await workspace.getByRole("button",{name:"Review rider handoff"}).click();
    await workspace.getByRole("button",{name:"Confirm handoff",exact:true}).click();
    await workspace.getByText("Picked up by rider",{exact:true}).waitFor();
    sellerOrder={...sellerOrder,status:"out_for_delivery",version:sellerOrder.version+1,delivery:{...sellerOrder.delivery,state:"out_for_delivery"}};
    await page.evaluate(() => {
      for (const state of ["hidden","visible"]) {
        Object.defineProperty(document,"visibilityState",{configurable:true,value:state});
        Object.defineProperty(document,"webkitVisibilityState",{configurable:true,value:state});
        document.dispatchEvent(new Event("visibilitychange"));
        document.dispatchEvent(new Event("webkitvisibilitychange"));
      }
      delete document.visibilityState;
      delete document.webkitVisibilityState;
    });
    await workspace.getByText("No orders in this view",{exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"Out for delivery",exact:true}).click();
    await workspace.getByRole("button",{name:/^Order #/}).click();
    await workspace.getByText("Rider status · out for delivery",{exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"Home",exact:true}).click();
    await workspace.getByRole("button",{name:"On the way, 1",exact:true}).click();
    await workspace.getByRole("heading",{name:"Out for delivery",exact:true}).waitFor();
    await workspace.getByRole("button",{name:/^Order #.*Out for delivery/}).waitFor();
    await workspace.getByRole("tab",{name:"Catalogue",exact:true}).click();
    await workspace.getByRole("button",{name:"Edit Tomatoes",exact:true}).waitFor();
    await workspace.getByLabel("Search products",{exact:true}).fill("tomatoes 1 kg");
    await workspace.getByRole("button",{name:"Edit Tomatoes",exact:true}).waitFor();
    await workspace.getByLabel("Search products",{exact:true}).fill("tomatoes 500 g");
    await workspace.getByText("No products in this view",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Clear product search",exact:true}).click();
    await page.screenshot({path:path.join(output,"seller-catalogue-390.png"),animations:"disabled"});
    await workspace.getByRole("button",{name:"Manage stock for Tomatoes",exact:true}).click();
    const stockInput=workspace.getByLabel("Available units",{exact:true});
    await workspace.getByRole("button",{name:"− 1 unit",exact:true}).click();
    await workspace.getByRole("button",{name:"+ 1 unit",exact:true}).click();
    assert.equal(await stockInput.inputValue(),"9");
    await stockInput.fill("7");
    await workspace.getByRole("button",{name:"Save stock",exact:true}).click();
    const tomatoCard = workspace.getByTestId(`catalogue-product-${sellerProduct.id}`);
    await tomatoCard.getByText("Stock updated for Tomatoes.",{exact:true}).waitFor();
    await tomatoCard.getByText(/7 available/).waitFor();
    await tomatoCard.getByText("In stock",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Edit Tomatoes",exact:true}).click();
    assert.equal(await workspace.getByLabel("Stock",{exact:true}).inputValue(),"7");
    await workspace.getByRole("tab",{name:"Pack variants",exact:true}).click();
    await workspace.getByRole("button",{name:"Add variant",exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"Details",exact:true}).click();
    const saveProduct=workspace.getByRole("button",{name:"Save product",exact:true});
    await saveProduct.waitFor();
    assert.equal(await saveProduct.isDisabled(),true);
    const productName=workspace.getByLabel("Product name",{exact:true});
    await productName.fill("Fresh tomatoes");
    await workspace.getByText("Unsaved product changes.",{exact:true}).waitFor();
    assert.equal(await saveProduct.isEnabled(),true);
    await workspace.getByRole("button",{name:/Back to catalogue/}).click();
    await workspace.getByRole("heading",{name:"Leave without saving?",exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Keep editing",exact:true}).click();
    assert.equal(await productName.inputValue(),"Fresh tomatoes");
    await workspace.getByRole("button",{name:"Discard changes",exact:true}).click();
    assert.equal(await productName.inputValue(),"Tomatoes");
    assert.equal(await saveProduct.isDisabled(),true);
    await page.screenshot({path:path.join(output,"seller-product-editor-390.png"),animations:"disabled"});
    await workspace.getByRole("button",{name:/Back to catalogue/}).click();
    await workspace.getByRole("tab",{name:"No photo",exact:true}).click();
    await workspace.getByRole("button",{name:"Add photo for Tomatoes",exact:true}).click();
    const chooserPromise=page.waitForEvent("filechooser");
    await workspace.getByRole("button",{name:"Choose photo",exact:true}).click();
    const chooser=await chooserPromise;
    await chooser.setFiles({name:"product.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=","base64")});
    await workspace.getByLabel("Selected photo preview",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Upload photo",exact:true}).click();
    await workspace.getByText("Product photo saved.",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:/Back to catalogue/}).click();
    await workspace.getByText("No products in this view",{exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"All",exact:true}).click();
    await workspace.getByRole("button",{name:"Change photo for Tomatoes",exact:true}).waitFor();
    sellerProduct={...sellerProduct,variants:[{id:"small",label:"500 g",price:45,stock:2},{id:"large",label:"1 kg",price:89,stock:9}]};
    await workspace.getByRole("button",{name:"Refresh catalogue",exact:true}).click();
    await tomatoCard.getByRole("button",{name:"View packs",exact:true}).click();
    await tomatoCard.getByText("₹89 · 9 available",{exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"Low stock",exact:true}).click();
    await tomatoCard.getByText("₹45 · 2 available",{exact:true}).waitFor();
    await tomatoCard.getByRole("button",{name:"Update stock for Tomatoes, 500 g",exact:true}).click();
    const packStock=workspace.getByLabel("Variant stock",{exact:true});
    assert.equal(await packStock.inputValue(),"2");
    await packStock.fill("12");
    await workspace.getByRole("button",{name:"Save variant",exact:true}).click();
    await workspace.getByText("Variant saved.",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:/Back to catalogue/}).click();
    await tomatoCard.getByText("₹45 · 12 available",{exact:true}).waitFor();
    await tomatoCard.getByText("Stock updated for Tomatoes.",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Add product",exact:true}).click();
    await workspace.getByLabel("Product name",{exact:true}).fill("Fixture rice");
    await workspace.getByLabel("Unit or pack size",{exact:true}).fill("1 kg");
    await workspace.getByRole("radio",{name:"Grocery & Kirana",exact:true}).click();
    await workspace.getByLabel("Price (₹)",{exact:true}).fill("50");
    await workspace.getByLabel("Stock",{exact:true}).fill("5");
    await workspace.getByRole("button",{name:"Save product",exact:true}).click();
    await workspace.getByRole("button",{name:"Add photo",exact:true}).click();
    await workspace.getByRole("button",{name:"Choose photo",exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"Settlements",exact:true}).click();
    await workspace.getByText("Payout recorded",{exact:true}).waitFor();
    await workspace.getByText("Recorded 21 Nov 2026",{exact:true}).waitFor();
    await workspace.getByLabel("Search statements",{exact:true}).fill("missing-reference");
    await workspace.getByText("No matching statements",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Reset filters",exact:true}).click();
    await workspace.getByLabel("Search statements",{exact:true}).fill("FIXTURE-BANK");
    await workspace.getByText("Payout recorded",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:/^View breakdown/}).click();
    await workspace.getByText("Payout reference · fixture-bank-reference",{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,"seller-settlements-390.png"),animations:"disabled"});
    await workspace.getByRole("tab",{name:"Shop",exact:true}).click();
    await workspace.getByRole("tab",{name:"Shop details",exact:true}).click();
    const street=workspace.getByLabel("Street address",{exact:true});
    const saveShop=workspace.getByRole("button",{name:"Save shop details",exact:true});
    const savedStreet=await street.inputValue();
    assert.equal(await saveShop.isDisabled(),true);
    await street.fill("Temporary draft address");
    await workspace.getByText("Unsaved shop details.",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Discard changes",exact:true}).click();
    assert.equal(await street.inputValue(),savedStreet);
    assert.equal(await saveShop.isDisabled(),true);
    await workspace.getByRole("tab",{name:"Availability",exact:true}).click();
    await workspace.getByTestId("seller-shop-cover").locator("img").evaluate(image => image.decode());
    await page.screenshot({path:path.join(output,"seller-shop-390.png"),animations:"disabled"});
    const saveAvailability=workspace.getByRole("button",{name:"Save availability",exact:true});
    const pauseShop=workspace.getByRole("switch",{name:"Pause shop temporarily",exact:true});
    const hoursPreview=workspace.getByTestId("seller-hours-preview");
    await hoursPreview.getByText("Closed · No opening hours set",{exact:true}).waitFor();
    await pauseShop.click();
    await hoursPreview.getByText("Temporarily closed",{exact:true}).waitFor();
    await hoursPreview.getByText("Preview of unsaved changes",{exact:true}).waitFor();
    await workspace.getByText("Save availability to pause your shop.",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Discard changes",exact:true}).click();
    assert.equal(await pauseShop.getAttribute("aria-checked"),"false");
    await hoursPreview.getByText("Closed · No opening hours set",{exact:true}).waitFor();
    assert.equal(await saveAvailability.isDisabled(),true);
    await workspace.getByRole("button",{name:"Add opening interval",exact:true}).click();
    await workspace.getByRole("button",{name:"Discard changes",exact:true}).click();
    await workspace.getByText("No opening hours set.",{exact:true}).waitFor();
    assert.equal(await saveAvailability.isDisabled(),true);
    await workspace.getByRole("button",{name:"Add opening interval",exact:true}).click();
    await workspace.getByRole("button",{name:"Add opening interval",exact:true}).click();
    await workspace.getByRole("radio",{name:"Monday",exact:true}).last().click();
    const overlapWarning=workspace.getByText("Some opening hours overlap. Check the time slots below.",{exact:true});
    await overlapWarning.waitFor();
    await workspace.getByRole("button",{name:"Remove interval for Monday",exact:true}).last().click();
    await overlapWarning.waitFor({state:"hidden"});
    await workspace.getByText("Unsaved availability changes.",{exact:true}).waitFor();
    await saveAvailability.click();
    await workspace.getByText("Availability saved.",{exact:true}).waitFor();
    await workspace.getByText("Scheduled on 1 day per week",{exact:true}).waitFor();
    assert.equal(await saveAvailability.isDisabled(),true);
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Opens (HH:MM)"]').length===1);
    await workspace.getByRole("tab",{name:"Cover photo",exact:true}).click();
    const coverChooserPromise=page.waitForEvent("filechooser");
    await workspace.getByRole("button",{name:"Choose photo",exact:true}).click();
    const coverChooser=await coverChooserPromise;
    await coverChooser.setFiles({name:"shop.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=","base64")});
    await workspace.getByLabel("Selected photo preview",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Submit cover for review",exact:true}).click();
    await workspace.getByText("Cover photo submitted for review.",{exact:true}).waitFor();
    await workspace.getByText("Under review",{exact:true}).waitFor();
    await workspace.getByRole("tab",{name:"Account",exact:true}).click();
    await workspace.getByRole("button",{name:"Sign out of seller account",exact:true}).click();
    await workspace.getByRole("heading",{name:"Sign out of Seller?",exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Keep working",exact:true}).click();
    await workspace.getByRole("button",{name:"Sign out of seller account",exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Close",exact:true}).click();
    await page.getByRole("button",{name:"Close",exact:true}).click();
    await page.getByRole("button",{name:"Back from sign in"}).click();
    await page.getByText("Home",{exact:true}).last().click();
    await page.getByLabel("Notifications",{exact:true}).click();
    await page.getByText("Notifications",{exact:true}).waitFor();
    emptyMarket = true;
    await page.reload();
    await page.getByRole("heading", { name: "No shops available in this area yet" }).waitFor();
    await page.getByRole("heading", { name: "Your neighbourhood, delivered." }).waitFor();
    await page.getByText("Shop by category", { exact: true }).waitFor();
    await page.route("**/shops?area=**", route => route.fulfill({
      status: 503,
      json: { message: "Fixture refresh failed" },
      headers: { "access-control-allow-origin": "*" },
    }), { times: 1 });
    await page.getByRole("button", { name: "Refresh shops", exact: true }).click();
    await page.getByText("Couldn’t refresh shops. Try again.", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Your neighbourhood, delivered." }).waitFor();
    emptyMarket = false;
    await page.getByRole("button", { name: "Refresh shops", exact: true }).click();
    await page.getByRole("heading", { name: "No shops available in this area yet" }).waitFor({ state: "hidden" });
    emptyMarket = true;
    await page.route("**/shops?area=**", route => route.fulfill({
      status: 503,
      json: { message: "Fixture shop panel failed" },
      headers: { "access-control-allow-origin": "*" },
    }), { times: 1 });
    await page.getByRole("button", { name: "See all", exact: true }).click();
    const shopSheet = page.getByRole("dialog");
    await shopSheet.getByRole("heading", { name: "Shops could not load", exact: true }).waitFor();
    await shopSheet.getByRole("button", { name: "Try again", exact: true }).click();
    await shopSheet.getByRole("heading", { name: "No shops available in this area yet" }).waitFor();
    emptyMarket = false;
    await shopSheet.getByRole("button", { name: "Refresh shops", exact: true }).click();
    await shopSheet.getByRole("heading", { name: "No shops available in this area yet" }).waitFor({ state: "hidden" });
    await shopSheet.getByRole("button", { name: "Refresh shops", exact: true }).waitFor({ state: "hidden" });
    await page.getByText("←", { exact: true }).first().click();
    await page.route("**/shops?area=**", route => {
      const { searchParams } = new URL(route.request().url());
      const later = searchParams.get("cursor") === "qa-next-shops";
      return route.fulfill({
        json: [{ id: later ? "second-shop" : "first-shop", name: later ? "Second Page Shop" : "First Page Shop", locality: "Raiyam", isOpen: true }],
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "X-Has-More, X-Next-Cursor",
          "X-Has-More": String(!later),
          "X-Next-Cursor": "qa-next-shops",
        },
      });
    });
    await page.getByRole("button", { name: "See all", exact: true }).click();
    const pagedFilter = shopSheet.getByRole("textbox", { name: "Filter shops" });
    await pagedFilter.fill("Second Page");
    await shopSheet.getByText("0 matches in 1 loaded shop", { exact: true }).waitFor();
    await shopSheet.getByRole("heading", { name: "No matches in loaded shops", exact: true }).waitFor();
    await shopSheet.getByRole("button", { name: "Load more shops", exact: true }).click();
    await shopSheet.getByText("Second Page Shop", { exact: true }).waitFor();
    assert.equal(await pagedFilter.inputValue(), "Second Page");
    await shopSheet.getByRole("button", { name: "Clear shop filter", exact: true }).click();
    await shopSheet.getByText("First Page Shop", { exact: true }).waitFor();

    assert.deepEqual(errors,[]);
    console.log("Guest Home visuals and navigation passed at four sizes.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
