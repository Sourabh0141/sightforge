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

const validateResultWrapper = (data: unknown, ...args: unknown[]) => {
  return (getValidateResultSchema() as unknown as (...a: unknown[]) => boolean)(
    data,
    ...args,
  );
};

Object.defineProperty(validateResultWrapper, "errors", {
  get() {
    return getValidateResultSchema().errors;
  },
  enumerable: true,
  configurable: true,
});

Object.defineProperty(validateResultWrapper, "schema", {
  value: resultSchema,
  enumerable: true,
  writable: false,
});

export const validateResultSchema: ValidateFunction =
  validateResultWrapper as unknown as ValidateFunction;

const validateDefaultsWrapper = (data: unknown, ...args: unknown[]) => {
  return (
    getValidateDefaultsSchema() as unknown as (...a: unknown[]) => boolean
  )(data, ...args);
};

Object.defineProperty(validateDefaultsWrapper, "errors", {
  get() {
    return getValidateDefaultsSchema().errors;
  },
  enumerable: true,
  configurable: true,
});

Object.defineProperty(validateDefaultsWrapper, "schema", {
  value: defaultsSchema,
  enumerable: true,
  writable: false,
});

export const validateDefaultsSchema: ValidateFunction =
  validateDefaultsWrapper as unknown as ValidateFunction;

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
