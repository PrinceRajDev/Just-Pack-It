import "dotenv/config";
import { z } from "zod";
import { loadConfig } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/db.js";
import { registerInput } from "../src/auth/validators.js";
import { roles } from "../src/auth/models.js";
import { createUser } from "../src/auth/service.js";
async function main() {
  const config = loadConfig();
  const input = registerInput.parse({
    name: process.env.OPERATOR_NAME,
    phone: process.env.OPERATOR_PHONE,
    password: process.env.OPERATOR_PASSWORD,
  });
  const role = z.enum(roles).parse(process.env.OPERATOR_ROLE);
  await connectDatabase(config.MONGODB_URI, config.NODE_ENV === "production");
  try {
    await createUser(input, role);
    console.info("Operator user created. No credentials were printed.");
  } finally {
    await disconnectDatabase();
  }
}
main().catch(() => {
  console.error(
    "User creation failed. Verify inputs and uniqueness; credentials were not logged.",
  );
  process.exitCode = 1;
});
