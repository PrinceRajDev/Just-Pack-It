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
        if (resource === "addresses" && method === "POST") {
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
            checkoutAvailable: eligible && !stockUnavailable,
            itemsSubtotal: 129,
            deliveryTotal: eligible ? 60 : null,
            grandTotal: eligible ? 189 : null,
            paymentMethods: eligible && !stockUnavailable ? ["cod"] : [],
            issues: [],
            lines: stockUnavailable
              ? [
                  {
                    issues: [
                      { message: "Farm fresh tomatoes are out of stock." },
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
                    : 30,
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
    await page.getByRole("button", { name: "Account", exact: true }).click();
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
    await page.getByText("Farm fresh tomatoes are out of stock.", { exact: true }).waitFor();
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
    await page.getByRole("button", { name: "Back from order details" }).click();
    await confirmation
      .getByRole("button", { name: "Continue Shopping" })
      .click();
    await page.getByText("Good shops. Close by.", { exact: true }).waitFor();
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
