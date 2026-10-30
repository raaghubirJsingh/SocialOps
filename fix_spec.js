const fs = require('fs');
const filePath = 'C:/SocialOps/apps/api/src/admin/admin-step-up.service.spec.ts';
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Track current describe block
let currentDescribe = '';

for (let i = 0; i < lines.length; i++) {
  // Detect describe blocks
  const describeMatch = lines[i].match(/describe\('([^']+)'/);
  if (describeMatch) {
    currentDescribe = describeMatch[1];
    continue;
  }

  // Fix orphaned ".mock..." lines (lines that start with whitespace + ".")
  // These lost their prisma.xxx.yyy prefix
  const trimmed = lines[i].trim();
  if (trimmed.startsWith('.mock') && !trimmed.startsWith('jest.')) {
    let prefix = '';
    const indent = lines[i].match(/^(\s*)/)[1];
    
    // Determine the correct prisma method based on context
    // Check if it's a .mockImplementation call
    if (trimmed.startsWith('.mockImplementation')) {
      // createSession test - uses prisma.adminStepUpSession.create
      prefix = 'prisma.adminStepUpSession.create';
    }
    // Check if it's a .mockResolvedValue with { count: X } (updateMany)
    else if (trimmed.includes('{ count:')) {
      if (currentDescribe === 'revokeAllSessions' || currentDescribe === 'consumeSession') {
        prefix = 'prisma.adminStepUpSession.updateMany';
      } else if (currentDescribe === 'issueChallenge') {
        prefix = 'prisma.adminStepUpChallenge.updateMany';
      } else {
        prefix = 'prisma.adminStepUpChallenge.updateMany';
      }
    }
    // Check if it's a .mockResolvedValue with a challenge row or null (findUnique/upsert)
    else if (trimmed.startsWith('.mockResolvedValue(') || trimmed.startsWith('.mockResolvedValue(')) {
      // Check what's being passed
      const afterMock = lines[i].substring(lines[i].indexOf('.mockResolvedValue(') + '.mockResolvedValue('.length);
      if (afterMock.includes('count:')) {
        // updateMany
        if (currentDescribe === 'revokeAllSessions' || currentDescribe === 'consumeSession') {
          prefix = 'prisma.adminStepUpSession.updateMany';
        } else {
          prefix = 'prisma.adminStepUpChallenge.updateMany';
        }
      } else if (currentDescribe === 'createSession') {
        prefix = 'prisma.adminStepUpSession.create';
      } else {
        // Default: look at the value being mocked
        // If it's a row from makeChallengeRow() or a challenge object → upsert or findUnique
        // Determine by checking the test context
        if (currentDescribe === 'issueChallenge') {
          prefix = 'prisma.adminStepUpChallenge.upsert';
        } else {
          // verify, resend, resendRemaining → findUnique
          prefix = 'prisma.adminStepUpChallenge.findUnique';
        }
      }
    }
    // Check if it's .mock.calls (issueChallenge calls to assert on upsert)
    else if (trimmed.startsWith('.mock.calls')) {
      prefix = 'prisma.adminStepUpChallenge.upsert';
    }
    
    if (prefix) {
      lines[i] = indent + prefix + trimmed;
    }
  }

  // Fix broken const declarations (lines that are just ";")
  // These were originally "const x = prisma.xxx.yyy as unknown as jest.Mock;"
  const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
  const nextNextLine = i + 2 < lines.length ? lines[i + 2] : '';
  
  if (lines[i].trim() === ';' && (nextLine.includes('findUnique.mock') || nextLine.includes('updateMany.mock'))) {
    const indent = lines[i].match(/^(\s*)/)[1];
    if (nextLine.includes('findUnique.mock')) {
      lines[i] = indent + 'const findUnique = prisma.adminStepUpChallenge.findUnique;';
    } else if (nextLine.includes('updateMany.mock')) {
      lines[i] = indent + 'const updateMany = prisma.adminStepUpChallenge.updateMany;';
    }
  }
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed! Broken .mock lines:');
// Report what we fixed
lines = fs.readFileSync(filePath, 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed.startsWith('.mock') && !trimmed.startsWith('jest.') && !trimmed.startsWith('.mockResolvedValueOnce') && !trimmed.includes('jest.spyOn')) {
    console.log(`  WARNING: line ${i+1} still broken: ${lines[i].trim()}`);
  }
}
console.log('Done.');
