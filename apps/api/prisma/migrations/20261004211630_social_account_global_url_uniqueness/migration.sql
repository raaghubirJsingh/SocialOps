-- Global uniqueness of SocialAccount.profileUrl (approved decision).
--
-- One canonical URL key per Social Account, across ALL Clients and ALL
-- Service Providers/Organizations. The key is stored in the new internal
-- column "normalizedUrl" and carries a GLOBAL unique index; "profileUrl"
-- itself keeps the human-entered value and is never rewritten here.
--
-- The backfill below mirrors src/social-accounts/lib/profile-url-normalization.ts
-- (normalizeProfileUrl) RULE BY RULE, and the parity integration test
-- (test/social-account-url-normalization-parity.integration.spec.ts) runs this
-- exact expression against a shared fixture list so a divergence between
-- TypeScript and PostgreSQL is a test failure rather than a silent duplicate.
--
-- Rules mirrored (in order):
--   1. trim with an EXPLICIT whitespace set (never bare btrim());
--   2. drop the scheme            ^https?://
--   3. drop ONE leading host      ^(www\.|m\.|mobile\.)   <- dots are LITERAL
--   4. drop the fragment          #[\s\S]*$
--   5. drop the query string, EXCEPT for profile.php where ONLY the first
--      non-empty `id` parameter is kept and re-emitted as `?id=<value>`;
--      no usable id => bare `/profile.php` path
--   6. strip trailing slashes     /+$
--   7. lower() the whole key
--   8. NULLIF(..., '')            empty is never ''
--
-- Every regexp_replace carries the 'i' flag to match the JavaScript /i flag.
--
-- Every pattern that means "anything up to the end" is spelled [\s\S]* rather
-- than the terser .*, so the intent is EXPLICIT and identical to the
-- TypeScript [\s\S]*. PostgreSQL's ARE default mode happens to be newline-
-- sensitive (so .* already spans a newline), but that is a mode, not a
-- guarantee: adding the 'n' flag would silently change .* behaviour, while
-- [\s\S]* matches a newline in BOTH modes.
--
-- ORDERING IS LOAD-BEARING: the column must exist before it is backfilled, and
-- the guard must run after the backfill but BEFORE the index, so it can inspect
-- the real canonical keys.
-- ---------------------------------------------------------------------------

-- 1. Add the column.
--
-- Nullable and unindexed at this point: no existing row is constrained until
-- the guard at step 3 has proved there are no duplicates. NULL is the correct
-- value for a URL-less row, and PostgreSQL treats NULLs as distinct, so those
-- rows never collide with each other or with any real URL.
ALTER TABLE "SocialAccount" ADD COLUMN "normalizedUrl" TEXT;

