import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const schemasDir = path.join(rootDir, "schemas");
const generatedDir = path.join(rootDir, "src", "generated");

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

async function generate() {
  console.log("Generating TypeScript types from JSON Schemas...");

  const resultTs = await compileFromFile(
    path.join(schemasDir, "result.schema.json"),
    {
      bannerComment:
        "/* eslint-disable */\n/**\n * Auto-generated from result.schema.json. Do not edit manually.\n */",
      style: {
        singleQuote: true,
        semi: true,
      },
    },
  );
  fs.writeFileSync(path.join(generatedDir, "result.ts"), resultTs);
  console.log("Generated packages/contracts/src/generated/result.ts");

  const defaultsTs = await compileFromFile(
    path.join(schemasDir, "defaults.schema.json"),
    {
      bannerComment:
        "/* eslint-disable */\n/**\n * Auto-generated from defaults.schema.json. Do not edit manually.\n */",
      style: {
        singleQuote: true,
        semi: true,
      },
    },
  );
  fs.writeFileSync(path.join(generatedDir, "defaults.ts"), defaultsTs);
  console.log("Generated packages/contracts/src/generated/defaults.ts");
}

generate().catch((err) => {
  console.error("Error generating TypeScript types:", err);
  process.exit(1);
});
