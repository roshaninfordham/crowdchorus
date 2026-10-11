# Voice retention. Raw vocal clips are private and short-lived:
#   - withdrawn or failed clips are deleted on the next sweep
#   - every other clip is deleted RETENTION_HOURS after upload (default 24)
# The mixed song keeps the voices; the individual recordings do not survive.
# On R2, pair this with a bucket lifecycle rule on the vocals/ prefix.
namespace :retention do
  desc "Delete expired private vocal clips and clear their object keys"
  task :sweep do
    hours = Integer(ENV.fetch("RETENTION_HOURS", "24"))
    rows = psql(<<~SQL, tuples: true)
      UPDATE contributions SET audio_object_key = NULL
      WHERE audio_object_key IS NOT NULL
        AND (status IN ('withdrawn', 'failed') OR created_at < now() - interval '#{hours} hours')
      RETURNING audio_object_key;
    SQL
    keys = rows.split("\n").reject(&:empty?)
    keys.each do |key|
      path = File.expand_path(key, STORAGE)
      raise "refusing to delete outside storage: #{key}" unless path.start_with?(File.expand_path(STORAGE) + "/")
      File.delete(path) if File.exist?(path)
    end
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
