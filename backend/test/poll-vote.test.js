import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  findInvalidPollOptionIds,
  normalizePollVoteSelection,
} from '../src/utils/poll-vote.util.js';

test('poll vote selection accepts one option for single-choice polls', () => {
  assert.deepEqual(
    normalizePollVoteSelection({ optionId: 'option-1' }, false),
    ['option-1']
  );
});

test('poll vote selection rejects missing or multiple options for single-choice polls', () => {
  assert.throws(
    () => normalizePollVoteSelection({}, false),
    /Select at least one option/
  );
  assert.throws(
    () => normalizePollVoteSelection({ optionIds: ['option-1', 'option-2'] }, false),
    /only one answer/
  );
});

test('poll vote selection de-duplicates multiple-answer options', () => {
  assert.deepEqual(
    normalizePollVoteSelection({
      optionIds: [' option-1 ', 'option-2', 'option-1', '', null],
    }, true),
    ['option-1', 'option-2']
  );
});

test('poll vote option validation finds ids outside the poll', () => {
  assert.deepEqual(
    findInvalidPollOptionIds(
      [{ id: 'option-1' }, { id: 'option-2' }],
      ['option-1', 'option-3']
    ),
    ['option-3']
  );
});

test('poll vote service records votes inside a serializable transaction', () => {
  const source = fs.readFileSync(path.resolve('src/services/poll-vote.service.js'), 'utf8');

  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /P2034/);
  assert.match(source, /createMany/);
  assert.match(source, /skipDuplicates:\s*true/);
});
