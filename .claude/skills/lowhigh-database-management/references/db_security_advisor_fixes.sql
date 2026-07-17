-- =====================================================================
-- Supabase security-advisor fixes (2026-07-13)
-- Independent of the naming migration. Idempotent; safe to run/re-run.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- (1) function_search_path_mutable  (the ~22 WARN rows)
--     Pin search_path = public on every non-extension function/procedure in
--     public that lacks one. This closes the SECURITY DEFINER search_path hole.
--     Functions reference public objects unqualified, so `public` keeps them
--     working; extension functions (pgvector) are skipped.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind IN ('f', 'p')                       -- functions + procedures (not aggregates/windows)
          AND NOT EXISTS (                                   -- skip extension-owned functions
              SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
          )
          AND (                                              -- only those missing a search_path setting
              p.proconfig IS NULL
              OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- (2) rls_policy_always_true on antisocial_quotes
--     The "Service role can insert quotes" policy is applied to ALL roles with
--     WITH CHECK (true) — so any user could insert. Quotes are written only by
--     the service-role client (which bypasses RLS), so scope the policy to the
--     row owner. Service-role writes keep working (bypass); direct client
--     inserts are now owner-checked.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can insert quotes" ON public.antisocial_quotes;
DROP POLICY IF EXISTS "quotes_insert_own" ON public.antisocial_quotes;
CREATE POLICY "quotes_insert_own" ON public.antisocial_quotes
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

COMMIT;

-- =====================================================================
-- LEFT ALONE ON PURPOSE (not bugs):
--
--  * rls_policy_always_true on gravelens_ai_content_cache / gravelens_cemetery_cache
--    / gravelens_local_history_cache (and other gravelens *_cache tables):
--    these are SHARED community caches with no per-user owner (keyed by
--    geo-cell / osm-id / conflict-key). They are populated client-side by any
--    authenticated user by design; the `true` policy is intentional. Scoping
--    them would break cache population. No change.
--
--  * extension_in_public (vector / pgvector): the pgvector `vector` type is not
--    used by any table column in this project (only core `tsvector` full-text
--    search is used, which is unrelated). Moving the extension is therefore
--    low-risk but still optional and unnecessary. If you want to clear the
--    warning, run the two lines below SEPARATELY and re-test embeddings-related
--    features (there are none currently). Otherwise ignore it.
--
--        -- CREATE SCHEMA IF NOT EXISTS extensions;
--        -- ALTER EXTENSION vector SET SCHEMA extensions;
-- =====================================================================
