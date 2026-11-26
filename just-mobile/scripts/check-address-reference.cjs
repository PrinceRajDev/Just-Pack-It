const { chromium } = require("../../just-front/node_modules/playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const read = (name) =>
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../qa/home-reference", name + ".json"),
      ),
    );
  const shops = read("shops")
    .slice(0, 2)
    .map((shop, index) => ({
      ...shop,
      name: ["Sharma Kirana Store", "Patil Fresh Mart"][index],
    }));
  const products = shops.map((shop, index) => ({
    ...read("products")[0],
    id: "address-product-" + index,
    shopId: shop.id,
    quantity: index === 0 ? 2 : 1,
    price: index === 0 ? 44 : 41,
  }));
  const addresses = [
    {
      id: "home",
      label: "Home",
      line1: "Flat 302, Suyog Apartment, Paud Road",
      locality: "Kothrud",
      city: "Pune, Maharashtra",
      pincode: "411038",
      version: 0,
    },
    {
      id: "work",
      label: "Work",
      line1: "Studio 204, Lotus Business Park",
      locality: "Senapati Bapat Road",
      city: "Pune",
      pincode: "411016",
      version: 0,
    },
  ];
  const buyer = {
    userId: "qa-address",
    name: "Aditi Sharma",
    phone: "+919876543210",
    token: "fixture-token",
    role: "buyer",
    isDemo: false,
    version: 1,
  };
  const output = path.resolve(__dirname, "../qa/address-reference");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors = [];
    let orderRequests = 0;
    let changedPrice = false;
    let trackingDelivered = false;
    let receiptRequests = 0;
    let firstOrderKey;
    const confirmed = {
      id: "JPI-240618-084",
      total: 189,
      amountDue: 189,
      paymentMethod: "cod",
      paymentStatus: "unpaid",
      createdAt: "2026-11-19T08:00:00Z",
      address: addresses[0],
      subOrders: shops.map((shop) => ({
        id: shop.id,
        shopName: shop.name,
        status: "placed",
        amountDue: 90,
        deliveryFee: 30,
        lines: [],
      })),
    };
    let stockUnavailable = false;
    let deliveryFeeChanged = false;
    let savedAddressChanged = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ buyer, products }) => {
        if (sessionStorage.getItem("qa.address.seeded")) return;
        sessionStorage.setItem("qa.address.seeded", "yes");
        sessionStorage.setItem("jpi.buyer.session", JSON.stringify(buyer));
        sessionStorage.setItem(
          "jpi.bag." + buyer.userId,
          JSON.stringify(products),
        );
      },
      { buyer, products },
    );
    await page.route(
      "https://just-pack-it-bq64.onrender.com/**",
      async (route) => {
        const resource = new URL(route.request().url()).pathname.slice(1);
        const method = route.request().method();
        const headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
        };
        if (method === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        let data = [];
        if (resource === "auth/profile" && method === "PATCH") {
          const input = route.request().postDataJSON();
          assert.equal(input.version, buyer.version);
          data = Object.assign(buyer, { name: input.name, version: input.version + 1 });
        } else if (resource === "addresses" && method === "POST") {
          data = { ...route.request().postDataJSON(), id: "other", version: 0 };
          addresses.push(data);
        } else if (resource === "addresses/home" && method === "PATCH") {
          const input = route.request().postDataJSON();
          assert.equal(input.version, addresses[0].version);
          data = Object.assign(addresses[0], input, {
            version: input.version + 1,
          });
        } else if (resource === "orders" && method === "POST") {
          orderRequests += 1;
          const input = route.request().postDataJSON();
          assert.equal(input.paymentMethod, "cod");
          assert.equal(input.expectedTotal, 189);
          assert.equal(input.addressId, "home");
          assert.deepEqual(
            input.items.map((line) => line.qty),
            [2, 1],
          );
          const key = route.request().headers()["idempotency-key"];
          assert.ok(key);
          if (orderRequests === 1) {
            firstOrderKey = key;
            return route.fulfill({
              status: 503,
              headers,
              json: { message: "Order service unavailable. Please retry." },
            });
          }
          assert.equal(key, firstOrderKey);
          await new Promise((resolve) => setTimeout(resolve, 350));
          return route.fulfill({ status: 201, headers, json: confirmed });
        } else if (resource === "checkout/review") {
          const input = route.request().postDataJSON();
          assert.deepEqual(
            input.fulfilments.map((choice) => choice.shopId).sort(),
            shops.map((shop) => shop.id).sort(),
          );
          assert.equal(
            input.addressVersion,
            addresses.find((row) => row.id === input.addressId).version,
          );
          const eligible = input.addressId !== "work";
          data = {
            checkoutAvailable: eligible && !stockUnavailable && !savedAddressChanged,
            itemsSubtotal: 129,
            deliveryTotal: eligible ? (deliveryFeeChanged ? 70 : 60) : null,
            grandTotal: eligible ? (deliveryFeeChanged ? 199 : 189) : null,
            paymentMethods: eligible && !stockUnavailable ? ["cod"] : [],
            issues: savedAddressChanged ? [{code:"ADDRESS_CHANGED",message:"Your saved address changed. Reload addresses and review again."}] : [],
            lines: stockUnavailable
              ? [
                  {
                    productId: products[0].productId ?? products[0].id,
                    variantId: products[0].variantId,
                    availableStock: 0,
                    issues: [
                      { code:"OUT_OF_STOCK", message: "Farm fresh tomatoes are out of stock." },
                    ],
                  },
                ]
              : changedPrice ? [{ productId: products[0].productId ?? products[0].id, variantId: products[0].variantId, unitPrice: 48, availableStock: 12, issues: [] }] : [],
            shops: shops.map((shop) => ({ shop, issues: [] })),
            fulfilments: shops.map((shop, index) => ({
              shopId: shop.id,
              listedFee:
                !eligible && index === 1
                  ? null
                  : input.addressId === "other"
                    ? [25, 35][index]
                    : deliveryFeeChanged && index === 1 ? 40 : 30,
              issues:
                !eligible && index === 1
                  ? [{ message: "No approved partner for this address." }]
                  : [],
            })),
          };
        } else if (resource.endsWith("/receipt-code")) {
          assert.equal(route.request().headers().authorization, "Bearer fixture-token");
          assert.equal(resource, `orders/${confirmed.id}/suborders/${shops[0].id}/receipt-code`);
          assert.deepEqual(route.request().postDataJSON(), { version: 4, confirmReceived: true, confirmCashPaid: true });
          receiptRequests += 1;
          data = {code:"628415", expiresAt:new Date(Date.now() + 300000).toISOString(),amount:189};
        } else if (resource === "orders/" + confirmed.id) {
          data = { ...confirmed, amountDue: trackingDelivered ? 0 : 189, subOrders: confirmed.subOrders.map((shop,index) => ({
            ...shop, status: index === 0 ? (trackingDelivered ? "delivered" : "out_for_delivery") : "cancelled",
            ...(index === 0 ? {deliveryState: trackingDelivered ? "delivered" : "out_for_delivery", amountDue: trackingDelivered ? 0 : 189, version: trackingDelivered ? 5 : 4} : {amountDue:0}),
          })) };
        }
        else if (resource === "addresses") data = addresses;
        else if (resource === "auth/me" || resource === "auth/profile")
          data = buyer;
        else if (resource === "products") data = products;
        else if (resource === "shops") data = shops;
        else if (resource === "areas" || resource === "categories")
          data = read(resource);
        await route.fulfill({ json: data, headers });
      },
    );
    const picker = page.getByTestId("choose-address");
    const enter = async () => {
      await page.getByText("Bag · 3", { exact: true }).last().click();
      await page.getByRole("button", { name: "Change delivery address" }).click();
      await picker.waitFor();
    };
    await page.goto(process.env.PREVIEW_URL || "http://localhost:8113");
    // Metro's development error toast covers the bottom tabs after the intentional HTTP 503.
    await page.addStyleTag({ content: "#error-toast { pointer-events: none !important; }" });
    await page.getByRole("button", { name: "Account", exact: true }).click();
    const accountHub = page.getByTestId("buyer-account-hub");
    await accountHub.getByText(buyer.name, { exact: true }).waitFor();
    assert.equal(await accountHub.getByText(/Raiyam/).count(), 0);
    await page.getByRole("button", { name: "Language", exact: true }).click();
    const english = page.getByRole("radio", { name: "English", exact: true });
    const hindi = page.getByRole("radio", { name: "हिन्दी", exact: true });
    await english.waitFor();
    assert.equal(await english.getAttribute("aria-checked"), "true");
    assert.equal(await page.getByRole("button", { name: "Apply English", exact: true }).isDisabled(), true);
    await hindi.click();
    await page.getByRole("button", { name: "Apply Hindi", exact: true }).click();
    await page.getByRole("button", { name: "प्रोफ़ाइल", exact: true }).click();
    await page.getByRole("textbox", { name: "पूरा नाम", exact: true }).waitFor();
    await page.getByRole("button", { name: "खाते पर वापस जाएँ", exact: true }).last().click();
    await page.getByRole("button", { name: "सहेजे गए पते", exact: true }).click();
    await page.getByRole("button", { name: "+ नया पता जोड़ें", exact: true }).click();
    await page.getByLabel("पिन कोड", { exact: true }).fill("123");
    await page.getByRole("button", { name: "पता सहेजें", exact: true }).click();
    await page.getByText("6 अंकों का सही पिन कोड दर्ज करें।", { exact: true }).waitFor();
    await page.getByLabel("पिन कोड", { exact: true }).fill("८४७२३८");
    assert.equal(await page.getByLabel("पिन कोड", { exact: true }).inputValue(), "847238");
    await page.getByRole("button", { name: "पतों की सूची पर वापस जाएँ", exact: true }).click();
    await page.getByRole("button", { name: "खाते पर वापस जाएँ", exact: true }).last().click();
    await page.getByRole("button", { name: "भाषा", exact: true }).click();
    await hindi.waitFor();
    assert.equal(await hindi.getAttribute("aria-checked"), "true");
    await english.click();
    await page.getByRole("button", { name: "अंग्रेज़ी लागू करें", exact: true }).click();
    await page.getByRole("button", { name: "Language", exact: true }).waitFor();
    const notificationId = "a9386f03-3fe5-4985-8a9c-dd20c2eb6d55";
    let notificationRead = false;
    let readAttempts = 0;
    let orderDispatched = false;
    const notificationHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    };
    await page.route("**/notifications?limit=20", route => route.fulfill({
      headers: notificationHeaders,
      json: [
        ...(orderDispatched ? [{ id: "dispatch-fixture", title: "Out for delivery", body: "Your rider is on the way.", createdAt: "2026-11-20T09:30:00Z", read: true }] : []),
        { id: notificationId, title: "Order accepted", body: "Your shop is preparing your order.", createdAt: "2026-11-20T08:30:00Z", read: notificationRead },
      ],
    }));
    await page.route(`**/notifications/${notificationId}/read`, route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: notificationHeaders });
      assert.equal(route.request().method(), "POST");
      assert.deepEqual(route.request().postDataJSON(), {});
      if (++readAttempts === 1) return route.fulfill({ status: 503, headers: notificationHeaders, json: { message: "Retry shortly" } });
      notificationRead = true;
      return route.fulfill({ status: 204, headers: notificationHeaders });
    });
    const notifications = page.getByRole("button", { name: "Notifications", exact: true });
    await notifications.click();
    await page.getByText("Order accepted", { exact: true }).waitFor();
    await page.getByText(/20 Nov 2026/).waitFor();
    await page.getByText("Unread", { exact: true }).waitFor();
    const markRead = page.getByRole("button", { name: "Mark as read", exact: true });
    await markRead.click();
    await page.getByRole("alert").filter({ hasText: "Couldn’t mark as read. Try again." }).waitFor();
    await markRead.click();
    await markRead.waitFor({ state: "hidden" });
    await page.getByText("Unread", { exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Go back", exact: true }).last().click();
    await notifications.click();
    await page.getByText("Order accepted", { exact: true }).waitFor();
    assert.equal(await markRead.count(), 0);
    assert.equal(readAttempts, 2);
    orderDispatched = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText("Out for delivery", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Go back", exact: true }).last().click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const profileName = page.getByLabel("Full name", { exact: true });
    const saveProfile = page.getByRole("button", { name: "Save changes", exact: true });
    const originalName = buyer.name;
    await profileName.waitFor();
    assert.equal(await profileName.inputValue(), buyer.name);
    await profileName.fill("A");
    await page.getByRole("alert").filter({ hasText: "Enter a name between 2 and 100 characters." }).waitFor();
    assert.equal(await saveProfile.isDisabled(), true);
    await profileName.fill("Aditi Test");
    assert.equal(await saveProfile.isEnabled(), true);
    await saveProfile.click();
    await page.getByText("Profile updated", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Back to Account", exact: true }).last().click();
    await page.getByTestId("buyer-account-hub").getByText("Aditi Test", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await profileName.fill(originalName);
    await saveProfile.click();
    await page.getByText("Profile updated", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Back to Account", exact: true }).last().click();
    await page.getByRole("button", { name: "Saved Addresses", exact: true }).click();
    await page.getByRole("button", { name: "Set Work as default", exact: true }).click();
    await page.getByText("Default", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Back to Account", exact: true }).click();
    await enter();
    await page.addStyleTag({
      content:
        '[data-testid="choose-address-safe"]{padding-top:28px!important;padding-bottom:20px!important}',
    });
    const home = picker.getByRole("radio", { name: "Home address" });
    const work = picker.getByRole("radio", { name: "Work address" });
    const deliver = picker.getByRole("button", {
      name: /Deliver to this address|Recheck delivery/,
    });
    await picker
      .getByText("Aditi Sharma · 98765 43210", { exact: true })
      .waitFor();
    assert.equal(await work.getAttribute("aria-checked"), "true");
    await home.click();
    for (const [width, height] of [
      [390, 844],
      [360, 800],
      [375, 812],
      [430, 932],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        () =>
          Math.abs(
            document
              .querySelector('[data-testid="address-footer"]')
              .getBoundingClientRect().bottom -
              (innerHeight - 20),
          ) < 2,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(output, "choose-address-" + width + ".png"),
      });
    }
    await work.click();
    assert.equal(await home.getAttribute("aria-checked"), "false");
    assert.equal(await work.getAttribute("aria-checked"), "true");
    await deliver.click();
    await page.getByText("No rider for Patil Fresh Mart", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", {name:"Resolve delivery to continue",exact:true}).isDisabled(),true);
    const change = page.getByRole("button", { name: "Change address", exact: true });
    await change.click();
    await home.click();
    await deliver.click();
    await page.getByRole("button", {name:"Checkout · ₹189", exact:true}).click();
    const checkout = page.getByTestId("checkout-screen");
    await checkout
      .getByText("Cash on Delivery · ₹189 due at delivery", { exact: true })
      .waitFor();
    await picker.waitFor({ state: "hidden" });
    await page.addStyleTag({
      content:
        '[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}',
    });
    for (const [width, height] of [
      [390, 844],
      [360, 800],
      [375, 812],
      [430, 932],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        () =>
          Math.abs(
            document
              .querySelector('[data-testid="checkout-footer"]')
              .getBoundingClientRect().bottom -
              (innerHeight - 20),
          ) < 2,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(output, "checkout-" + width + ".png"),
      });
    }
    await checkout
      .getByText("2 items · Rider delivery available · Fee ₹30", {
        exact: true,
      })
      .waitFor();
    await checkout
      .getByText("1 item · Rider delivery available · Fee ₹30", { exact: true })
      .waitFor();
    await change.click();
    await home.click();
    await picker.getByRole("button", { name: "Edit Home address" }).click();
    const line1 = page.getByLabel("House, street and landmark", {
      exact: true,
    });
    const pin = page.getByLabel("PIN code", { exact: true });
    const save = page.getByText("Save address", { exact: true });
    assert.equal(await line1.inputValue(), addresses[0].line1);
    await line1.fill("Flat 303, Suyog Apartment");
    await pin.fill("000000");
    await save.click();
    await page.getByText(/valid 6-digit PIN code/).waitFor();
    await pin.fill("411038");
    await save.click();
    await picker.getByText(/Flat 303, Suyog Apartment/).waitFor();
    await picker.getByRole("button", { name: "+ Add new address" }).click();
    await page.getByLabel("Label (Home, Work)", { exact: true }).fill("Other");
    await line1.fill("Flat 14, Market Lane");
    await page.getByLabel("Locality", { exact: true }).fill("Kothrud");
    await page.getByLabel("City", { exact: true }).fill("Pune");
    await pin.fill("411038");
    await page
      .getByRole("checkbox", { name: "Set as default on this device" })
      .click();
    await save.click();
    const other = picker.getByRole("radio", { name: "Other address" });
    await other.waitFor();
    assert.equal(await other.getAttribute("aria-checked"), "true");
    await deliver.click();
    await page.getByText("Total: ₹189", { exact: true }).waitFor();
    await checkout
      .getByText("2 items · Rider delivery available · Fee ₹25", {
        exact: true,
      })
      .waitFor();
    await checkout
      .getByText("1 item · Rider delivery available · Fee ₹35", { exact: true })
      .waitFor();
    await page.reload();
    await enter();
    await other.waitFor();
    assert.equal(await other.getAttribute("aria-checked"), "true");
    stockUnavailable = true;
    await deliver.click();
    const affectedShop = page.getByTestId(`bag-shop-${shops[0].id}`);
    await affectedShop.getByText("Farm fresh tomatoes are out of stock.", { exact: true }).waitFor();
    await affectedShop.getByRole("button", {name:"Remove from bag", exact:true}).waitFor();
    assert.equal(await page.getByRole("button", {name:"Resolve delivery to continue",exact:true}).isDisabled(),true);
    stockUnavailable = false;
    Object.assign(addresses[0], {line1:"Flat 302, Suyog Apartment, Paud Road"});
    await page.getByRole("button",{name:"Change delivery address",exact:true}).click();
    await home.click();
    await deliver.click();
    await page.getByRole("button",{name:"Checkout · ₹189",exact:true}).click();
    const order = page.getByRole("button", {
      name: "Place Order · ₹189",
      exact: true,
    });
    await order.waitFor();
    await order.click();
    await page
      .getByText("Order service unavailable. Please retry.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Check Orders", exact: true }).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,"checkout-uncertain-390.png")});
    const confirmation = page.getByTestId("order-confirmation");
    assert.equal(await confirmation.count(), 0);
    assert.equal(
      await page.evaluate(
        (userId) =>
          JSON.parse(sessionStorage.getItem("jpi.bag." + userId)).length,
        buyer.userId,
      ),
      2,
    );
    await order.evaluate((button) => {
      button.click();
      button.click();
    });
    await confirmation
      .getByText("Order #JPI-240618-084", { exact: true })
      .waitFor();
    await page.addStyleTag({
      content:
        '[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}',
    });
    await confirmation
      .getByText("₹189 due at delivery", { exact: true })
      .waitFor();
    await confirmation.getByText(/order is placed with 2 shops/).waitFor();
    await confirmation.getByText(/Flat 302, Suyog Apartment/).waitFor();
    assert.equal(orderRequests, 2);
    for (const [width, height] of [
      [390, 844],
      [360, 800],
      [375, 812],
      [430, 932],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(output, "order-confirmation-" + width + ".png"),
      });
    }
    await confirmation.getByRole("button", { name: "Track Order" }).click();
    await page.getByText("Sharma Kirana Store", { exact: true }).waitFor();
    const tracking = page.getByTestId("buyer-order-details");
    await tracking.getByText("Picked up", {exact:true}).first().waitFor();
    await tracking.getByText("Patil Fresh Mart",{exact:true}).waitFor();
    let supportTicket;
    let supportRequests = 0;
    const supportMessages = [{id:"support-reply",role:"admin",kind:"messages",body:"We’re checking with the shop."}];
    await page.route("**/support/support-fixture/messages", route => {
      const method = route.request().method();
      if (method === "OPTIONS") return route.fulfill({status:204,headers:notificationHeaders});
      if (method === "POST") {
        const reply = route.request().postDataJSON();
        assert.equal(reply.version, 0);
        assert.match(reply.key, /^[a-f0-9-]{36}$/);
        assert.equal(reply.body, "Thanks for checking.");
        supportMessages.push({id:"buyer-reply",role:"buyer",kind:"messages",body:reply.body});
        return route.fulfill({headers:notificationHeaders,json:{version:1}});
      }
      return route.fulfill({headers:notificationHeaders,json:{items:supportMessages}});
    });
    await page.route("**/support?orderId=*", route => {
      assert.equal(new URL(route.request().url()).searchParams.get("orderId"), confirmed.id);
      return route.fulfill({headers:notificationHeaders,json:{items:supportTicket ? [supportTicket] : []}});
    });
    await page.route("**/support", route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({status:204,headers:notificationHeaders});
      assert.equal(route.request().method(), "POST");
      assert.deepEqual(route.request().postDataJSON(), {
        orderId:confirmed.id, suborderId:confirmed.subOrders[1].id, kind:"missing_item", description:"One item was missing.",
      });
      supportRequests++;
      supportTicket = {id:"support-fixture",suborderId:confirmed.subOrders[1].id,status:"open",note:"",version:0,kind:"missing_item",description:"One item was missing."};
      return route.fulfill({headers:notificationHeaders,json:supportTicket});
    });
    await tracking.getByRole("button",{name:"Get help",exact:true}).nth(1).click();
    await tracking.getByRole("button",{name:"Send support request",exact:true}).click();
    await tracking.getByRole("alert").filter({hasText:"Choose an issue"}).waitFor();
    assert.equal(supportRequests,0);
    await tracking.getByRole("button",{name:"Missing item",exact:true}).click();
    await tracking.getByLabel("Describe the issue",{exact:true}).fill("One item was missing.");
    await tracking.getByRole("button",{name:"Send support request",exact:true}).click();
    await tracking.getByText("Support request · Open",{exact:true}).waitFor();
    await tracking.getByText("One item was missing.",{exact:true}).waitFor();
    await tracking.getByText("We’re checking with the shop.",{exact:true}).waitFor();
    await tracking.getByLabel("Reply to support",{exact:true}).fill("Thanks for checking.");
    await tracking.getByRole("button",{name:"Send reply",exact:true}).click();
    await tracking.getByText("Thanks for checking.",{exact:true}).waitFor();
    supportTicket = {...supportTicket,status:"resolved",note:"The shop reviewed your request.",version:2};
    await tracking.getByRole("button",{name:"Refresh support status",exact:true}).click();
    await tracking.getByText("Support request · Resolved",{exact:true}).waitFor();
    await tracking.getByText(supportTicket.note,{exact:true}).waitFor();
    await tracking.getByLabel("Reply to support",{exact:true}).waitFor({state:"hidden"});
    await page.route("**/support/support-fixture/reopen", route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({status:204,headers:notificationHeaders});
      const input = route.request().postDataJSON();
      assert.equal(input.version, 2);
      assert.equal(input.body, "The order is still missing an item.");
      supportMessages.push({id:"buyer-reopen",role:"buyer",kind:"reopen",body:input.body});
      return route.fulfill({headers:notificationHeaders,json:{version:3}});
    });
    await tracking.getByRole("button",{name:"Reopen request",exact:true}).click();
    await tracking.getByLabel("Why are you reopening this request?",{exact:true}).fill("The order is still missing an item.");
    await tracking.getByRole("button",{name:"Confirm reopen",exact:true}).click();
    await tracking.getByText("Support request · Open",{exact:true}).waitFor();
    await tracking.getByText("The order is still missing an item.",{exact:true}).waitFor();
    assert.equal(supportRequests,1);
    await tracking.getByRole("button",{name:"Hide order help",exact:true}).click();
    const precedesPayment = async (buttonName) => {
      const payment = await tracking.getByText("Cash on Delivery", {exact:true}).elementHandle();
      assert.ok(await tracking.getByRole("button", {name:buttonName, exact:true}).evaluate(
        (button, paymentLabel) => Boolean(button.compareDocumentPosition(paymentLabel) & Node.DOCUMENT_POSITION_FOLLOWING),
        payment,
      ));
    };
    await precedesPayment("View receipt code");
    await tracking.getByRole("button",{name:"View receipt code"}).click();
    assert.equal(receiptRequests,0);
    await tracking.getByRole("button",{name:"Received and paid"}).click();
    await tracking.getByLabel("6 2 8 4 1 5",{exact:true}).waitFor();
    assert.equal(receiptRequests,1);
    for (const [width,height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:path.join(output,`tracking-${width}.png`)});
    }
    trackingDelivered = true;
    await tracking.getByRole("button",{name:"Refresh status"}).click();
    await tracking.getByRole("heading",{name:"Partially cancelled",exact:true}).waitFor();
    assert.equal(await tracking.getByLabel("6 2 8 4 1 5",{exact:true}).count(),0);

    await tracking.getByText("Sharma Kirana Store · Delivered",{exact:true}).waitFor();
    await precedesPayment("Buy again");
    await page.getByRole("button", { name: "Back from order details" }).click();
    await confirmation
      .getByRole("button", { name: "Continue Shopping" })
      .click();
    await page.getByText("Shops around you", { exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(
        (userId) => JSON.parse(sessionStorage.getItem("jpi.bag." + userId)),
        buyer.userId,
      ),
      [],
    );
    changedPrice = true;
    await page.evaluate(() => sessionStorage.removeItem("qa.address.seeded"));
    await page.reload();
    await page.getByText("Bag · 3", {exact:true}).last().click();
    await page.getByText("A price has changed",{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,"bag-price-changed-390.png")});
    await page.getByRole("button",{name:"Accept updated price",exact:true}).click();
    await page.getByText(/₹48 each/).waitFor();
    await page.getByRole("button",{name:"Checkout · ₹189",exact:true}).waitFor();
    await page.getByRole("button",{name:"Change delivery address",exact:true}).click();
    await home.click();
    await deliver.click();
    await page.getByRole("button",{name:"Checkout · ₹189",exact:true}).waitFor();
    deliveryFeeChanged = true;
    await page.getByRole("button",{name:"Change delivery address",exact:true}).click();
    await deliver.click();
    await page.getByTestId(`bag-shop-${shops[1].id}`).getByText("Delivery fee changed from ₹30 to ₹40.",{exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Resolve delivery to continue",exact:true}).isDisabled(),true);
    await page.getByRole("button",{name:"Accept new quote",exact:true}).click();
    await page.getByRole("button",{name:"Checkout · ₹199",exact:true}).waitFor();
    savedAddressChanged = true;
    await page.getByRole("button",{name:"Change delivery address",exact:true}).click();
    await deliver.click();
    await page.getByText("Your saved address changed",{exact:true}).waitFor();
    savedAddressChanged = false;
    await page.getByRole("button",{name:"Reload saved addresses",exact:true}).click();
    await page.getByRole("button",{name:"Checkout · ₹199",exact:true}).waitFor();
    let removalRequests = 0;
    await page.route("**/addresses/work", async route => {
      if (route.request().method() !== "DELETE") return route.fallback();
      const index = addresses.findIndex(address => address.id === "work");
      assert.notEqual(index, -1);
      addresses.splice(index, 1);
      removalRequests++;
      await route.fulfill({ status: 204, headers: notificationHeaders });
    });
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("button", { name: "Saved Addresses", exact: true }).click();
    const removeWork = page.getByRole("button", { name: "Remove Work address", exact: true });
    await removeWork.waitFor();
    const setWorkDefault = page.getByRole("button", { name: "Set Work as default", exact: true });
    if (await setWorkDefault.count()) await setWorkDefault.click();
    const defaultKey = "jpi.address.default." + buyer.userId;
    await page.waitForFunction(key => sessionStorage.getItem(key) === "work", defaultKey);
    await removeWork.click();
    await page.getByRole("button", { name: "Keep address", exact: true }).click();
    assert.equal(removalRequests, 0);
    await removeWork.click();
    await page.getByRole("button", { name: "Confirm removal", exact: true }).click();
    await removeWork.waitFor({ state: "hidden" });
    await page.waitForFunction(key => sessionStorage.getItem(key) === null, defaultKey);
    assert.equal(removalRequests, 1);
    await page.getByRole("button", { name: "Back to Account", exact: true }).click();
    await page.route("**/auth/me", route => route.fulfill({status:503,headers:notificationHeaders,json:{message:"Temporarily unavailable"}}));
    await page.reload();
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByTestId("buyer-account-hub").getByText(buyer.name, { exact: true }).waitFor();
    let logoutRequests = 0;
    await page.route("**/auth/logout", route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({status:204,headers:notificationHeaders});
      assert.equal(route.request().method(), "POST");
      logoutRequests++;
      return route.fulfill({status:204,headers:notificationHeaders});
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("heading", { name: "Sign out of JustPackIt?", exact: true }).waitFor();
    await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
    await page.waitForFunction(() => sessionStorage.getItem("jpi.buyer.session") === null);
    assert.equal(logoutRequests, 1);
    await page.reload();
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("button", { name: "Sign in / Create account", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: address management, four viewports, shop fees, delivery and stock blockers, COD payload, duplicate prevention and confirmed navigation",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
