# Runs the real sweep against the test database and a temp storage dir.
#   ruby ops/test/retention_test.rb   (rake test runs it after db:test_prepare)
require "minitest/autorun"
require "tmpdir"
require "fileutils"

class RetentionTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  DB = "postgres://postgres:crowdchorus@localhost:5434/crowdchorus_test"

  def sql(q)
    IO.popen(%w[docker compose exec -T db psql -U postgres -d crowdchorus_test -At -q -c] + [q], chdir: ROOT, &:read).strip
  end

  def setup
    @storage = Dir.mktmpdir
    code = Array.new(6) { [*"A".."Z", *"2".."9"].sample }.join
    @room = sql("INSERT INTO rooms (join_code, host_token_hash) VALUES ('#{code}', 'x') RETURNING id").lines.first.strip
    @part = sql("INSERT INTO participants (room_id, nickname, session_token_hash, mood) VALUES ('#{@room}', 't', 'h', 'joyful') RETURNING id").lines.first.strip
  end

  def teardown
    sql("DELETE FROM rooms WHERE id = '#{@room}'")
    FileUtils.rm_rf(@storage)
  end

  def clip(status, age_hours)
    id = sql("INSERT INTO contributions (room_id, participant_id, status, consent_at, created_at)
              VALUES ('#{@room}', '#{@part}', '#{status}', now(), now() - interval '#{age_hours} hours') RETURNING id").lines.first.strip
    key = "vocals/#{@room}/#{id}.wav"
    sql("UPDATE contributions SET audio_object_key = '#{key}' WHERE id = '#{id}'")
    path = File.join(@storage, key)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, "RIFF")
    path
  end

  def sweep
    env = { "DATABASE_URL" => DB, "STORAGE_DIR" => @storage, "RETENTION_HOURS" => "24" }
    assert system(env, "rake", "-f", File.join(ROOT, "Rakefile"), "retention:sweep", out: File::NULL), "sweep failed"
  end

  def test_deletes_expired_and_withdrawn_keeps_fresh
    old = clip("processed", 30)
    withdrawn = clip("withdrawn", 0)
    fresh = clip("accepted", 1)
    orphan = File.join(@storage, "vocals", @room, "orphan.wav")
    File.write(orphan, "RIFF")
    File.utime(Time.now - 3600, Time.now - 3600, orphan)

    sweep

    refute File.exist?(old), "expired clip should be deleted"
    refute File.exist?(withdrawn), "withdrawn clip should be deleted"
    refute File.exist?(orphan), "unreferenced clip should be deleted"
    assert File.exist?(fresh), "fresh clip must survive"
    assert_equal "1", sql("SELECT count(*) FROM contributions WHERE room_id = '#{@room}' AND audio_object_key IS NOT NULL")
  end
end
