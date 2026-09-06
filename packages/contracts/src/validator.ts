import Ajv, { type ValidateFunction } from "ajv";
import defaultsSchema from "../schemas/defaults.schema.json";
import resultSchema from "../schemas/result.schema.json";

let ajvInstance: Ajv | null = null;
let resultValidator: ValidateFunction | null = null;
let defaultsValidator: ValidateFunction | null = null;

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false });
  }
  return ajvInstance;
}

export function getValidateResultSchema(): ValidateFunction {
  if (!resultValidator) {
    resultValidator = getAjv().compile(resultSchema);
  }
  return resultValidator;
}

export function getValidateDefaultsSchema(): ValidateFunction {
  if (!defaultsValidator) {
    defaultsValidator = getAjv().compile(defaultsSchema);
  }
  return defaultsValidator;
}

export const validateResultSchema: ValidateFunction = Object.assign(
  (data: unknown, ...args: unknown[]) => {
    return (
      getValidateResultSchema() as unknown as (...a: unknown[]) => boolean
    )(data, ...args);
  },
  {
    get errors() {
      return getValidateResultSchema().errors;
    },
    schema: resultSchema,
  },
) as unknown as ValidateFunction;

export const validateDefaultsSchema: ValidateFunction = Object.assign(
  (data: unknown, ...args: unknown[]) => {
    return (
      getValidateDefaultsSchema() as unknown as (...a: unknown[]) => boolean
    )(data, ...args);
  },
  {
    get errors() {
      return getValidateDefaultsSchema().errors;
    },
    schema: defaultsSchema,
  },
) as unknown as ValidateFunction;

export function validateResultDocument(data: unknown): {
  valid: boolean;
  errors?: string[];
} {
  const validator = getValidateResultSchema();
  const valid = validator(data);
  if (!valid && validator.errors) {
    const errors = validator.errors.map(
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
  const validator = getValidateDefaultsSchema();
  const valid = validator(data);
  if (!valid && validator.errors) {
    const errors = validator.errors.map(
      (err) => `${err.instancePath || "root"} ${err.message}`,
    );
    return { valid: false, errors };
  }
  return { valid: true };
}

export { resultSchema, defaultsSchema };
