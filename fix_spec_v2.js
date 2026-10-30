const fs = require('fs');
const filePath = 'C:/SocialOps/apps/api/src/admin/admin-step-up.service.spec.ts';
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Helper to replace a specific line
function setLine(num, content) {
  // num is 1-based
  lines[num - 1] = content;
}

// === Fix 1: resend tests - .mockResolvedValue( should be upsert, not findUnique ===
// Line 309: in "seeds a new challenge" test
setLine(309, lines[309-1].replace('findUnique.mockResolvedValue', 'upsert.mockResolvedValue'));
// Line 365: in "reserves slot atomically" test
setLine(365, lines[365-1].replace('findUnique.mockResolvedValue', 'upsert.mockResolvedValue'));
// Line 388: in "does not refund reservation" test
setLine(388, lines[388-1].replace('findUnique.mockResolvedValue', 'upsert.mockResolvedValue'));

// === Fix 2: validateSession tests - should be adminStepUpSession.findUnique ===
// Lines 463, 471, 486(->487), 498, 509
setLine(463, lines[463-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));
setLine(471, lines[471-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));
setLine(487, lines[487-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));
setLine(498, lines[498-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));
setLine(509, lines[509-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));

// === Fix 3: consumeSession tests - should be adminStepUpSession.findUnique ===
// Lines 523, 535, 548, 560
setLine(523, lines[523-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));
setLine(535, lines[535-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));
setLine(548, lines[548-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));
setLine(560, lines[560-1].replace('adminStepUpChallenge.findUnique', 'adminStepUpSession.findUnique'));

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed all upsert/session references by line number.');
