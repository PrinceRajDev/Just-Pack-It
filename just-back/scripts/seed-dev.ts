import "dotenv/config";
import { loadConfig } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/db.js";
import { Category, Area } from "../src/catalogue/models.js";
async function main() {
  const config = loadConfig();
  const database = new URL(
    config.MONGODB_URI.replace("mongodb+srv:", "https:").replace(
      "mongodb:",
      "http:",
    ),
  ).pathname.slice(1);
  if (
    config.NODE_ENV !== "development" ||
    !database.endsWith("_dev") ||
    process.env.ALLOW_DEVELOPMENT_SEED !== "true"
  )
    throw new Error("Seed guard");
  await connectDatabase(config.MONGODB_URI);
  try {
    if (!(await Category.exists({ slug: "development-test-category" })))
      await Category.create({
        slug: "development-test-category",
        name: "DEVELOPMENT TEST CATEGORY",
        blurb: "Explicit development fixture, not production data",
        image: "",
      });
    if (!(await Area.exists({ name: "DEVELOPMENT TEST AREA" })))
      await Area.create({
        name: "DEVELOPMENT TEST AREA",
        city: "TEST CITY",
        pincodes: ["000000"],
        active: true,
      });
    console.info(
      "Labelled development taxonomy/area fixtures inserted. No users, customers or shops were seeded.",
    );
  } finally {
    await disconnectDatabase();
  }
}
main().catch(() => {
  console.error(
    "Development seed failed or refused. Requires NODE_ENV=development, database ending _dev and ALLOW_DEVELOPMENT_SEED=true.",
  );
  process.exitCode = 1;
});
