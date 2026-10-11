# CrowdChorus task runner. `rake -T` lists everything.
require "shellwords"
require "fileutils"

ROOT = __dir__
ENV["PATH"] = "#{Dir.home}/.cargo/bin:#{ENV["PATH"]}"

# Minimal .env loader: KEY=VALUE lines, existing env wins.
[".env.local", ".env"].each do |file|
  path = File.join(ROOT, file)
  next unless File.exist?(path)
  File.foreach(path) do |line|
    next if line.strip.empty? || line.start_with?("#")
    key, value = line.strip.split("=", 2)
    ENV[key] ||= value.to_s.delete_prefix('"').delete_suffix('"')
  end
end

LOCAL_DB = "postgres://postgres:crowdchorus@localhost:5434/crowdchorus"
ENV["DATABASE_URL"] ||= LOCAL_DB
DSP_BIN = ENV["CHORUS_DSP_BIN"] ||= File.join(ROOT, "dsp/target/release/chorus-dsp")
STORAGE = ENV["STORAGE_DIR"] ||= File.join(ROOT, "storage")

# Run SQL through psql: the compose container for the local DB, a local psql
# for a remote one (Tiger Cloud), else psql from the TimescaleDB image.
def psql(sql, tuples: false)
  flags = ["-v", "ON_ERROR_STOP=1", "-q", "-c", "SET client_min_messages = warning", "-f", "-"]
  flags += ["-At"] if tuples
  cmd =
    if ENV["DATABASE_URL"] == LOCAL_DB
      %w[docker compose exec -T db psql -U postgres -d crowdchorus] + flags
    elsif system("command -v psql >/dev/null")
      ["psql", ENV["DATABASE_URL"]] + flags
    else
      %w[docker run --rm -i timescale/timescaledb:latest-pg17 psql] + [ENV["DATABASE_URL"]] + flags
    end
  out = IO.popen(cmd, "r+", chdir: ROOT) { |io| io.write(sql); io.close_write; io.read }
  raise "psql failed" unless $?.success?
  out
end

namespace :db do
  desc "Start the local TimescaleDB container"
  task :up do
    sh "docker compose up -d --wait db"
  end

  desc "Apply pending SQL migrations in db/migrations"
  task :migrate do
    psql("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz DEFAULT now());")
    applied = psql("SELECT version FROM schema_migrations;", tuples: true).split
    Dir[File.join(ROOT, "db/migrations/*.sql")].sort.each do |file|
      version = File.basename(file, ".sql")
      next if applied.include?(version)
      psql("BEGIN;\n#{File.read(file)}\nINSERT INTO schema_migrations (version) VALUES ('#{version}');\nCOMMIT;")
      puts "migrated #{version}"
    end
  end

  desc "Drop and recreate the local database (local only)"
  task :reset do
    abort "refusing to reset a non-local DATABASE_URL" unless ENV["DATABASE_URL"] == LOCAL_DB
    sh "docker compose exec -T db psql -U postgres -c 'DROP DATABASE IF EXISTS crowdchorus WITH (FORCE)' -c 'CREATE DATABASE crowdchorus'"
    Rake::Task["db:migrate"].invoke
  end
end

namespace :dsp do
  desc "Build the Rust/C/C++ audio core"
  task :build do
    sh "cargo build --release --manifest-path dsp/Cargo.toml"
  end

  desc "Run the audio core tests"
  task :test do
    sh "cargo test --release --manifest-path dsp/Cargo.toml"
  end
end

namespace :demo do
  desc "Render the prepared fallback instrumental (a labelled demo asset)"
  task assets: "dsp:build" do
    dir = File.join(STORAGE, "demo")
    FileUtils.mkdir_p(dir)
    sh DSP_BIN, "instrumental", File.join(dir, "instrumental.wav")
  end
end

desc "Run the generation worker"
task :worker do
  sh "uv run --project worker python -m worker"
end

desc "Start db, worker and web together (Ctrl-C stops all)"
task dev: ["db:up", "db:migrate", "demo:assets"] do
  pids = [spawn("uv run --project worker python -m worker"), spawn("pnpm dev")]
  trap("INT") { pids.each { |p| Process.kill("TERM", p) rescue nil } }
  pids.each { |p| Process.wait(p) rescue nil }
end

desc "Run every test suite (Rust, Python, TypeScript)"
task test: ["dsp:test"] do
  sh "uv run --project worker python -m pytest -q worker/tests"
  sh "pnpm test"
end

load File.join(ROOT, "ops/retention.rake")
