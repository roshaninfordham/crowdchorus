-- Providers are pluggable, so the chorus line's source is any provider name
-- (e.g. 'gemini', 'local'), not a fixed vendor list.
ALTER TABLE rooms DROP CONSTRAINT rooms_chorus_source_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_chorus_source_check
  CHECK (chorus_source ~ '^[a-z0-9_-]{1,32}$');
