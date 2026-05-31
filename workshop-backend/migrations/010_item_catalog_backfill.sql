-- 010: back-fill item_catalog from historical job_items
--
-- The migration in 008 created an empty item_catalog. Before this migration
-- ran, mechanics opening job-create/job-detail would see an empty autocomplete
-- until an admin manually curated entries via /trabajos/catalogo-items.
--
-- Seed the catalog with one row per distinct historical parent description
-- (case/whitespace-normalized), and attach the most common set of children
-- seen for that description.
--
-- Idempotent: ON CONFLICT DO NOTHING against the existing partial unique
-- index on LOWER(TRIM(description)) WHERE parent_id IS NULL.

WITH parent_seed AS (
  SELECT
    TRIM(description) AS description,
    MODE() WITHIN GROUP (ORDER BY item_type) AS item_type
  FROM job_items
  WHERE parent_id IS NULL
    AND TRIM(description) <> ''
  GROUP BY LOWER(TRIM(description)), TRIM(description)
),
inserted_parents AS (
  INSERT INTO item_catalog (description, item_type)
  SELECT description, item_type FROM parent_seed
  ON CONFLICT DO NOTHING
  RETURNING id, description
),
all_parents AS (
  SELECT id, description FROM inserted_parents
  UNION ALL
  SELECT ic.id, ic.description
  FROM item_catalog ic
  WHERE ic.parent_id IS NULL
    AND LOWER(TRIM(ic.description)) IN (SELECT LOWER(description) FROM parent_seed)
    AND ic.id NOT IN (SELECT id FROM inserted_parents)
),
-- For each backfilled parent, pick the most common set of children
-- (by normalized child names) and attach those children.
child_candidates AS (
  SELECT
    LOWER(TRIM(p.description)) AS parent_key,
    p.id AS source_parent_id,
    COALESCE(
      string_agg(LOWER(TRIM(c.description)), '|' ORDER BY LOWER(TRIM(c.description)))
        FILTER (WHERE c.description IS NOT NULL AND TRIM(c.description) <> ''),
      ''
    ) AS children_key,
    array_agg(TRIM(c.description) ORDER BY LOWER(TRIM(c.description)))
      FILTER (WHERE c.description IS NOT NULL AND TRIM(c.description) <> '') AS child_descs
  FROM job_items p
  LEFT JOIN job_items c ON c.parent_id = p.id
  WHERE p.parent_id IS NULL
    AND TRIM(p.description) <> ''
  GROUP BY p.id, p.description
),
ranked AS (
  SELECT
    parent_key,
    children_key,
    child_descs,
    ROW_NUMBER() OVER (PARTITION BY parent_key ORDER BY COUNT(*) DESC, children_key) AS rn,
    SUM(CASE WHEN children_key <> '' THEN 1 ELSE 0 END) OVER (PARTITION BY parent_key) AS non_empty_count
  FROM child_candidates
  GROUP BY parent_key, children_key, child_descs
),
chosen AS (
  SELECT parent_key, child_descs
  FROM ranked
  WHERE rn = 1 AND child_descs IS NOT NULL AND array_length(child_descs, 1) > 0
)
INSERT INTO item_catalog (description, item_type, parent_id, sort_order)
SELECT
  child_desc,
  'mano_de_obra',
  ap.id,
  ord - 1
FROM all_parents ap
JOIN chosen ch ON LOWER(TRIM(ap.description)) = ch.parent_key
CROSS JOIN LATERAL unnest(ch.child_descs) WITH ORDINALITY AS u(child_desc, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM item_catalog existing
  WHERE existing.parent_id = ap.id
);
