import crypto from 'crypto';

const getInviteSecret = () => {
  const secret = process.env.TEAM_INVITE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('TEAM_INVITE_SECRET or JWT_SECRET is required for team invitations');
  }
  return secret;
};

const invitedAtIso = (teamMember) => new Date(teamMember.invitedAt).toISOString();

const tokenPayloadFor = (teamMember) => ({
  eventId: teamMember.eventId,
  email: String(teamMember.email || '').trim().toLowerCase(),
  invitedAt: invitedAtIso(teamMember),
});

const signBody = (body) => crypto
  .createHmac('sha256', getInviteSecret())
  .update(body)
  .digest('base64url');

export const createTeamInviteToken = (teamMember) => {
  const body = Buffer.from(JSON.stringify(tokenPayloadFor(teamMember))).toString('base64url');
  return `${body}.${signBody(body)}`;
};

export const verifyTeamInviteToken = (token, teamMember) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;

  try {
    const [body, signature] = token.split('.');
    const expectedSignature = signBody(body);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const expectedPayload = tokenPayloadFor(teamMember);

    return (
      payload.eventId === expectedPayload.eventId &&
      payload.email === expectedPayload.email &&
      payload.invitedAt === expectedPayload.invitedAt
    );
  } catch {
    return false;
  }
};

export const buildTeamInviteUrl = (teamMember) => {
  const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const token = createTeamInviteToken(teamMember);
  const params = new URLSearchParams({ event: teamMember.eventId, invite: token });
  return `${frontendUrl}/admin/team-events?${params.toString()}`;
};
