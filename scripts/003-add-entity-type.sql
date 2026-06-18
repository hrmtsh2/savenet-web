-- Generalize entity resolution beyond real-world places.
-- entity_type captures what KIND of entity this is (e.g. place, sports_team,
-- person, product, organization), inferred from the owning category.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
