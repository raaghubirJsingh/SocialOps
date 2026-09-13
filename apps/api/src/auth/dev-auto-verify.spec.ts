import {
  DEV_AUTO_VERIFY_GATE_ENV,
  isAuthDevAutoVerifyRegister,
} from './dev-auto-verify.js';

describe('isAuthDevAutoVerifyRegister', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalGate = process.env[DEV_AUTO_VERIFY_GATE_ENV];

  afterEach(() => {
    // Restore the original environment exactly. We never touch
    // process.env.NODE_ENV in the production path of the application;
    // tests must leave the runtime exactly as they found it.
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
    if (originalGate === undefined) {
      delete process.env[DEV_AUTO_VERIFY_GATE_ENV];
    } else {
      process.env[DEV_AUTO_VERIFY_GATE_ENV] = originalGate;
    }
  });

  describe('gate flag parsing', () => {
    test('exact "true" + non-production => enabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'true',
        }),
      ).toBe(true);
    });

    test('exact "true" + test => enabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'test',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'true',
        }),
      ).toBe(true);
    });

    test('exact "true" + NODE_ENV undefined => enabled (the gate is opt-in)', () => {
      // When NODE_ENV is unset, we treat the runtime as development
      // for the purposes of the gate. Production deployments set
      // NODE_ENV=production explicitly. The local Jest runner sets
      // NODE_ENV=test, which is also a non-production value.
      expect(
        isAuthDevAutoVerifyRegister({
          [DEV_AUTO_VERIFY_GATE_ENV]: 'true',
        }),
      ).toBe(true);
    });

    test('"false" => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'false',
        }),
      ).toBe(false);
    });

    test('undefined => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
        }),
      ).toBe(false);
    });

    test('empty string => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: '',
        }),
      ).toBe(false);
    });

    test('"1" => disabled (strict string match)', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: '1',
        }),
      ).toBe(false);
    });

    test('"TRUE" => disabled (case-sensitive strict match)', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'TRUE',
        }),
      ).toBe(false);
    });

    test('"yes" => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'yes',
        }),
      ).toBe(false);
    });

    test('"true " (trailing whitespace) => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'true ',
        }),
      ).toBe(false);
    });

    test('" true" (leading whitespace) => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'development',
          [DEV_AUTO_VERIFY_GATE_ENV]: ' true',
        }),
      ).toBe(false);
    });
  });

  describe('production hard-stop', () => {
    test('production + "true" => DISABLED (hard-stop)', () => {
      // This is the most important safety property. Even if a
      // deployment system accidentally sets the env var in
      // production, the gate stays closed.
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'production',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'true',
        }),
      ).toBe(false);
    });

    test('production + "false" => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'production',
          [DEV_AUTO_VERIFY_GATE_ENV]: 'false',
        }),
      ).toBe(false);
    });

    test('production + unset => disabled', () => {
      expect(
        isAuthDevAutoVerifyRegister({
          NODE_ENV: 'production',
        }),
      ).toBe(false);
    });
  });

  describe('process.env default', () => {
    test('default invocation reads from process.env', () => {
      process.env[DEV_AUTO_VERIFY_GATE_ENV] = 'true';
      delete process.env['NODE_ENV'];
      expect(isAuthDevAutoVerifyRegister()).toBe(true);

      process.env[DEV_AUTO_VERIFY_GATE_ENV] = 'true';
      process.env['NODE_ENV'] = 'production';
      expect(isAuthDevAutoVerifyRegister()).toBe(false);
    });
  });
});
