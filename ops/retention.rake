# Voice retention. Raw vocal clips are private and short-lived:
#   - withdrawn or failed clips are deleted on the next sweep
#   - every other clip is deleted RETENTION_HOURS after upload (default 24)
# The mixed song keeps the voices; the individual recordings do not survive.
# On R2, pair this with a bucket lifecycle rule on the vocals/ prefix.
namespace :retention do
  desc "Delete expired private vocal clips and clear their object keys"
  task :sweep do
    hours = Integer(ENV.fetch("RETENTION_HOURS", "24"))
    # RETURNING sees the updated row, so read the old key from a locked subquery.
    rows = psql(<<~SQL, tuples: true)
      UPDATE contributions c SET audio_object_key = NULL
      FROM (
        SELECT id, audio_object_key AS old_key FROM contributions
        WHERE audio_object_key IS NOT NULL
          AND (status IN ('withdrawn', 'failed') OR created_at < now() - interval '#{hours} hours')
        FOR UPDATE
      ) expired
      WHERE c.id = expired.id
      RETURNING expired.old_key;
    SQL
    keys = rows.split("\n").reject(&:empty?)
    keys.each do |key|
      path = File.expand_path(key, STORAGE)
      raise "refusing to delete outside storage: #{key}" unless path.start_with?(File.expand_path(STORAGE) + "/")
      File.delete(path) if File.exist?(path)
    end
    # Safety net: any vocal file no row points at is an orphan. The grace period
    # spares uploads whose file is written just before their row is inserted.
    live = psql("SELECT audio_object_key FROM contributions WHERE audio_object_key IS NOT NULL;", tuples: true).split("\n")
    orphans = Dir[File.join(STORAGE, "vocals", "*", "*")].select do |path|
      key = path.delete_prefix(File.expand_path(STORAGE) + "/")
      !live.include?(key) && File.mtime(path) < Time.now - 600
    end
    orphans.each { |path| File.delete(path) }
    keys += orphans

    psql("INSERT INTO session_events (room_id, event_type, metadata) VALUES " \
         "('00000000-0000-0000-0000-000000000000', 'retention_sweep', '{\"deleted\": #{keys.size}}');")
    puts "retention: deleted #{keys.size} clip(s) older than #{hours}h or withdrawn"
  end

  # ponytail: in-process hourly loop for dev; in production run `rake retention:sweep` from cron.
  desc "Sweep every RETENTION_INTERVAL seconds (default 3600)"
  task :loop do
    interval = Integer(ENV.fetch("RETENTION_INTERVAL", "3600"))
    loop do
      begin
        Rake::Task["retention:sweep"].reenable
        Rake::Task["retention:sweep"].invoke
      rescue => e
        warn "retention sweep failed: #{e.message}"
      end
      sleep interval
    end
  end
end
