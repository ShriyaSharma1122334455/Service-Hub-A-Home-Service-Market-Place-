-- Creates an atomic function to recalculate a provider's average rating and count
-- Run this script in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION recalculate_provider_rating(provider_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE providers
  SET 
    rating_avg = COALESCE((
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM reviews
      WHERE reviews.provider_id = $1
    ), 0),
    rating_count = (
      SELECT COUNT(*)
      FROM reviews
      WHERE reviews.provider_id = $1
    )
  WHERE id = $1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
