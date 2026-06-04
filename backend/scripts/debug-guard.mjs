import 'dotenv/config';

const revealSensitiveDebugOutput = () => process.env.ALLOW_SENSITIVE_DEBUG_OUTPUT === 'true';

export function requireDebugScript({ name, requiredEnv = [] }) {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  const allowed = process.env.ALLOW_DEBUG_SCRIPTS === 'true';

  if (allowed && missing.length === 0) return;

  const details = [
    `${name} is a diagnostic script and can print local data.`,
    'Set ALLOW_DEBUG_SCRIPTS=true before running it.',
  ];

  if (missing.length > 0) {
    details.push(`Missing required env: ${missing.join(', ')}`);
  }

  console.error(details.join('\n'));
  process.exit(1);
}

export function formatDebugUrl(value) {
  if (!value) return value;
  if (revealSensitiveDebugOutput()) return value;

  try {
    const url = new URL(String(value));
    const pathParts = url.pathname.split('/').filter(Boolean);
    const tail = pathParts.at(-1);
    return `${url.origin}/.../${tail || 'resource'} [redacted]`;
  } catch {
    const text = String(value);
    if (text.startsWith('r2://')) return 'r2://... [redacted]';
    return '[redacted]';
  }
}

export function formatDebugValue(value) {
  if (!value) return value;
  if (revealSensitiveDebugOutput()) return value;
  return '[redacted]';
}
