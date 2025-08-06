// utils/zodSchemaBuilder.js
import { z } from 'zod';

export function makeZodSchema(form) {
  // 1) build the “shape” object for each field
  const shape = {};
  for (const field of form.fields) {
    let s = z
      .string()
      .trim();

    // required?
    if (field.required) {
      s = s.nonempty({ message: `${field.label} is required` });
    }

    // minLength?
    if (typeof field.minLength === 'number') {
      s = s.min(
        field.minLength,
        { message: `${field.label} must be at least ${field.minLength} characters` }
      );
    }

    // maxLength?
    if (typeof field.maxLength === 'number') {
      s = s.max(
        field.maxLength,
        { message: `${field.label} must be at most ${field.maxLength} characters` }
      );
    }

    shape[field.id] = s;
  }

  // 2) create base object schema
  let schema = z.object(shape);

  // 3) handle any cross-field rules
  if (form.handleIdenticalFields === 'error' && form.fields.length >= 2) {
    const [f1, f2] = form.fields;
    schema = schema.superRefine((data, ctx) => {
      if (data[f1.id] === data[f2.id]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [f2.id],
          message: `${f2.label} must differ from ${f1.label}`,
        });
      }
    });
  }

  return schema;
}