import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { type ValidateFunction } from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const resultSchemaPath = path.join(rootDir, "schemas", "result.schema.json");
const defaultsSchemaPath = path.join(
  rootDir,
  "schemas",
  "defaults.schema.json",
);

const resultSchema = JSON.parse(fs.readFileSync(resultSchemaPath, "utf-8"));
const defaultsSchema = JSON.parse(fs.readFileSync(defaultsSchemaPath, "utf-8"));

const ajv = new Ajv({ allErrors: true, strict: false });

export const validateResultSchema: ValidateFunction = ajv.compile(resultSchema);
export const validateDefaultsSchema: ValidateFunction =
  ajv.compile(defaultsSchema);

export function validateResultDocument(data: unknown): {
  valid: boolean;
  errors?: string[];
} {
  const valid = validateResultSchema(data);
  if (!valid && validateResultSchema.errors) {
    const errors = validateResultSchema.errors.map(
      (err) => `${err.instancePath || "root"} ${err.message}`,
    );
    return { valid: false, errors };
  }
  return { valid: true };
}

export function validateDefaultsConfig(data: unknown): {
  valid: boolean;
  errors?: string[];
} {
  const valid = validateDefaultsSchema(data);
  if (!valid && validateDefaultsSchema.errors) {
    const errors = validateDefaultsSchema.errors.map(
      (err) => `${err.instancePath || "root"} ${err.message}`,
    );
    return { valid: false, errors };
  }
  return { valid: true };
}

export { resultSchema, defaultsSchema };
