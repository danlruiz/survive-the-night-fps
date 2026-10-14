-- Map 1 beaten (server/game.js driveOff): how many runs a player's team drove off the island in, with them in the
-- game, and when the first one was. Any at all opens the games that start on the mainland to them: making one
-- (POST /api/games) and joining one (server/index.js seat).
ALTER TABLE player_stats ADD COLUMN crossings integer NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN map1_at timestamptz;

-- The runs that crossed before this was counted, from the match records: everybody in the match as the car drove off
-- the island. A match where an admin command came first is left out (/cross and /map2 drive off without a run).
WITH crossed AS (
  SELECT e.match_id, e.at
    FROM match_events e
   WHERE e.type = 'crossing'
     AND NOT EXISTS (SELECT 1 FROM match_events a WHERE a.match_id = e.match_id AND a.type = 'admin' AND a.at <= e.at)
), who AS (
  SELECT CASE WHEN p.user_id IS NOT NULL THEN 'u:' || p.user_id::text ELSE 'g:' || p.guest_key END AS key,
         p.user_id, max(p.name) AS name, count(DISTINCT c.match_id)::int AS n, min(c.at) AS first
    FROM crossed c
    JOIN match_players p ON p.match_id = c.match_id
   WHERE (p.user_id IS NOT NULL OR p.guest_key IS NOT NULL)
     AND p.joined_at <= c.at AND (p.left_at IS NULL OR p.left_at >= c.at)
   GROUP BY 1, 2
)
INSERT INTO player_stats (key, user_id, name, crossings, map1_at)
SELECT key, user_id, COALESCE(name, 'Survivor'), n, first FROM who
ON CONFLICT (key) DO UPDATE SET crossings = EXCLUDED.crossings, map1_at = EXCLUDED.map1_at;
