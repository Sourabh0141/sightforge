import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";
import prettier from "prettier";

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

  const prettierConfig =
    (await prettier.resolveConfig(path.join(generatedDir, "result.ts"))) || {};

  const resultTs = await compileFromFile(
    path.join(schemasDir, "result.schema.json"),
    {
      bannerComment:
        "/* eslint-disable */\n/**\n * Auto-generated from result.schema.json. Do not edit manually.\n */",
    },
  );
  const formattedResult = await prettier.format(resultTs, {
    ...prettierConfig,
    parser: "typescript",
  });
  fs.writeFileSync(path.join(generatedDir, "result.ts"), formattedResult);
  console.log("Generated packages/contracts/src/generated/result.ts");

  const defaultsTs = await compileFromFile(
    path.join(schemasDir, "defaults.schema.json"),
    {
      bannerComment:
        "/* eslint-disable */\n/**\n * Auto-generated from defaults.schema.json. Do not edit manually.\n */",
    },
  );
  const formattedDefaults = await prettier.format(defaultsTs, {
    ...prettierConfig,
    parser: "typescript",
  });
  fs.writeFileSync(path.join(generatedDir, "defaults.ts"), formattedDefaults);
  console.log("Generated packages/contracts/src/generated/defaults.ts");
}

generate().catch((err) => {
  console.error("Error generating TypeScript types:", err);
  process.exit(1);
});
