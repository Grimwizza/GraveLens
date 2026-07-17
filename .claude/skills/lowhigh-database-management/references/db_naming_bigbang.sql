-- =====================================================================
-- LowHigh naming-convention big-bang migration  (2026-07-13, rev 2 — IDEMPOTENT)
-- ONE shared Supabase project. Run as a single transaction.
--
-- SAFE TO RE-RUN: every step is guarded and skips if already applied. So this
-- works whether or not an earlier version of this file was already run. If a
-- prior run already renamed the tables/columns, this pass only applies the
-- newly-added bits (the two internal RPC renames in rev 2) and no-ops the rest.
--
-- rev 2 adds: increment_factoid_counter -> increment_fact_counter,
--             gravelens_upsert_grave_identity -> gravelens_upsert_scan_identity.
--
-- DELIBERATELY NOT TOUCHED:
--   * v_* are VIEWS (v_ = view convention). Renaming would collide with the
--     base tables they derive from (e.g. v_token_balances vs token_balances).
--   * sv_* tables (sv_user_badges, sv_user_stats) have zero references in any
--     LowHigh app or migration — unknown owner (likely another app on this
--     shared project). Not renamed/dropped blindly.
--   * Orphans with no code refs: tmdb_titles, regulations, waypoints, trips,
--     api_usage_log_grouping_backup (a leftover backup table).
--
-- Deploy all app code in lockstep AFTER running this.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PART 1 — TABLE RENAMES  (IF EXISTS => skip if already renamed)
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS goals                 RENAME TO rewards;
ALTER TABLE IF EXISTS user_goal_completions RENAME TO reward_claims;
ALTER TABLE IF EXISTS user_pins             RENAME TO saved_items;

ALTER TABLE IF EXISTS gravelens_graves               RENAME TO gravelens_scans;
ALTER TABLE IF EXISTS gravelens_grave_identity_index RENAME TO gravelens_scan_identity_index;

ALTER TABLE IF EXISTS factoids                   RENAME TO antisocial_facts;
ALTER TABLE IF EXISTS user_factoid_interactions  RENAME TO antisocial_fact_interactions;
ALTER TABLE IF EXISTS media_titles               RENAME TO antisocial_media_titles;
ALTER TABLE IF EXISTS user_media_interactions    RENAME TO antisocial_media_interactions;
ALTER TABLE IF EXISTS books                      RENAME TO antisocial_books;
ALTER TABLE IF EXISTS albums                     RENAME TO antisocial_albums;
ALTER TABLE IF EXISTS podcasts                   RENAME TO antisocial_podcasts;
ALTER TABLE IF EXISTS user_reader_profile        RENAME TO antisocial_reader_profile;
ALTER TABLE IF EXISTS user_daily_picks           RENAME TO antisocial_daily_picks;
ALTER TABLE IF EXISTS user_anti_social_views     RENAME TO antisocial_feed_views;
ALTER TABLE IF EXISTS anti_social_session_bundle RENAME TO antisocial_feed_snapshots;
ALTER TABLE IF EXISTS anti_social_quotes         RENAME TO antisocial_quotes;

ALTER TABLE IF EXISTS news_api_cache      RENAME TO antisocial_news_cache;
ALTER TABLE IF EXISTS news_topic_registry RENAME TO antisocial_news_topics;
ALTER TABLE IF EXISTS news_og_image_cache RENAME TO antisocial_news_images;

ALTER TABLE IF EXISTS anti_social_language_profile RENAME TO antisocial_language_profiles;
ALTER TABLE IF EXISTS anti_social_language_track   RENAME TO antisocial_language_tracks;
ALTER TABLE IF EXISTS anti_social_language_weights RENAME TO antisocial_language_weights;
ALTER TABLE IF EXISTS anti_social_vocab_srs        RENAME TO antisocial_language_vocab;
ALTER TABLE IF EXISTS anti_social_explain_cache    RENAME TO antisocial_language_explanations;
ALTER TABLE IF EXISTS learning_threads             RENAME TO antisocial_learning_threads;
ALTER TABLE IF EXISTS learning_thread_steps        RENAME TO antisocial_learning_thread_steps;

