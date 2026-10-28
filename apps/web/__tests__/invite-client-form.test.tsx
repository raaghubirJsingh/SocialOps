/**
 * Invite Client Form Contracts.
 *
 * Asserts the agency-side invitation form source against its backend
 * contract. The form's exported component does not contain the module-level
 * zod schema or its own doc comments in `toString()`, so this reads the raw
 * source with comments stripped and asserts against executable code only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Source with line + block comments removed, so assertions never match prose. */
function formSourceWithoutComments(): string {
  const path = join(__dirname, '..', 'components', 'clients', 'invite-client-form.tsx');
  const raw = readFileSync(path, 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Invite Client Form Contracts', () => {
  it('issues the invitation through the inviteClient API helper', () => {
    const src = formSourceWithoutComments();
    expect(src).toMatch(/inviteClient\(/);
  });

  it('posts to /clients/:id/invite via the client-api helper', () => {
    const path = join(__dirname, '..', 'lib', 'client-api.ts');
    const raw = readFileSync(path, 'utf8');
    expect(raw).toMatch(/inviteClient:/);
    expect(raw).toMatch(/\/clients\/\$\{clientId\}\/invite/);
    expect(raw).toMatch(/method:\s*'POST'/);
  });

  it('uses the saved client email as the read-only recipient (no email input)', () => {
    const src = formSourceWithoutComments();
    // The recipient prop is the Client's saved directEmail...
    expect(src).toMatch(/clientEmail/);
    // ...posted via an EMPTY body (the backend resolves the recipient
    // server-side and its strict schema rejects overrides).
    expect(src).toMatch(/inviteClient\(clientId, \{\}\)/);
    // There is no invitee email input or placeholder left.
    expect(src).not.toMatch(/invitee-email/);
    expect(src).not.toMatch(/owner@example\.com/);
  });

  it('never references a raw invitation token in code', () => {
    const src = formSourceWithoutComments();
    // Comments are stripped above, so any remaining "token" would be live
    // code that displays, logs, or stores the token - which must not exist.
    expect(src).not.toMatch(/token/i);
  });

  it('confirms creation without claiming an email was sent', () => {
    const src = formSourceWithoutComments();
    expect(src).toMatch(/Invitation created for/i);
    expect(src).not.toMatch(/email (has|was) sent/i);
  });
});