-- 2. Backfill the canonical key.
--
-- The pipeline is a SELECT subquery built from chained CROSS JOIN LATERAL steps,
-- one per rule above, and is applied with UPDATE ... FROM. The UPDATE TARGET is
-- referenced ONLY in the outer UPDATE ... WHERE clause - never inside a LATERAL -
-- so each step reads a single, stable "value in flight" column rather than
-- re-reading the table.
UPDATE "SocialAccount" AS sa
   SET "normalizedUrl" = k.key
  FROM (
        SELECT base."id", fin.key
          FROM (
                -- The row set to canonicalise. Rows with no profileUrl are
                -- excluded: they have no URL, so their key stays NULL.
                SELECT sa2."id", sa2."profileUrl"
                  FROM "SocialAccount" AS sa2
                 WHERE sa2."profileUrl" IS NOT NULL
               ) AS base
          -- 1. trim with an EXPLICIT whitespace set. NULLIF(...,'') makes a
          --    whitespace-only value NULL ("no URL"), never an empty key.
          CROSS JOIN LATERAL (
                SELECT NULLIF(btrim(base."profileUrl", E' \t\r\n\f\v'), '') AS v
               ) AS s1
          -- 2. drop the scheme.
          CROSS JOIN LATERAL (
                SELECT regexp_replace(s1.v, '^https?://', '', 'i') AS v
               ) AS s2
          -- 3. drop ONE leading host prefix. The dots are escaped on purpose:
          --    an unescaped `.` would also eat medium.com / meta.com.
          CROSS JOIN LATERAL (
                SELECT regexp_replace(s2.v, '^(www\.|m\.|mobile\.)', '', 'i') AS v
               ) AS s3
          -- 4. drop the fragment.
          CROSS JOIN LATERAL (
                SELECT regexp_replace(s3.v, '#[\s\S]*$', '', 'i') AS v
               ) AS s4
          -- 5. query handling. On profile.php the path is PRESERVED and only a
          --    non-empty `id` parameter survives; everywhere else everything
          --    from the first '?' is dropped.
          --
          --    The PREFIX is obtained by deleting the matched tail outright
          --    (regexp_replace with '' ), which keeps the host and needs no
          --    positional arithmetic. The QUERY is obtained by deleting
          --    everything UP TO AND INCLUDING the path
          --    (regexp_replace(s4.v, '^[\s\S]*/profile\.php', '', 'i')), which - unlike
          --    substring(x FROM ...), which is always case-SENSITIVE - honours
          --    the 'i' flag and so also matches `FACEBOOK.COM/Profile.php?ID=1`.
          --    substr(q, 2) strips the leading '?' to give the raw query, split
          --    on '&' exactly like the TypeScript helper. substr(pair,
          --    strpos(pair,'=') + 1) takes everything after the FIRST '=' so
          --    `id=1=2` behaves like the JavaScript slice(eq + 1) rather than
          --    split_part's second field.
          --
          --    The test uses `~*` (case-INsensitive); a plain `~` would miss
          --    `FACEBOOK.COM/Profile.php?ID=1` and silently drop its id.
          CROSS JOIN LATERAL (
                SELECT CASE
                         WHEN s4.v ~* '/profile\.php(\?[\s\S]*)?$' THEN
                              regexp_replace(s4.v, '/profile\.php(\?[\s\S]*)?$', '', 'i')
                              || '/profile.php'
                              || COALESCE((
                                   SELECT '?id=' || btrim(
                                              substr(t.pair, strpos(t.pair, '=') + 1),
                                              E' \t\r\n\f\v')
                                     FROM unnest(string_to_array(
                                              substr(regexp_replace(s4.v, '^[\s\S]*/profile\.php', '', 'i'), 2),
                                              '&')) WITH ORDINALITY AS t(pair, ord)
                                    WHERE strpos(t.pair, '=') > 0
                                      AND lower(btrim(substr(t.pair, 1, strpos(t.pair, '=') - 1),
                                                      E' \t\r\n\f\v')) = 'id'
                                      AND btrim(substr(t.pair, strpos(t.pair, '=') + 1),
                                                E' \t\r\n\f\v') <> ''
                                    ORDER BY t.ord
                                    LIMIT 1
                                 ), '')
                         ELSE regexp_replace(s4.v, '\?[\s\S]*$', '', 'i')
                       END AS v
               ) AS s5
          -- 6. strip trailing slashes.
          CROSS JOIN LATERAL (
                SELECT regexp_replace(s5.v, '/+$', '') AS v
               ) AS s6
          -- 7. lowercase the whole key.
          CROSS JOIN LATERAL (
                SELECT lower(s6.v) AS v
               ) AS s7
          -- 8. empty is never a key.
          CROSS JOIN LATERAL (
                SELECT NULLIF(s7.v, '') AS key
               ) AS fin
       ) AS k
 WHERE sa."id" = k."id";

-- 3. Duplicate guard.
--
-- Runs AFTER the backfill so it inspects the REAL canonical keys, and BEFORE
-- the index so a duplicate produces this readable, actionable error instead of
-- an opaque "duplicate key value violates unique constraint".
--
-- The aggregation is a SUBQUERY (group + HAVING) with a SINGLE outer aggregate,
-- so there are no nested aggregates. Without this guard the CREATE UNIQUE INDEX
-- below would fail on a raw catalog error naming an internal constraint only.
DO $$
DECLARE
    dup_keys TEXT;
BEGIN
    SELECT string_agg(d."normalizedUrl", E'\n    ' ORDER BY d."normalizedUrl")
      INTO dup_keys
      FROM (
            SELECT "normalizedUrl"
              FROM "SocialAccount"
             WHERE "normalizedUrl" IS NOT NULL
             GROUP BY "normalizedUrl"
            HAVING COUNT(*) > 1
           ) AS d;

    IF dup_keys IS NOT NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Cannot create "SocialAccount_normalizedUrl_key": duplicate normalizedUrl values exist.',
            DETAIL  = 'The following canonical URL key(s) are held by more than one SocialAccount row:'
                      || E'\n    ' || dup_keys,
            HINT    = 'Inspect "SocialAccount"."profileUrl" for these keys, keep one row per profile, '
                      'then re-run this migration.';
    END IF;
END $$;

-- 4. Create the global unique index.
--
-- Only now, after the guard has proved the data is clean. NULLs are distinct in
-- PostgreSQL, so every URL-less row is exempt by construction.
CREATE UNIQUE INDEX "SocialAccount_normalizedUrl_key" ON "SocialAccount"("normalizedUrl");

-- ---------------------------------------------------------------------------
-- Explicitly NOT done, and why:
--
--   * Any UPDATE of "profileUrl"
--     The stored column keeps the human-entered value; only the derived key is
--     rewritten here.
--
--   * Any DELETE of a duplicate row
--     This migration NEVER removes data. It refuses to proceed when duplicates
--     exist and leaves the choice of which row to keep to a human.
--
--   * A UNIQUE constraint instead of a UNIQUE INDEX
--     `@unique` on a nullable column is implemented by PostgreSQL as exactly
--     this unique index; the name matches Prisma's convention.
-- ---------------------------------------------------------------------------