ALTER TABLE IF EXISTS anti_social_puzzle_results RENAME TO antisocial_puzzle_results;
ALTER TABLE IF EXISTS anti_social_puzzle_stats   RENAME TO antisocial_puzzle_stats;

ALTER TABLE IF EXISTS anti_social_predictions RENAME TO antisocial_predictions;

ALTER TABLE IF EXISTS user_anti_social_currency     RENAME TO antisocial_spark_balances;
ALTER TABLE IF EXISTS user_anti_social_transactions RENAME TO antisocial_spark_transactions;
ALTER TABLE IF EXISTS user_anti_social_inventory    RENAME TO antisocial_inventory;
ALTER TABLE IF EXISTS anti_social_rewards           RENAME TO antisocial_rewards;
ALTER TABLE IF EXISTS user_anti_social_achievements RENAME TO antisocial_achievements;

ALTER TABLE IF EXISTS user_anti_social_routines         RENAME TO antisocial_routines;
ALTER TABLE IF EXISTS user_anti_social_routine_sessions RENAME TO antisocial_routine_sessions;
ALTER TABLE IF EXISTS user_anti_social_notes            RENAME TO antisocial_journal_entries;

-- ---------------------------------------------------------------------
-- PART 2 — COLUMN RENAMES  (each guarded: rename only if the old column exists)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rewards' AND column_name='token_reward')
        THEN ALTER TABLE rewards RENAME COLUMN token_reward TO token_amount; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reward_claims' AND column_name='goal_id')
        THEN ALTER TABLE reward_claims RENAME COLUMN goal_id TO reward_id; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reward_claims' AND column_name='goal_frequency')
        THEN ALTER TABLE reward_claims RENAME COLUMN goal_frequency TO reward_frequency; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_items' AND column_name='pinned_at')
        THEN ALTER TABLE saved_items RENAME COLUMN pinned_at TO saved_at; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gravelens_user_profiles' AND column_name='grave_count')
        THEN ALTER TABLE gravelens_user_profiles RENAME COLUMN grave_count TO scan_count; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gravelens_user_profiles' AND column_name='public_grave_count')
        THEN ALTER TABLE gravelens_user_profiles RENAME COLUMN public_grave_count TO public_scan_count; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_fact_interactions' AND column_name='answered_correctly')
        THEN ALTER TABLE antisocial_fact_interactions RENAME COLUMN answered_correctly TO is_correct; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_fact_interactions' AND column_name='factoid_id')
        THEN ALTER TABLE antisocial_fact_interactions RENAME COLUMN factoid_id TO fact_id; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_media_interactions' AND column_name='saved')
        THEN ALTER TABLE antisocial_media_interactions RENAME COLUMN saved TO is_saved; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_media_interactions' AND column_name='not_interested')
        THEN ALTER TABLE antisocial_media_interactions RENAME COLUMN not_interested TO is_not_interested; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_puzzle_results' AND column_name='correct')
        THEN ALTER TABLE antisocial_puzzle_results RENAME COLUMN correct TO is_correct; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_puzzle_results' AND column_name='close')
        THEN ALTER TABLE antisocial_puzzle_results RENAME COLUMN close TO is_close; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_puzzle_results' AND column_name='score')
        THEN ALTER TABLE antisocial_puzzle_results RENAME COLUMN score TO detail; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_puzzle_stats' AND column_name='meta')
        THEN ALTER TABLE antisocial_puzzle_stats RENAME COLUMN meta TO detail; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_news_images' AND column_name='verified_loadable')
        THEN ALTER TABLE antisocial_news_images RENAME COLUMN verified_loadable TO is_loadable; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_journal_entries' AND column_name='ai_generated')
        THEN ALTER TABLE antisocial_journal_entries RENAME COLUMN ai_generated TO is_ai_generated; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_facts' AND column_name='factoid_text')
        THEN ALTER TABLE antisocial_facts RENAME COLUMN factoid_text TO fact_text; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_learning_thread_steps' AND column_name='factoid_id')
        THEN ALTER TABLE antisocial_learning_thread_steps RENAME COLUMN factoid_id TO fact_id; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_daily_picks' AND column_name='llm_payload')
        THEN ALTER TABLE antisocial_daily_picks RENAME COLUMN llm_payload TO recommendation; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_feed_snapshots' AND column_name='bundle')
        THEN ALTER TABLE antisocial_feed_snapshots RENAME COLUMN bundle TO snapshot; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_language_tracks' AND column_name='form')
        THEN ALTER TABLE antisocial_language_tracks RENAME COLUMN form TO form_state; END IF;
