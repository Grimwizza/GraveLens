# LowHigh DB Rename Map (authoritative — built from live schema 2026-07-13)

Source of truth for the big-bang naming migration. Only tables that EXIST in live Supabase are in
the SQL; code-only tables (challenges) are updated in code + pending migration so they are born
correct. Column list shows **only the changes**; unlisted columns keep their names.

Legend: `→` rename · `⇒type` type conversion · `(FK→x)` foreign-key target after rename.

---

## CORE (bare, no prefix)

### goals → **rewards**
- `token_reward` → `token_amount`
- (keep: slug, title, description, category, frequency, redemption, requirement_type,
  requirement_params, is_phase_1, sort_order, is_active, created_at, visible_in_apps)

### user_goal_completions → **reward_claims**
- `goal_id` → `reward_id`  (FK→rewards)
- `goal_frequency` → `reward_frequency`

### user_pins → **saved_items**
- `pinned_at` → `saved_at`
- (keep: item_type, item_id)

### RPC: claim_goal → **claim_reward**  (body references goals/user_goal_completions → rewards/reward_claims)

---

## GRAVELENS (gravelens_ prefix retained)

### gravelens_graves → **gravelens_scans**
- `timestamp` (bigint unix-ms) → `captured_at` ⇒timestamptz  via `to_timestamp(timestamp/1000.0)`
- `id`: **stays TEXT** (app-generated, load-bearing in storage path `{userId}/{graveId}.jpg`)
- (keep: user_id, photo_url, location, extracted, research, tags, user_notes, is_public,
  community_note, synced_at, created_at)

### gravelens_grave_identity_index → **gravelens_scan_identity_index**  (table only; columns clean)

### gravelens_user_profiles  (name kept; grave→scan column alignment)
- `grave_count` → `scan_count`
- `public_grave_count` → `public_scan_count`

### gravelens_*_cache, gravelens_rate_limits, gravelens_user_relationships — names + columns kept.

---

## ANTISOCIAL (antisocial_ prefix; user_/anti_social_ dropped; family stems)

### Feed content
| old | new | column changes |
|-----|-----|----------------|
| factoids | **antisocial_facts** | `factoid_text`→`fact_text` |
| user_factoid_interactions | **antisocial_fact_interactions** | `factoid_id`→`fact_id` (FK→antisocial_facts); `answered_correctly`→`is_correct` |
| media_titles | **antisocial_media_titles** | — |
| user_media_interactions | **antisocial_media_interactions** | `saved`→`is_saved`; `not_interested`→`is_not_interested` (FKs book_id/album_id/podcast_id/media_title_id retarget) |
| books | **antisocial_books** | — |
| albums | **antisocial_albums** | — |
| podcasts | **antisocial_podcasts** | — |
| user_reader_profile | **antisocial_reader_profile** | — |
| user_daily_picks | **antisocial_daily_picks** | `llm_payload`→`recommendation` |
| user_anti_social_views | **antisocial_feed_views** | — (keep config, kind) |
| anti_social_session_bundle | **antisocial_feed_snapshots** | `bundle`→`snapshot` |
| anti_social_quotes | **antisocial_quotes** | — |

### News family (antisocial_news_)
| old | new | column changes |
|-----|-----|----------------|
| news_api_cache | **antisocial_news_cache** | — |
| news_topic_registry | **antisocial_news_topics** | — |
| news_og_image_cache | **antisocial_news_images** | `verified_loadable`→`is_loadable` |

### Language family (antisocial_language_)
| old | new | column changes |
|-----|-----|----------------|
| anti_social_language_profile | **antisocial_language_profiles** | — |
| anti_social_language_track | **antisocial_language_tracks** | `form`→`form_state` |
| anti_social_language_weights | **antisocial_language_weights** | — |
| anti_social_vocab_srs | **antisocial_language_vocab** | — |
| anti_social_explain_cache | **antisocial_language_explanations** | — |
| learning_threads | **antisocial_learning_threads** | — |
| learning_thread_steps | **antisocial_learning_thread_steps** | `factoid_id`→`fact_id` (FK→antisocial_facts) |

### Puzzles (antisocial_puzzle_)
| old | new | column changes |
|-----|-----|----------------|
| anti_social_puzzle_results | **antisocial_puzzle_results** | `correct`→`is_correct`; `close`→`is_close`; `score`→`detail` |
| anti_social_puzzle_stats | **antisocial_puzzle_stats** | `meta`→`detail` |

### Predictions
| old | new | column changes |
|-----|-----|----------------|
| anti_social_predictions | **antisocial_predictions** | `id` text ⇒uuid (cast/backfill). `outcome` KEPT (domain noun, nullable tri-state) |

### Sparks economy (antisocial_spark_ / rewards / inventory / achievements)
| old | new | column changes |
|-----|-----|----------------|
| user_anti_social_currency | **antisocial_spark_balances** | — |
| user_anti_social_transactions | **antisocial_spark_transactions** | — (multiplier kept though deprecated) |
| user_anti_social_inventory | **antisocial_inventory** | `reward_id` FK→antisocial_rewards |
| anti_social_rewards | **antisocial_rewards** | — |
| user_anti_social_achievements | **antisocial_achievements** | — |

### Reflect / routines / challenges
| old | new | column changes |
|-----|-----|----------------|
| user_anti_social_routines | **antisocial_routines** | — (coach_enabled/complexity kept though deprecated) |
| user_anti_social_routine_sessions | **antisocial_routine_sessions** | — |
| user_anti_social_notes | **antisocial_journal_entries** | `ai_generated`→`is_ai_generated`; `routine_id` FK→antisocial_routines |
| user_anti_social_challenges (NOT LIVE) | **antisocial_challenges** | code + pending migration 006 only; `setup`→`interview_answers`; `note_id` refs |

---

## NOT TOUCHED
- Shared core: `topic_news_cache`, `user_settings_for_you`, `user_feed_notifications`,
  `user_installed_apps`, `user_app_opens`, and all billing/blog/brand/email/prompt/social/writing/
  team/support tables.
- Zero-reference orphans (flag for user, do not rename/drop here): `tmdb_titles` (looks like dead
  predecessor of media_titles), `regulations`, `waypoints`, `trips`, `sv_user_badges`,
  `sv_user_stats`.

## Cross-table FK retargets to verify in SQL
- `user_daily_picks`/`user_media_interactions`: `book_id`→antisocial_books, `album_id`→
  antisocial_albums, `podcast_id`→antisocial_podcasts, `media_title_id`→antisocial_media_titles.
- `*_fact_interactions.fact_id` + `learning_thread_steps.fact_id` → antisocial_facts.
- `antisocial_inventory.reward_id` → antisocial_rewards.
- `reward_claims.reward_id` → rewards; `.token_transaction_id` → token_transactions (unchanged).
