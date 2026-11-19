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
  const shops = read("shops").slice(0, 2);
  const products = shops.map((shop, index) => ({
    ...read("products")[0],
    id: "address-product-" + index,
    shopId: shop.id,
    quantity: 1,
    price: 50,
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
            checkoutAvailable: eligible,
            itemsSubtotal: 100,
            deliveryTotal: eligible ? 60 : null,
            grandTotal: eligible ? 160 : null,
            paymentMethods: [],
            issues: [],
            lines: [],
            shops: shops.map((shop) => ({ shop, issues: [] })),
            fulfilments: shops.map((shop, index) => ({
              shopId: shop.id,
              listedFee: !eligible && index === 1 ? null : 30,
              issues:
                !eligible && index === 1
                  ? [{ message: "No approved partner for this address." }]
                  : [],
            })),
          };
        } else if (resource === "addresses") data = addresses;
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
      await page.getByText("Bag · 2", { exact: true }).last().click();
      await page.getByRole("button", { name: "Continue to checkout" }).click();
      await picker.waitFor();
    };
    await page.goto(process.env.PREVIEW_URL || "http://localhost:8113");
    await enter();
    await page.addStyleTag({
      content:
        '[data-testid="choose-address-safe"]{padding-top:28px!important;padding-bottom:20px!important}',
    });
    const home = picker.getByRole("radio", { name: "Home address" });
    const work = picker.getByRole("radio", { name: "Work address" });
    const deliver = picker.getByRole("button", {
      name: "Deliver to this address",
    });
    await picker
      .getByText("Aditi Sharma · 98765 43210", { exact: true })
      .waitFor();
    assert.equal(await home.getAttribute("aria-checked"), "true");
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
    await page
      .getByText("No approved partner for this address.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Change delivery address" }).click();
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
    await page.getByText("Total: ₹160", { exact: true }).waitFor();
    await page.reload();
    await enter();
    await other.waitFor();
    assert.equal(await other.getAttribute("aria-checked"), "true");
    await picker
      .getByRole("button", { name: "Back from choose address" })
      .click();
    await page.getByRole("button", { name: "Continue to checkout" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: four viewports, address selection, edit, add, PIN validation, default after reload, two-shop review and back navigation",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