END $$;

-- ---------------------------------------------------------------------
-- PART 3 — TYPE CONVERSIONS  (guarded by current data_type; data-preserving)
-- ---------------------------------------------------------------------
-- gravelens_scans.timestamp (bigint unix-ms) -> captured_at (timestamptz)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gravelens_scans' AND column_name='timestamp')
        THEN ALTER TABLE gravelens_scans RENAME COLUMN "timestamp" TO captured_at; END IF;

    IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='gravelens_scans' AND column_name='captured_at') = 'bigint'
        THEN ALTER TABLE gravelens_scans ALTER COLUMN captured_at TYPE timestamptz USING to_timestamp(captured_at / 1000.0); END IF;
END $$;

-- antisocial_predictions.id (text) -> uuid (keep valid uuids, regenerate the rest; no child FKs)
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='antisocial_predictions' AND column_name='id') = 'text'
    THEN
        ALTER TABLE antisocial_predictions
          ALTER COLUMN id TYPE uuid
          USING (CASE
                   WHEN id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                     THEN id::uuid
                   ELSE gen_random_uuid()
                 END);
        ALTER TABLE antisocial_predictions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
END $$;

-- gravelens_scans.id stays TEXT (app-generated, load-bearing in storage path {userId}/{scanId}.jpg).

-- ---------------------------------------------------------------------
-- PART 4 — AUTO-FOLLOWED OBJECTS
-- ---------------------------------------------------------------------
-- FKs, indexes, RLS policies, CHECK constraints, and views auto-follow the
-- renames above. Their embedded object names may still contain the old string
-- (cosmetic only, no behavior impact). Not renamed here.

-- ---------------------------------------------------------------------
-- PART 5 — FUNCTION REBUILDS  (CREATE OR REPLACE + DROP IF EXISTS = idempotent)
-- ---------------------------------------------------------------------

