-- Private identity-level trial grants survive account deletion. The runtime
-- cannot list, change or delete records through the public table API.
CREATE SCHEMA IF NOT EXISTS metardu_trial;
REVOKE ALL ON SCHEMA metardu_trial FROM PUBLIC, authenticated;

CREATE TABLE IF NOT EXISTS metardu_trial.grants (
  identity_key bytea PRIMARY KEY,
  granted_at timestamptz NOT NULL,
  export_day date,
  export_count integer NOT NULL DEFAULT 0 CHECK (export_count >= 0)
);
REVOKE ALL ON TABLE metardu_trial.grants FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION metardu_trial.identity_key(address text)
RETURNS bytea
LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $$
  WITH normalized AS (SELECT lower(btrim(address)) AS email)
  SELECT sha256(convert_to(
    CASE WHEN split_part(email, '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(email, '@', 1), '+', 1), '.', '') || '@gmail.com'
      ELSE email END,
    'UTF8'))
  FROM normalized;
$$;
REVOKE ALL ON FUNCTION metardu_trial.identity_key(text) FROM PUBLIC, authenticated;

-- Keep expiry on every existing subscription. Reserve historical identities
-- where the subscription still carries evidence of a prior trial.
INSERT INTO metardu_trial.grants(identity_key, granted_at)
SELECT metardu_trial.identity_key(u.email), min(s.trial_ends_at - interval '336 hours')
FROM public.user_subscriptions s
JOIN public.users u ON u.id = s.user_id
WHERE s.trial_ends_at IS NOT NULL AND u.email_verified IS TRUE
GROUP BY metardu_trial.identity_key(u.email)
ON CONFLICT (identity_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.metardu_activate_verified_trial()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := nullif(current_setting('request.user_id', true), '')::uuid;
  trial_key bytea;
  started_at timestamptz := clock_timestamp();
  prior_expiry timestamptz;
  ends_at timestamptz;
BEGIN
  SELECT metardu_trial.identity_key(email) INTO trial_key
  FROM public.users WHERE id = actor AND email_verified IS TRUE FOR UPDATE;

  IF trial_key IS NULL THEN RETURN NULL; END IF;
  SELECT trial_ends_at INTO prior_expiry FROM public.user_subscriptions WHERE user_id = actor;
  IF FOUND THEN
    IF prior_expiry IS NOT NULL THEN
      INSERT INTO metardu_trial.grants(identity_key, granted_at)
      VALUES (trial_key, prior_expiry - interval '336 hours') ON CONFLICT (identity_key) DO NOTHING;
    END IF;
    RETURN NULL;
  END IF;

  INSERT INTO metardu_trial.grants(identity_key, granted_at) VALUES (trial_key, started_at)
  ON CONFLICT (identity_key) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.user_subscriptions(user_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
  VALUES (actor, 'pro', 'trial', started_at + interval '336 hours', started_at, started_at + interval '336 hours')
  ON CONFLICT (user_id) DO NOTHING
  RETURNING trial_ends_at INTO ends_at;

  -- A concurrent purchase may have claimed the subscription row first.
  IF ends_at IS NULL THEN
    DELETE FROM metardu_trial.grants WHERE identity_key = trial_key;
  END IF;
  RETURN ends_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.metardu_consume_trial_export()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := nullif(current_setting('request.user_id', true), '')::uuid;
  today date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  trial_key bytea;
  started_at timestamptz;
BEGIN
  SELECT CASE WHEN u.email_verified IS TRUE THEN metardu_trial.identity_key(u.email)
    ELSE sha256(convert_to('legacy-unverified-account:' || actor::text, 'UTF8')) END,
    s.trial_ends_at - interval '336 hours'
  INTO trial_key, started_at
  FROM public.users u JOIN public.user_subscriptions s ON s.user_id = u.id
  WHERE u.id = actor AND s.status = 'trial' AND s.plan_id = 'pro'
    AND s.trial_ends_at > clock_timestamp();

  IF trial_key IS NULL THEN RETURN false; END IF;

  INSERT INTO metardu_trial.grants AS g(identity_key, granted_at, export_day, export_count)
  VALUES (trial_key, started_at, today, 1)
  ON CONFLICT (identity_key) DO UPDATE SET
    export_day = today,
    export_count = CASE WHEN g.export_day = today THEN g.export_count + 1 ELSE 1 END
  WHERE g.export_day IS DISTINCT FROM today OR g.export_count < 20;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.metardu_activate_verified_trial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metardu_consume_trial_export() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metardu_activate_verified_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.metardu_consume_trial_export() TO authenticated;
