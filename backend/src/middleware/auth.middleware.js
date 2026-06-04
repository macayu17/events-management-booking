import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const authenticateToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const requireOrganizer = (req, res, next) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ORGANIZER') {
    return res.status(403).json({ error: 'Organizer access required' });
  }
  next();
};

// ============================================
// TEAM MEMBER ACCESS HELPERS
// ============================================

/**
 * Get team member access for a user on a specific event
 * Returns the TeamMember record if found, null otherwise
 */
export const getTeamAccess = async (userEmail, eventId) => {
  const teamMember = await prisma.teamMember.findUnique({
    where: { eventId_email: { eventId, email: userEmail } }
  });
  return teamMember;
};

/**
 * Check if user has access to an event (owner, admin, or team member)
 * Returns: { hasAccess: boolean, role: string, isOwner: boolean, isTeamMember: boolean }
 */
export const checkEventAccess = async (user, eventId, requiredRoles = []) => {
  // Get event
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true }
  });

  if (!event) {
    return { hasAccess: false, error: 'Event not found' };
  }

  // Admin always has access
  if (user.role === 'ADMIN') {
    return { hasAccess: true, role: 'ADMIN', isOwner: false, isTeamMember: false };
  }

  // Owner always has access
  if (event.organizerId === user.id) {
    return { hasAccess: true, role: 'OWNER', isOwner: true, isTeamMember: false };
  }

  // Check team membership
  const teamMember = await getTeamAccess(user.email, eventId);

  if (!teamMember) {
    return { hasAccess: false, error: 'Not authorized' };
  }

  if (!teamMember.acceptedAt) {
    return { hasAccess: false, error: 'Invitation has not been accepted' };
  }

  // If specific roles required, check them
  if (requiredRoles.length > 0 && !requiredRoles.includes(teamMember.role)) {
    return { hasAccess: false, error: 'Insufficient permissions', teamRole: teamMember.role };
  }

  return {
    hasAccess: true,
    role: teamMember.role,
    isOwner: false,
    isTeamMember: true,
    teamMember
  };
};

/**
 * Middleware factory to require event access with optional role filter
 * Usage: requireEventAccess(['MANAGER', 'SCANNER']) or requireEventAccess() for any team role
 */
export const requireEventAccess = (requiredRoles = []) => {
  return async (req, res, next) => {
    const eventId = req.params.id || req.params.eventId;

    if (!eventId) {
      return res.status(400).json({ error: 'Event ID required' });
    }

    const access = await checkEventAccess(req.user, eventId, requiredRoles);

    if (!access.hasAccess) {
      return res.status(403).json({ error: access.error || 'Not authorized' });
    }

    // Attach access info to request for use in route handlers
    req.eventAccess = access;
    next();
  };
};
