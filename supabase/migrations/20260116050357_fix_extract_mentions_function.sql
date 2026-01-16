-- Fix the extract_mentions_from_comment function
-- The previous version had an error with ARRAY_AGG and set-returning functions

DROP FUNCTION IF EXISTS extract_mentions_from_comment(TEXT);

CREATE OR REPLACE FUNCTION extract_mentions_from_comment(comment_text TEXT)
RETURNS TEXT[] AS $$
BEGIN
  -- Use ARRAY(SELECT ...) instead of ARRAY_AGG to handle set-returning function
  -- This extracts all @mentions from the comment text
  RETURN ARRAY(
    SELECT DISTINCT (regexp_matches(comment_text, '@([\w-]+)', 'g'))[1]
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
