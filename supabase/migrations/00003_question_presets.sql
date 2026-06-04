-- Suggested questions for Ask a Question (platform defaults + per-condocorp overrides)
CREATE TABLE IF NOT EXISTS question_presets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid REFERENCES condocorps(id) ON DELETE CASCADE,
  text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_presets_condocorp ON question_presets(condocorp_id);

-- Platform-wide defaults (condocorp_id IS NULL)
INSERT INTO question_presets (condocorp_id, text, sort_order) VALUES
  (NULL, 'What are the pet policies in our building?', 0),
  (NULL, 'What are the parking rules?', 1),
  (NULL, 'When is the next annual general meeting?', 2),
  (NULL, 'What is the noise bylaw?', 3),
  (NULL, 'How do I submit a maintenance request?', 4),
  (NULL, 'What are the move-in/move-out procedures?', 5);
