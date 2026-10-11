-- Any write from any language (Next.js routes, the Python worker, Rake tasks)
-- announces the room on channel 'room_changed'; the web tier fans it out over SSE.
CREATE FUNCTION notify_room_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('room_changed',
    CASE WHEN TG_TABLE_NAME = 'rooms' THEN NEW.id::text ELSE NEW.room_id::text END);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_notify AFTER INSERT OR UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION notify_room_changed();
CREATE TRIGGER participants_notify AFTER INSERT OR UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION notify_room_changed();
CREATE TRIGGER contributions_notify AFTER INSERT OR UPDATE ON contributions
  FOR EACH ROW EXECUTE FUNCTION notify_room_changed();
CREATE TRIGGER generation_jobs_notify AFTER INSERT OR UPDATE ON generation_jobs
  FOR EACH ROW EXECUTE FUNCTION notify_room_changed();

-- new jobs also wake the worker immediately instead of waiting for its poll
CREATE FUNCTION notify_job_queued() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('job_queued', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generation_jobs_queued AFTER INSERT ON generation_jobs
  FOR EACH ROW EXECUTE FUNCTION notify_job_queued();

CREATE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_touch BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
