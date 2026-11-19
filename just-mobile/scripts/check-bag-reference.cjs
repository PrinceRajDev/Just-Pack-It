const { chromium } = require("../../just-front/node_modules/playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

async function run() {
  const data = path.resolve(__dirname, "../qa/home-reference");
  const output = path.resolve(__dirname, "../qa/bag-reference");
  fs.mkdirSync(output, { recursive: true });
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(data, name + ".json")));
  const shops = read("shops")
    .slice(0, 2)
    .map((shop, index) => ({
      ...shop,
      name: ["Sharma Kirana Store", "Patil Fresh Mart"][index],
      fulfilment: ["platform_delivery"],
    }));
  const original = read("products")[0];
  const products = [
    {
      name: "Farm fresh tomatoes",
      unit: "1 kg",
      price: 44,
      stock: 4,
      shopId: shops[0].id,
    },
    {
      name: "Yelakki bananas",
      unit: "6 pieces",
      price: 45,
      stock: 3,
      shopId: shops[0].id,
    },
    {
      name: "Fresh milk",
      unit: "500 ml",
      price: 30,
      stock: 2,
      shopId: shops[1].id,
    },
  ].map((item, index) => ({
    ...original,
    ...item,
    id: "bag-fixture-" + index,
    variants: [],
    image: "https://bag-fixture.test/" + index + ".png",
  }));
  const buyer = {
    userId: "qa-bag-buyer",
    name: "Test buyer",
    token: "fixture-token",
    role: "buyer",
    isDemo: false,
  };
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
      ({ userId, product }) => {
        if (!sessionStorage.getItem("qa.initialized")) {
          sessionStorage.setItem("qa.initialized", "1");
          sessionStorage.setItem(
            "jpi.bag." + userId,
            JSON.stringify([{ ...product, quantity: 1 }]),
          );
        }
      },
      { userId: buyer.userId, product: products[0] },
    );
    await page.route("https://bag-fixture.test/*.png", (route) => {
      const index = Number(new URL(route.request().url()).pathname[1]);
      return route.fulfill({
        path:
          index === 0
            ? path.resolve(
                __dirname,
                "../qa/product-reference/fixture-photo.png",
              )
            : path.resolve(
                __dirname,
                "../qa/browse-reference/grocery-photo-" +
                  (index === 2 ? 3 : index) +
                  ".png",
              ),
      });
    });
    await page.route(
      "https://just-pack-it-bq64.onrender.com/**",
      async (route) => {
        const url = new URL(route.request().url());
        const resource = url.pathname.slice(1);
        const headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        };
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        if (resource === "auth/login") {
          const credentials = route.request().postDataJSON();
          assert.equal(credentials.phone, "+919876543210");
          if (credentials.password !== "fixture-password") {
            return route.fulfill({ status: 401, headers, json: { message: "Invalid mobile number or password" } });
          }
        }
        const body =
          resource === "auth/login" || resource === "auth/me"
            ? buyer
            : resource === "auth/registration-options"
              ? { emailOtpRequired: false, emailOtpAvailable: false }
              : resource === "addresses"
                ? []
                : resource === "products"
                  ? products.filter((p) =>
                      p.name
                        .toLowerCase()
                        .includes(
                          url.searchParams.get("q")?.toLowerCase() ?? "",
                        ),
                    )
                  : resource.startsWith("products/")
                    ? products.find((p) => resource.endsWith("/" + p.id))
                    : resource === "shops" ||
                        resource === "catalogue/shops/by-ids"
                      ? shops
                      : resource === "categories" || resource === "areas"
                        ? read(resource)
                        : [];
        await route.fulfill({ json: body, headers });
      },
    );
    await page.goto(process.env.PREVIEW_URL || "http://localhost:8109");
    await page
      .getByText("Shops around you", { exact: true })
      .waitFor({ timeout: 60000 });
    await page.addStyleTag({
      content:
        '[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}',
    });
    await page.getByText("Browse", { exact: true }).click();
    const search = page.getByRole("textbox", {
      name: "Search products, shops and brands",
    });
    for (const product of products) {
      await search.fill(product.name);
      await page
        .getByRole("button", { name: "View " + product.name, exact: true })
        .click();
      const add = page.getByTestId("product-add");
      await add.getByText("Add to Bag · ₹" + product.price).waitFor();
      await add.click();
      await add.getByText("Added to bag", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Back from product" }).click();
    }
    await page.getByText("View bag", { exact: true }).click();
    const bag = page.getByTestId("buyer-bag");
    const first = bag.getByTestId("bag-shop-" + shops[0].id);
    const second = bag.getByTestId("bag-shop-" + shops[1].id);
    await first.getByText(shops[0].name, { exact: true }).waitFor();
    await second.getByText(shops[1].name, { exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="buyer-bag"] img')].filter(
          (img) => img.complete && img.naturalWidth > 0,
        ).length >= 3,
    );
    for (const [width, height] of [
      [390, 844],
      [360, 800],
      [375, 812],
      [430, 932],
    ]) {
      await page.setViewportSize({ width, height });
      const footer = await page.getByTestId("bag-footer").boundingBox();
      const scroll = await page.getByTestId("bag-scroll").boundingBox();
      assert.ok(scroll.y + scroll.height <= footer.y + 1);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(output, "bag-" + width + ".png"),
      });
    }
    const plus = bag.getByRole("button", {
      name: "Add one Farm fresh tomatoes",
      exact: true,
    });
    const minus = bag.getByRole("button", {
      name: "Remove one Farm fresh tomatoes",
      exact: true,
    });
    await plus.click();
    await first.getByLabel("Item total ₹88", { exact: true }).waitFor();
    await first.getByLabel("Shop subtotal ₹133", { exact: true }).waitFor();
    await plus.click();
    await plus.click();
    assert.equal(await plus.isDisabled(), true);
    await first.getByLabel("Item total ₹176", { exact: true }).waitFor();
    await minus.click();
    await minus.click();
    await minus.click();
    await first.getByLabel("Item total ₹44", { exact: true }).waitFor();
    await bag
      .getByRole("button", { name: "Remove Fresh milk", exact: true })
      .click();
    await second.waitFor({ state: "detached" });
    await bag.getByRole("button", { name: "Back from bag" }).click();
    await search.waitFor();
    await page.getByText("View bag", { exact: true }).click();
    await bag
      .getByRole("button", { name: "Sign in to continue", exact: true })
      .click();
    const login = page.getByTestId("buyer-sign-in");
    const submit = login.getByRole("button", { name: "Sign in", exact: true });
    const mobile = login.getByLabel("Mobile number", { exact: true });
    const password = login.getByLabel("Password", { exact: true });
    await login.getByText("Sign in to checkout", { exact: true }).waitFor();
    for (const [width, height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, "sign-in-" + width + ".png") });
    }
    await submit.click();
    await login.getByText("Enter your mobile number.", { exact: true }).waitFor();
    await mobile.fill("123");
    await submit.click();
    await login.getByText("Enter a valid mobile number with its country code.", { exact: true }).waitFor();
    await mobile.fill("+91 98765 43210");
    await submit.click();
    await login.getByText("Enter your password.", { exact: true }).waitFor();
    await password.fill("wrong-password");
    assert.equal(await password.getAttribute("type"), "password");
    await login.getByRole("button", { name: "Show password" }).click();
    assert.equal(await password.evaluate(input => input.type), "text");
    assert.equal(await password.inputValue(), "wrong-password");
    await login.getByRole("button", { name: "Hide password" }).click();
    assert.equal(await password.getAttribute("type"), "password");
    await submit.click();
    await login.getByText("Invalid mobile number or password", { exact: true }).waitFor();
    await login.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByText("Reset password", { exact: true }).waitFor();
    await page.getByText("← Sign in", { exact: true }).click();
    await login.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByText("Create your account", { exact: true }).waitFor();
    await page.getByText("Already have an account? Sign in", { exact: true }).click();
    await login.getByRole("button", { name: "Continue browsing as guest" }).click();
    await search.waitFor();
    await page.getByText("View bag", { exact: true }).click();
    await first.getByText("Farm fresh tomatoes", { exact: true }).waitFor();
    await bag.getByRole("button", { name: "Sign in to checkout", exact: true }).click();
    await login.getByRole("button", { name: "Back from sign in" }).click();
    await bag.getByRole("button", { name: "Sign in to checkout", exact: true }).click();
    await mobile.fill("+91 98765 43210");
    await password.fill("fixture-password");
    await submit.click();
    await bag
      .getByRole("button", { name: "Continue to checkout", exact: true })
      .waitFor();
    const saved = await page.evaluate(
      (userId) => ({
        account: JSON.parse(sessionStorage.getItem("jpi.bag." + userId)),
        guest: sessionStorage.getItem("jpi.bag.guest"),
      }),
      buyer.userId,
    );
    assert.equal(
      saved.account.find((item) => item.id === products[0].id).quantity,
      2,
    );
    assert.equal(saved.account.length, 2);
    assert.equal(saved.guest, null);
    await bag
      .getByRole("button", { name: "Continue to checkout", exact: true })
      .click();
    await page
      .getByText("No saved addresses yet. Add your delivery address above.", {
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Back from choose address" }).click();
    for (const product of products.slice(0, 2)) {
      await bag
        .getByRole("button", { name: "Remove " + product.name, exact: true })
        .click();
    }
    await bag
      .getByText("Your bag is looking empty.", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: multi-shop add, four viewports, images, subtotal, quantity, removal, back, guest sign-in, merge, checkout, empty bag",
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
