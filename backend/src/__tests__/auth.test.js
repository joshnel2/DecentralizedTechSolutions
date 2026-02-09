/**
 * Tests for authentication utilities.
 * These test the core crypto and JWT functions without needing a database.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Set required env vars before importing auth module
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-characters-long';

const {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateSecureToken,
  getPermissionsForRole,
  hasPermission,
} = await import('../utils/auth.js');

describe('Password hashing', () => {
  it('should hash and verify a password', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(20);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const isValid = await verifyPassword('wrong-password', hash);
    expect(isValid).toBe(false);
  });

  it('should produce different hashes for same password (salted)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });
});

describe('JWT tokens', () => {
  const mockUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    firm_id: '660e8400-e29b-41d4-a716-446655440000',
    role: 'attorney',
  };

  it('should generate and verify access token', () => {
    const token = generateAccessToken(mockUser);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded.userId).toBe(mockUser.id);
    expect(decoded.email).toBe(mockUser.email);
    expect(decoded.firmId).toBe(mockUser.firm_id);
    expect(decoded.role).toBe(mockUser.role);
  });

  it('should generate and verify refresh token', () => {
    const token = generateRefreshToken(mockUser);
    expect(token).toBeTruthy();

    const decoded = verifyRefreshToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded.userId).toBe(mockUser.id);
    expect(decoded.type).toBe('refresh');
  });

  it('should reject tampered access token', () => {
    const token = generateAccessToken(mockUser);
    const tampered = token.slice(0, -5) + 'XXXXX';
    const decoded = verifyAccessToken(tampered);
    expect(decoded).toBeNull();
  });

  it('should reject access token verified with refresh secret', () => {
    const accessToken = generateAccessToken(mockUser);
    const decoded = verifyRefreshToken(accessToken);
    // Should be null because access tokens use JWT_SECRET, not JWT_REFRESH_SECRET
    expect(decoded).toBeNull();
  });

  it('should not include password in token payload', () => {
    const userWithPassword = { ...mockUser, password_hash: 'secret-hash' };
    const token = generateAccessToken(userWithPassword);
    const decoded = verifyAccessToken(token);
    expect(decoded.password_hash).toBeUndefined();
    expect(decoded.password).toBeUndefined();
  });
});

describe('Token hashing', () => {
  it('should produce consistent hash for same input', () => {
    const hash1 = hashToken('test-token');
    const hash2 = hashToken('test-token');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different input', () => {
    const hash1 = hashToken('token-a');
    const hash2 = hashToken('token-b');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce hex string of expected length', () => {
    const hash = hashToken('test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Secure token generation', () => {
  it('should generate token of correct length', () => {
    const token = generateSecureToken(32);
    expect(token.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it('should generate unique tokens', () => {
    const tokens = new Set();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSecureToken(16));
    }
    expect(tokens.size).toBe(100);
  });
});

describe('Role permissions', () => {
  it('should return permissions for known roles', () => {
    const ownerPerms = getPermissionsForRole('owner');
    expect(ownerPerms).toContain('firm:manage');
    expect(ownerPerms).toContain('users:delete');

    const staffPerms = getPermissionsForRole('staff');
    expect(staffPerms).toContain('matters:view');
    expect(staffPerms).not.toContain('firm:manage');
  });

  it('should return readonly permissions for unknown role', () => {
    const perms = getPermissionsForRole('nonexistent');
    expect(perms).toEqual(getPermissionsForRole('readonly'));
  });

  it('owner should have all permissions', () => {
    expect(hasPermission('owner', 'anything:whatever')).toBe(true);
    expect(hasPermission('owner', 'firm:delete')).toBe(true);
  });

  it('staff should not have billing permissions', () => {
    expect(hasPermission('staff', 'billing:create')).toBe(false);
    expect(hasPermission('staff', 'billing:view')).toBe(false);
  });

  it('attorney should have document permissions', () => {
    expect(hasPermission('attorney', 'documents:upload')).toBe(true);
    expect(hasPermission('attorney', 'documents:edit')).toBe(true);
  });
});