-- (5.1) claim_goal -> claim_reward
CREATE OR REPLACE FUNCTION claim_reward(
    p_user_id        UUID,
    p_reward_id      UUID,
    p_tokens         BIGINT,
    p_frequency      TEXT,
    p_description    TEXT
) RETURNS TABLE (transaction_id UUID, new_available_tokens BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx_id          UUID;
    v_new_available  BIGINT;
BEGIN
    INSERT INTO token_balances (user_id, allocated_tokens, purchased_tokens, rollover_tokens, used_tokens)
    VALUES (p_user_id, 0, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    PERFORM 1 FROM token_balances WHERE user_id = p_user_id FOR UPDATE;

    IF p_frequency = 'once_per_month' THEN
        IF EXISTS (
            SELECT 1 FROM reward_claims
            WHERE user_id = p_user_id AND reward_id = p_reward_id
              AND reward_frequency = 'once_per_month'
              AND date_trunc('month', claimed_at) = date_trunc('month', NOW())
        ) THEN
            RAISE unique_violation USING MESSAGE = 'reward already claimed this month';
        END IF;
    ELSIF p_frequency = 'once_per_year' THEN
        IF EXISTS (
            SELECT 1 FROM reward_claims
            WHERE user_id = p_user_id AND reward_id = p_reward_id
              AND reward_frequency = 'once_per_year'
              AND date_trunc('year', claimed_at) = date_trunc('year', NOW())
        ) THEN
            RAISE unique_violation USING MESSAGE = 'reward already claimed this year';
        END IF;
    END IF;

    INSERT INTO reward_claims (user_id, reward_id, reward_frequency, tokens_granted)
    VALUES (p_user_id, p_reward_id, p_frequency, p_tokens);

    UPDATE token_balances
    SET purchased_tokens = purchased_tokens + p_tokens, updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING (allocated_tokens + purchased_tokens + rollover_tokens - used_tokens)
        INTO v_new_available;

    INSERT INTO token_transactions (user_id, type, amount, balance_after, description)
    VALUES (p_user_id, 'bonus', p_tokens, v_new_available, p_description)
    RETURNING id INTO v_tx_id;

    UPDATE reward_claims
    SET token_transaction_id = v_tx_id
    WHERE user_id = p_user_id AND reward_id = p_reward_id AND token_transaction_id IS NULL
      AND id = (
          SELECT id FROM reward_claims
          WHERE user_id = p_user_id AND reward_id = p_reward_id
          ORDER BY claimed_at DESC LIMIT 1
      );

    RETURN QUERY SELECT v_tx_id, v_new_available;
END
$$;
GRANT EXECUTE ON FUNCTION claim_reward(UUID, UUID, BIGINT, TEXT, TEXT) TO authenticated, service_role;

-- (5.2) complete_referral  (goals -> rewards; token_reward -> token_amount; calls claim_reward)
CREATE OR REPLACE FUNCTION complete_referral(p_referred_user_id UUID)
RETURNS TABLE (referrer_user_id UUID, bonus_tokens BIGINT, goal_slug TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rr_id        UUID;
    v_referrer     UUID;
    v_tier_level   INT;
    v_goal_slug    TEXT;
    v_goal_id      UUID;
    v_bonus        BIGINT;
    v_first_name   TEXT;
    v_plan_name    TEXT;
BEGIN
    SELECT id, referrer_user_id INTO v_rr_id, v_referrer
    FROM referral_rewards
    WHERE referred_user_id = p_referred_user_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN RETURN; END IF;

    SELECT sp.tier_level, sp.name INTO v_tier_level, v_plan_name
    FROM user_subscriptions us
    JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = p_referred_user_id
      AND us.status IN ('active', 'trialing', 'lifetime')
    LIMIT 1;

    IF v_tier_level IS NULL THEN RETURN; END IF;

    v_goal_slug := CASE v_tier_level
        WHEN 1 THEN 'spread_the_word'
        WHEN 2 THEN 'share_the_joy'
        WHEN 3 THEN 'lead_the_pack'
        ELSE NULL
    END;

    IF v_goal_slug IS NULL THEN RETURN; END IF;

    SELECT id, token_amount INTO v_goal_id, v_bonus
    FROM rewards WHERE slug = v_goal_slug;

    IF v_goal_id IS NULL THEN
        RAISE EXCEPTION 'complete_referral: reward slug % not found', v_goal_slug;
    END IF;

    SELECT COALESCE(
        NULLIF(raw_user_meta_data->>'first_name', ''),
        NULLIF(raw_user_meta_data->>'display_name', ''),
        split_part(email, '@', 1)
    ) INTO v_first_name
    FROM auth.users WHERE id = p_referred_user_id;

    PERFORM claim_reward(
        v_referrer, v_goal_id, v_bonus, 'once_per_referral',
        format('referral:%s:%s', v_goal_slug, v_first_name)
    );

    UPDATE referral_rewards
    SET status = 'paid', tier_level = v_tier_level, goal_slug = v_goal_slug,
        bonus_tokens = v_bonus, referred_first_name = v_first_name, paid_at = NOW()
    WHERE id = v_rr_id;

    RETURN QUERY SELECT v_referrer, v_bonus, v_goal_slug;
END
$$;
REVOKE ALL ON FUNCTION complete_referral(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_referral(UUID) TO service_role;

-- (5.3) user_monthly_loyalty_tokens  (user_goal_completions -> reward_claims; goals -> rewards)
CREATE OR REPLACE FUNCTION user_monthly_loyalty_tokens(p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH current_tier AS (
        SELECT sp.tier_level
        FROM user_subscriptions us
        JOIN subscription_plans sp ON sp.id = us.plan_id
        WHERE us.user_id = p_user_id
          AND us.status IN ('active', 'trialing', 'lifetime')
        LIMIT 1
    )
    SELECT COALESCE(SUM(g.token_amount), 0)::BIGINT
    FROM reward_claims ugc
    JOIN rewards g ON g.id = ugc.reward_id
    CROSS JOIN current_tier ct
    WHERE ugc.user_id = p_user_id
      AND g.category = 'loyalty'
      AND ct.tier_level >= COALESCE((g.requirement_params->>'min_tier_level')::INT, 1);
$$;
REVOKE ALL ON FUNCTION user_monthly_loyalty_tokens(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_monthly_loyalty_tokens(UUID) TO authenticated, service_role;

-- (5.4) increment_factoid_counter -> increment_fact_counter  (factoids -> antisocial_facts)
CREATE OR REPLACE FUNCTION increment_fact_counter(
    p_fact_id UUID,
    p_column  TEXT,
    p_delta   INT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_column = 'impressions_count' THEN
        UPDATE antisocial_facts SET impressions_count = GREATEST(0, impressions_count + p_delta) WHERE id = p_fact_id;
    ELSIF p_column = 'likes_count' THEN
        UPDATE antisocial_facts SET likes_count = GREATEST(0, likes_count + p_delta) WHERE id = p_fact_id;
    ELSIF p_column = 'dislikes_count' THEN
        UPDATE antisocial_facts SET dislikes_count = GREATEST(0, dislikes_count + p_delta) WHERE id = p_fact_id;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_fact_counter(UUID, TEXT, INT) TO authenticated, service_role;

-- (5.5) gravelens_upsert_grave_identity -> gravelens_upsert_scan_identity
CREATE OR REPLACE FUNCTION public.gravelens_upsert_scan_identity(hash text, snapshot jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING errcode = 'insufficient_privilege';
  END IF;

  INSERT INTO public.gravelens_scan_identity_index
    (identity_hash, research_snapshot, contributor_count, confirmed_at, expires_at)
  VALUES (hash, snapshot, 1, now(), now() + interval '365 days')
  ON CONFLICT (identity_hash) DO UPDATE
    SET
      contributor_count = public.gravelens_scan_identity_index.contributor_count + 1,
      confirmed_at = now(),
      research_snapshot = CASE
        WHEN public.gravelens_scan_identity_index.expires_at < now()
          OR COALESCE((excluded.research_snapshot->>'researchVersion')::int, 0)
             > COALESCE((public.gravelens_scan_identity_index.research_snapshot->>'researchVersion')::int, 0)
        THEN excluded.research_snapshot
        ELSE public.gravelens_scan_identity_index.research_snapshot
      END,
      expires_at = CASE
        WHEN public.gravelens_scan_identity_index.expires_at < now()
          OR COALESCE((excluded.research_snapshot->>'researchVersion')::int, 0)
             > COALESCE((public.gravelens_scan_identity_index.research_snapshot->>'researchVersion')::int, 0)
        THEN now() + interval '365 days'
        ELSE public.gravelens_scan_identity_index.expires_at
      END;
END;
$$;

-- (5.6) Drop the superseded old-named functions (idempotent).
DROP FUNCTION IF EXISTS increment_factoid_counter(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.gravelens_upsert_grave_identity(text, jsonb);
DROP FUNCTION IF EXISTS claim_goal(UUID, UUID, BIGINT, TEXT, TEXT);

COMMIT;
