import { ROLE_RANK, meetsMinimum, type RbacRole } from './organization-roles.js';

describe('RBAC role model', () => {
  describe('ROLE_RANK', () => {
    it('orders the four locked roles monotonically (least privilege first)', () => {
      expect(ROLE_RANK.VIEWER).toBe(0);
      expect(ROLE_RANK.MEMBER).toBe(1);
      expect(ROLE_RANK.ADMIN).toBe(2);
      expect(ROLE_RANK.OWNER).toBe(3);
    });

    it('exposes a frozen rank table (no runtime mutation)', () => {
      expect(Object.isFrozen(ROLE_RANK)).toBe(true);
    });
  });

  describe('meetsMinimum (inclusive minimum-role semantics)', () => {
    it('OWNER >= OWNER', () => {
      expect(meetsMinimum('OWNER', 'OWNER')).toBe(true);
    });

    it('OWNER >= ADMIN', () => {
      expect(meetsMinimum('OWNER', 'ADMIN')).toBe(true);
    });

    it('OWNER >= MEMBER', () => {
      expect(meetsMinimum('OWNER', 'MEMBER')).toBe(true);
    });

    it('OWNER >= VIEWER', () => {
      expect(meetsMinimum('OWNER', 'VIEWER')).toBe(true);
    });

    it('ADMIN >= ADMIN', () => {
      expect(meetsMinimum('ADMIN', 'ADMIN')).toBe(true);
    });

    it('ADMIN >= MEMBER', () => {
      expect(meetsMinimum('ADMIN', 'MEMBER')).toBe(true);
    });

    it('ADMIN >= VIEWER', () => {
      expect(meetsMinimum('ADMIN', 'VIEWER')).toBe(true);
    });

    it('ADMIN < OWNER', () => {
      expect(meetsMinimum('ADMIN', 'OWNER')).toBe(false);
    });

    it('MEMBER >= MEMBER', () => {
      expect(meetsMinimum('MEMBER', 'MEMBER')).toBe(true);
    });

    it('MEMBER < ADMIN', () => {
      expect(meetsMinimum('MEMBER', 'ADMIN')).toBe(false);
    });

    it('VIEWER >= VIEWER', () => {
      expect(meetsMinimum('VIEWER', 'VIEWER')).toBe(true);
    });

    it('VIEWER < MEMBER', () => {
      expect(meetsMinimum('VIEWER', 'MEMBER')).toBe(false);
    });

    it('fails closed for an unknown role string', () => {
      expect(meetsMinimum('SUPERADMIN', 'VIEWER')).toBe(false);
      expect(meetsMinimum('OWNER', 'SUPERADMIN' as RbacRole)).toBe(false);
    });

    it('fails closed for null, undefined, and non-string values', () => {
      expect(meetsMinimum(undefined, 'VIEWER')).toBe(false);
      expect(meetsMinimum(null, 'VIEWER')).toBe(false);
      expect(meetsMinimum(3, 'VIEWER')).toBe(false);
      expect(meetsMinimum({}, 'VIEWER')).toBe(false);
    });
  });
});
