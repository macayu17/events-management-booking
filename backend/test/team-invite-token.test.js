import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTeamInviteToken,
  verifyTeamInviteToken,
} from '../src/utils/team-invite-token.util.js';

test('team invite tokens are bound to event, email, and invite timestamp', () => {
  process.env.JWT_SECRET = 'team-invite-test-secret';
  const invite = {
    eventId: 'event-1',
    email: 'TEAM@example.com',
    invitedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const token = createTeamInviteToken(invite);

  assert.equal(verifyTeamInviteToken(token, invite), true);
  assert.equal(verifyTeamInviteToken(token, { ...invite, email: 'other@example.com' }), false);
  assert.equal(verifyTeamInviteToken(token, { ...invite, eventId: 'event-2' }), false);
  assert.equal(
    verifyTeamInviteToken(token, { ...invite, invitedAt: new Date('2026-01-02T00:00:00.000Z') }),
    false
  );
});
