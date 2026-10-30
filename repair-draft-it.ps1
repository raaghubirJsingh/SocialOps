$f = 'C:\SocialOps\apps\api\test\draft-from-intake.integration.spec.ts'
$l = Get-Content $f

function Find-Index($arr, $regex) {
  for ($i = 0; $i -lt $arr.Count; $i++) { if ($arr[$i] -match $regex) { return $i } }
  return -1
}

$descI = Find-Index $l "describe\('Decision 022:"
$it1I  = Find-Index $l "it\('rejects a draft from every non-CLIENT_FORM"
$it2I  = Find-Index $l "it\('returns CONTENT_REQUEST_ALREADY_DRAFTED"

$endI = -1
for ($i = $it2I; $i -lt $l.Count; $i++) {
  if ($l[$i] -match '^}\}$') { $endI = $i; break }
}
if ($endI -lt 0) { $endI = $it2I + 3 }
Write-OUTPUT ("descI=$descI it1I=$it1I it2I=$it2I endI=$endI")

$block = @'
describe('Decision 022: source-type gating and uniqueness-conflict fallback', () => {
  it('rejects a draft from every non-CLIENT_FORM raw-data source (404)', async () => {
    const org = await seedOrgUser('src-gate', 'ADMIN');
    const client = await onboardedClient('src-gate-client');
    for (const source of ['CLIENT_UPLOAD', 'AGENCY_UPLOAD', 'EXTERNAL_IMPORT'] as const) {
      const request = await prisma.rawData.create({
        data: {
          source,
          clientId: client.clientId,
          extractedText: `${source.toLowerCase().replace(/_/g, ' ')} payload`,
          contentHash: createHash('sha256').update(source + client.clientId).digest('hex'),
        },
      });
      expect(request).not.toBeNull();
      const res = await http
        .post(`/api/clients/${client.clientId}/content`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .set('X-Organization-Id', org.orgId)
        .send({ sourceRequestId: request.id });
      // Decision 022 part 1: only CLIENT_FORM requests become drafts.
      expect(res.status).toBe(404);
    }
  });

  it('returns CONTENT_REQUEST_ALREADY_DRAFTED when the draft index conflicts (P2002 fallback)', async () => {
    const org = await seedOrgUser('src-confl', 'ADMIN');
    const client = await onboardedClient('src-confl-client');
    const request = await prisma.rawData.create({
      data: {
        source: 'CLIENT_FORM',
        clientId: client.clientId,
        extractedText: 'conflicting drafts',
        contentHash: createHash('sha256').update('CLIENT_FORM' + client.clientId).digest('hex'),
      },
    });
    // Both calls enter the service's single $transaction. Each pre-check
    // misses (nothing committed yet), then both attempt the unique draft
    // insert: one wins, the other hits the P2002 unique-index violation, which
    // is mapped to the app-level conflict code.
    const [resolved, conflicting] = await Promise.all([
      http
        .post(`/api/clients/${client.clientId}/content`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .set('X-Organization-Id', org.orgId)
        .send({ sourceRequestId: request.id, title: 'A', body: 'A' }),
      http
        .post(`/api/clients/${client.clientId}/content`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .set('X-Organization-Id', org.orgId)
        .send({ sourceRequestId: request.id, title: 'B', body: 'B' }),
    ]);
    expect(resolved.status).toBe(201);
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('CONTENT_REQUEST_ALREADY_DRAFTED');
  });
});

'@

$items = $block.Split([Environment]::NewLine, [StringSplitOptions]::RemoveEmptyEntries)
for ($i = 0; $i -lt $items.Count; $i++) { $l[$descI + $i] = $items[$i] }
for ($i = $items.Count; $i -lt ($endI - $descI + 1); $i++) { $l[$descI + $i] = $null }
$l = $l | Where-Object { $_ -ne $null }
Set-Content -LiteralPath $f -Value ($l -join "`n")
Write-OUTPUT 'repaired'
