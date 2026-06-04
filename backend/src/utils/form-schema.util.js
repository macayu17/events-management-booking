const FIELD_TYPES = new Set(['text', 'email', 'tel', 'number', 'select', 'textarea']);
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const invalidSchema = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

export const DEFAULT_FORM_SCHEMA = Object.freeze({
  title: 'Registration Form',
  fields: Object.freeze([
    Object.freeze({ key: 'name', type: 'text', label: 'Full Name', required: true }),
    Object.freeze({ key: 'email', type: 'email', label: 'Email', required: true }),
    Object.freeze({ key: 'phone', type: 'tel', label: 'Phone Number', required: false }),
  ]),
});

export function validateFormSchema(schemaJson) {
  if (!schemaJson || typeof schemaJson !== 'object' || Array.isArray(schemaJson)) {
    throw invalidSchema('Form schema must be an object');
  }

  if (!Array.isArray(schemaJson.fields) || schemaJson.fields.length === 0) {
    throw invalidSchema('Form schema must include at least one field');
  }

  const seenKeys = new Set();
  const fields = schemaJson.fields.map((field, index) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      throw invalidSchema(`Field ${index + 1} must be an object`);
    }

    const key = String(field.key || '').trim();
    const label = String(field.label || '').trim();
    const type = String(field.type || 'text').trim();

    if (!FIELD_KEY_PATTERN.test(key)) {
      throw invalidSchema(`Field ${index + 1} has an invalid key`);
    }
    if (seenKeys.has(key)) {
      throw invalidSchema(`Field key "${key}" is duplicated`);
    }
    if (!FIELD_TYPES.has(type)) {
      throw invalidSchema(`Field "${key}" has an unsupported type`);
    }
    if (!label) {
      throw invalidSchema(`Field "${key}" must have a label`);
    }

    seenKeys.add(key);

    const normalized = {
      key,
      type,
      label,
      required: field.required === true,
    };

    if (type === 'select') {
      const options = Array.isArray(field.options)
        ? field.options.map((option) => String(option || '').trim()).filter(Boolean)
        : [];

      if (options.length === 0) {
        throw invalidSchema(`Field "${key}" must include select options`);
      }

      normalized.options = [...new Set(options)];
    }

    return normalized;
  });

  if (!fields.some((field) => field.key === 'email' && field.type === 'email')) {
    throw invalidSchema('Form schema must include an email field');
  }

  return {
    title: String(schemaJson.title || 'Registration Form').trim() || 'Registration Form',
    fields,
  };
}

export function formSchemaToAjv(formSchema) {
  const normalized = validateFormSchema(formSchema);
  const properties = {};
  const required = [];

  normalized.fields.forEach((field) => {
    switch (field.type) {
      case 'email':
        properties[field.key] = { type: 'string', format: 'email' };
        break;
      case 'tel':
        properties[field.key] = { type: 'string', minLength: 1 };
        break;
      case 'number':
        properties[field.key] = { type: 'number' };
        break;
      case 'select':
        properties[field.key] = { type: 'string', enum: field.options };
        break;
      default:
        properties[field.key] = { type: 'string' };
    }

    if (field.required) {
      required.push(field.key);
    }
  });

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: true,
  };
}
