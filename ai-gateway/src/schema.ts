// Minimal JSON-Schema validator for the subset our schemas use:
// type, properties, required, enum, items, nullable. Gemini's structured output is
// usually right, but we never trust it without checking.
export type Schema = { type?: string; nullable?: boolean; properties?: Record<string, Schema>; required?: string[]; enum?: unknown[]; items?: Schema; description?: string };

export function validate(schema: Schema, value: unknown, path = '$'): string[] {
  const errs: string[] = [];
  if (value === null || value === undefined) {
    if (schema.nullable) return errs;
    return [`${path}: missing`];
  }
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return [`${path}: expected object`];
      const o = value as Record<string, unknown>;
      for (const k of schema.required || []) if (o[k] === undefined || (o[k] === null && !schema.properties?.[k]?.nullable)) errs.push(`${path}.${k}: required`);
      for (const [k, s] of Object.entries(schema.properties || {})) if (o[k] !== undefined) errs.push(...validate(s, o[k], `${path}.${k}`));
      break;
    }
    case 'array':
      if (!Array.isArray(value)) return [`${path}: expected array`];
      if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items!, v, `${path}[${i}]`)));
      break;
    case 'string': if (typeof value !== 'string') errs.push(`${path}: expected string`); break;
    case 'number': case 'integer': if (typeof value !== 'number' || !isFinite(value)) errs.push(`${path}: expected number`); break;
    case 'boolean': if (typeof value !== 'boolean') errs.push(`${path}: expected boolean`); break;
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: not one of ${schema.enum.join('|')}`);
  return errs;
}

// builders keep the (inlined, $ref-free) schemas short
export const S = {
  str: (nullable = false): Schema => ({ type: 'string', ...(nullable ? { nullable: true } : {}) }),
  num: (nullable = false): Schema => ({ type: 'number', ...(nullable ? { nullable: true } : {}) }),
  bool: (): Schema => ({ type: 'boolean' }),
  oneOf: (...v: string[]): Schema => ({ type: 'string', enum: v }),
  arr: (items: Schema): Schema => ({ type: 'array', items }),
  obj: (properties: Record<string, Schema>, required: string[] = Object.keys(properties), nullable = false): Schema => ({ type: 'object', properties, required, ...(nullable ? { nullable: true } : {}) }),
};
