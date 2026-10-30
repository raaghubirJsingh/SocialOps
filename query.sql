-- Query for bot users
SELECT id, email, "fullName", "isBot", "skillSpecialization", "isActive" 
FROM "User" 
WHERE "isBot" = true;

-- Query for bot memberships
SELECT m.id, m."userId", m."organizationId", u.email, o.name as org_name
FROM "OrganizationMembership" m
JOIN "User" u ON m."userId" = u.id
JOIN "Organization" o ON m."organizationId" = o.id
WHERE u."isBot" = true;

-- Query for all clients
SELECT id, name, type, status, "onboardingStatus", "ownerUserId" 
FROM "Client";

-- Query for all users
SELECT id, email, "fullName", "isBot", "isActive", "accountType" 
FROM "User"
ORDER BY "createdAt";

-- Query for organizations
SELECT id, name, slug, kind 
FROM "Organization";