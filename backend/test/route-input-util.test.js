import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseBooleanInput,
  parseNullableDateInput,
  parseNullableIntegerInput,
  parseOptionalBooleanInput,
  parseRequiredIntegerInput
} from '../src/utils/route-input.util.js';

test('route boolean input preserves explicit false strings', () => {
  assert.equal(parseOptionalBooleanInput('false', 'allowMultiple', true), false);
  assert.equal(parseOptionalBooleanInput('true', 'notifyUsers', false), true);
  assert.equal(parseOptionalBooleanInput('', 'notifyUsers', false), false);
  assert.equal(parseBooleanInput(false, 'isActive'), false);
});

test('route boolean input rejects ambiguous values', () => {
  assert.throws(() => parseBooleanInput('yes', 'isActive'), /isActive must be a boolean/);
  assert.throws(() => parseBooleanInput(1, 'isActive'), /isActive must be a boolean/);
});

test('route date input accepts nullable fields and rejects invalid dates', () => {
  assert.equal(parseNullableDateInput('', 'endsAt'), null);
  assert.equal(parseNullableDateInput(null, 'validFrom'), null);
  assert.equal(parseNullableDateInput('2026-06-01T00:00:00.000Z', 'validUntil').toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(parseNullableDateInput('2026-06-01T00:30', 'endsAt').getFullYear(), 2026);
  assert.throws(() => parseNullableDateInput('not-a-date', 'endsAt'), /endsAt must be a valid date/);
  assert.throws(() => parseNullableDateInput('2026-02-30', 'endsAt'), /endsAt must be a valid date/);
  assert.throws(() => parseNullableDateInput(true, 'validFrom'), /validFrom must be a valid date/);
  assert.throws(() => parseNullableDateInput(['2026-06-01'], 'validUntil'), /validUntil must be a valid date/);
});

test('route integer input rejects partial coercion and below-minimum values', () => {
  assert.equal(parseRequiredIntegerInput('5', 'amount', 1), 5);
  assert.equal(parseNullableIntegerInput('', 'maxUses', 1), null);
  assert.equal(parseNullableIntegerInput('07', 'maxUses', 1), 7);
  assert.throws(() => parseRequiredIntegerInput('5abc', 'amount', 1), /amount must be an integer/);
  assert.throws(() => parseNullableIntegerInput('0', 'maxUses', 1), /maxUses must be at least 1/);
  assert.throws(() => parseRequiredIntegerInput(['5'], 'amount', 1), /amount must be an integer/);
  assert.throws(() => parseRequiredIntegerInput('2147483648', 'amount', 1), /amount must be a valid 32-bit integer/);
});
