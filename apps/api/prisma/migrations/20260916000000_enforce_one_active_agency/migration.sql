-- Enforce ONE ACTIVE Agency invariant at the database level.
-- A partial unique index ensures a clientId can have at most one
-- ACTIVE ClientAgencyRelationship, preventing silent replacement.
CREATE UNIQUE INDEX "ClientAgencyRelationship_one_active_per_client"
ON "ClientAgencyRelationship"("clientId")
WHERE "status" = 'ACTIVE';
