import Ajv, { type ValidateFunction } from "ajv";
import defaultsSchema from "../schemas/defaults.schema.json";
import resultSchema from "../schemas/result.schema.json";

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
