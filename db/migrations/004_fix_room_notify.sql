-- 003's CASE referenced NEW.room_id even for rooms rows; PL/pgSQL resolves the
-- field on the untaken branch too, so every INSERT/UPDATE on rooms failed with
-- 'record "new" has no field "room_id"'. Branch with IF instead.
CREATE OR REPLACE FUNCTION notify_room_changed() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'rooms' THEN
    PERFORM pg_notify('room_changed', NEW.id::text);
  ELSE
    PERFORM pg_notify('room_changed', NEW.room_id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
