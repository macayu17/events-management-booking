import assert from 'node:assert/strict';
import test from 'node:test';
import { formSchemaToAjv, validateFormSchema } from '../src/utils/form-schema.util.js';

test('form schema validation normalizes supported fields', () => {
  assert.deepEqual(validateFormSchema({
    title: '  Workshop Signup  ',
    fields: [
      { key: 'name', type: 'text', label: ' Full name ', required: true },
      { key: 'email', type: 'email', label: 'Email', required: true },
      { key: 'meal', type: 'select', label: 'Meal', options: ['Veg', 'Veg', 'Non-veg', ''] },
    ],
  }), {
    title: 'Workshop Signup',
    fields: [
      { key: 'name', type: 'text', label: 'Full name', required: true },
      { key: 'email', type: 'email', label: 'Email', required: true },
      { key: 'meal', type: 'select', label: 'Meal', required: false, options: ['Veg', 'Non-veg'] },
    ],
  });
});

test('form schema validation rejects malformed schemas before public registration', () => {
  assert.throws(() => validateFormSchema(null), /Form schema must be an object/);
  assert.throws(() => validateFormSchema({ fields: [] }), /at least one field/);
  assert.throws(
    () => validateFormSchema({ fields: [{ key: 'email', type: 'text', label: 'Email' }] }),
    /must include an email field/
  );
  assert.throws(
    () => validateFormSchema({
      fields: [
        { key: 'email', type: 'email', label: 'Email' },
        { key: 'email', type: 'email', label: 'Duplicate email' },
      ],
    }),
    /duplicated/
  );
  assert.throws(
    () => validateFormSchema({
      fields: [
        { key: 'email', type: 'email', label: 'Email' },
        { key: 'meal', type: 'select', label: 'Meal', options: [] },
      ],
    }),
    /select options/
  );
});

test('form schema conversion produces an AJV contract with required fields', () => {
  assert.deepEqual(formSchemaToAjv({
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true },
      { key: 'email', type: 'email', label: 'Email', required: true },
      { key: 'age', type: 'number', label: 'Age' },
      { key: 'meal', type: 'select', label: 'Meal', options: ['Veg', 'Non-veg'] },
    ],
  }), {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      age: { type: 'number' },
      meal: { type: 'string', enum: ['Veg', 'Non-veg'] },
    },
    required: ['name', 'email'],
    additionalProperties: true,
  });
});
