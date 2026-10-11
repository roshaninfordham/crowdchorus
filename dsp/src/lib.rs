//! CrowdChorus audio core: deterministic synthesis, clip analysis and the
//! crowd-vocal mix. Inputs and outputs are 44.1 kHz mono WAV; FFmpeg handles
//! every other format at the edges.

use serde::{Deserialize, Serialize};
use std::path::Path;

pub const SR: u32 = 44_100;

unsafe extern "C" {
    fn yin_pitch(buf: *const f32, n: i32, sample_rate: i32, threshold: f32) -> f32;
    fn freeverb_process(samples: *mut f32, n: i32, room_size: f32, damping: f32, wet: f32);
}

#[derive(Deserialize, Clone)]
pub struct Music {
    pub bpm: f32,
    pub phrase_beats: usize,
    pub record_seconds: f32,
    pub motif_midi: Vec<i32>,
    pub chorus_entry_bars: Vec<u32>,
    pub track_seconds: f32,
}

impl Music {
    pub fn load() -> Music {
        serde_json::from_str(include_str!("../../music.json")).expect("music.json")
    }
    pub fn beat_s(&self) -> f32 {
        60.0 / self.bpm
    }
    pub fn bar_s(&self) -> f32 {
        self.beat_s() * 4.0
    }
    pub fn phrase_s(&self) -> f32 {
        self.beat_s() * self.phrase_beats as f32
    }
}

pub fn midi_hz(m: f32) -> f32 {
    440.0 * 2f32.powf((m - 69.0) / 12.0)
}

// ---------- WAV io ----------

pub fn read_wav(path: &Path) -> Result<Vec<f32>, String> {
    let mut r = hound::WavReader::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let spec = r.spec();
    if spec.sample_rate != SR {
        return Err(format!("{}: expected {SR} Hz, got {}", path.display(), spec.sample_rate));
    }
    let ch = spec.channels as usize;
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let scale = (1i64 << (spec.bits_per_sample - 1)) as f32;
            r.samples::<i32>().map(|s| s.map(|v| v as f32 / scale)).collect::<Result<_, _>>()
        }
        hound::SampleFormat::Float => r.samples::<f32>().collect::<Result<_, _>>(),
    }
    .map_err(|e| e.to_string())?;
    Ok(raw.chunks(ch).map(|c| c.iter().sum::<f32>() / ch as f32).collect())
}

pub fn write_wav(path: &Path, samples: &[f32]) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SR,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut w = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for s in samples {
        w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?;
    }
    w.finalize().map_err(|e| e.to_string())
}

// ---------- analysis ----------

pub fn rms(s: &[f32]) -> f32 {
    if s.is_empty() {
        return 0.0;
    }
    (s.iter().map(|x| x * x).sum::<f32>() / s.len() as f32).sqrt()
}

pub fn db(x: f32) -> f32 {
    20.0 * x.max(1e-9).log10()
}

/// First 10 ms frame louder than max(peak frame - 30 dB, -50 dBFS).
pub fn onset(s: &[f32]) -> Option<usize> {
    let frame = (SR / 100) as usize;
    let frames: Vec<f32> = s.chunks(frame).map(rms).collect();
    let peak = frames.iter().cloned().fold(0.0, f32::max);
    let thresh = (peak * 10f32.powf(-30.0 / 20.0)).max(10f32.powf(-50.0 / 20.0));
    frames.iter().position(|&r| r > thresh).map(|i| i * frame)
}

#[derive(Serialize, Debug)]
pub struct Analysis {
    pub duration_s: f32,
    pub rms_db: f32,
    pub peak: f32,
    pub onset_s: Option<f32>,
    pub median_pitch_hz: Option<f32>,
    pub voiced_ratio: f32,
}

pub fn analyze(s: &[f32]) -> Analysis {
    let win = 2048;
    let mut pitches = vec![];
    let mut frames = 0;
    let loud = 10f32.powf(-45.0 / 20.0);
    for chunk in s.chunks_exact(win).step_by(1) {
        frames += 1;
        if rms(chunk) < loud {
            continue;
        }
        let hz = unsafe { yin_pitch(chunk.as_ptr(), win as i32, SR as i32, 0.15) };
        if (60.0..1200.0).contains(&hz) {
            pitches.push(hz);
        }
    }
    pitches.sort_by(|a, b| a.partial_cmp(b).unwrap());
    Analysis {
        duration_s: s.len() as f32 / SR as f32,
        rms_db: db(rms(s)),
        peak: s.iter().fold(0.0f32, |m, x| m.max(x.abs())),
        onset_s: onset(s).map(|i| i as f32 / SR as f32),
        median_pitch_hz: pitches.get(pitches.len() / 2).copied(),
        voiced_ratio: if frames == 0 { 0.0 } else { pitches.len() as f32 / frames as f32 },
    }
}

// ---------- synthesis ----------

/// Deterministic PRNG (LCG) so demo assets are identical on every machine.
struct Rng(u32);
impl Rng {
    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        self.0 as f32 / u32::MAX as f32
    }
}

fn tri(phase: f32) -> f32 {
    let p = phase - phase.floor();
    4.0 * (p - 0.5).abs() - 1.0
}

/// Prepared fallback instrumental (C-Am-F-G). A labelled demo asset, used only
/// when Lyria is unavailable; never presented as the room's generated music.
pub fn demo_instrumental(m: &Music) -> Vec<f32> {
    let chords: [[i32; 4]; 4] = [[36, 60, 64, 67], [33, 57, 60, 64], [29, 57, 60, 65], [31, 55, 59, 62]];
    let (beat, bar, secs) = (m.beat_s(), m.bar_s(), m.track_seconds);
    let n = (secs * SR as f32) as usize;
    let mut rng = Rng(7);
    let mut out = vec![0.0f32; n];
    for (i, o) in out.iter_mut().enumerate() {
        let t = i as f32 / SR as f32;
        let bar_i = (t / bar) as usize;
        let ch = chords[bar_i % 4];
        let (bass, pad) = (ch[0], &ch[1..]);
        let beat_t = t % beat;
        let bar_t = t % bar;
        let eighth = beat / 2.0;
        let eighth_t = t % eighth;
        let fade = (t / 2.0).min(1.0) * ((secs - t) / 3.0).min(1.0);

        let mut p = 0.0;
        for &note in pad {
            let f = midi_hz(note as f32);
            p += tri(f * t) + tri(f * 1.003 * t);
        }
        p *= 0.045 * (0.6 + 0.4 * (bar_t / 0.4).min(1.0));

        let b = 0.22 * (2.0 * std::f32::consts::PI * midi_hz(bass as f32) * t).sin() * (-beat_t * 3.0).exp();
        let arp = if bar_i >= 2 {
            let idx = (t / eighth) as usize % pad.len();
            0.05 * (2.0 * std::f32::consts::PI * midi_hz((pad[idx] + 12) as f32) * t).sin() * (-eighth_t * 9.0).exp()
        } else {
            0.0
        };
        let kick = if bar_i >= 1 {
            let f = 50.0 + 90.0 * (-beat_t * 30.0).exp();
            0.5 * (2.0 * std::f32::consts::PI * f * beat_t).sin() * (-beat_t * 9.0).exp()
        } else {
            0.0
        };
        let off_t = (t + beat / 2.0) % beat;
        let hat = if bar_i >= 2 { 0.04 * (rng.next() * 2.0 - 1.0) * (-off_t * 60.0).exp() } else { 0.0 };
        *o = (p + b + arp + kick + hat) * fade;
    }
    out
}

/// A synthetic "hum" of the shared motif for clearly labelled simulated
/// participants. `voice` varies octave, vowel, timing and tuning.
pub fn simulated_voice(m: &Music, voice: u32) -> Vec<f32> {
    let mut rng = Rng(voice.wrapping_mul(977).wrapping_add(13));
    let n = (m.record_seconds * SR as f32) as usize;
    let beat = m.beat_s();
    let octave = if voice % 3 == 0 { -12.0 } else { 0.0 };
    let late = 0.15 + rng.next() * 0.35;
    let detune = (rng.next() - 0.5) * 0.4;
    let vib = 4.5 + rng.next() * 1.5;
    let formants = [[800.0, 1150.0], [500.0, 900.0], [350.0, 800.0]][(voice % 3) as usize];
    let mut out = vec![0.0f32; n];
    let mut phase = 0.0f32;
    for (i, o) in out.iter_mut().enumerate() {
        let t = i as f32 / SR as f32 - late;
        if t < 0.0 {
            continue;
        }
        let b = (t / beat) as usize;
        if b >= m.phrase_beats {
            break;
        }
        let in_beat = t - b as f32 * beat;
        let f = midi_hz(m.motif_midi[b] as f32 + octave + detune)
            * (1.0 + 0.006 * (2.0 * std::f32::consts::PI * vib * t).sin());
        phase = (phase + f / SR as f32).fract();
        let env = (in_beat / 0.04).min(1.0) * ((beat - in_beat) / 0.08).min(1.0);
        let mut s = 0.0;
        for h in 1..=14 {
            let hf = f * h as f32;
            let w = 1.0 / h as f32
                + 1.6 * (-((hf - formants[0]) / 160.0).powi(2)).exp()
                + 0.9 * (-((hf - formants[1]) / 220.0).powi(2)).exp();
            s += w * (2.0 * std::f32::consts::PI * phase * h as f32).sin();
        }
        *o = 0.12 * s * env;
    }
    for o in out.iter_mut() {
        *o += (rng.next() * 2.0 - 1.0) * 0.002;
    }
    out
}

// ---------- mix ----------

#[derive(Serialize, Debug)]
pub struct VoiceReport {
    pub index: usize,
    pub included: bool,
    pub onset_s: Option<f32>,
    pub gain_db: f32,
    pub reason: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct MixReport {
    pub voices: Vec<VoiceReport>,
    pub included: usize,
    pub chorus_entries_s: Vec<f32>,
    pub duration_s: f32,
    /// Crowd bus and ducked backing levels inside the chorus windows, measured
    /// on the same scale, so "the crowd is audible" is a checkable number.
    pub crowd_rms_db: f32,
    pub backing_rms_db: f32,
}

/// Prepare one clip: high-pass, align onset to t=0, cut to the phrase,
/// RMS-normalise to -20 dBFS (peak-limited), and fade the edges.
pub fn prepare_voice(m: &Music, raw: &[f32]) -> Result<(Vec<f32>, f32, f32), String> {
    // one-pole high-pass ~90 Hz to remove rumble and DC
    let a = (-2.0 * std::f32::consts::PI * 90.0 / SR as f32).exp();
    let mut hp = Vec::with_capacity(raw.len());
    let (mut px, mut py) = (0.0f32, 0.0f32);
    for &x in raw {
        let y = a * (py + x - px);
        hp.push(y);
        px = x;
        py = y;
    }
    let start = onset(&hp).ok_or("silent clip")?;
    let pre = (0.02 * SR as f32) as usize;
    let start = start.saturating_sub(pre);
    let len = ((m.phrase_s() + 0.4) * SR as f32) as usize;
    let mut v: Vec<f32> = hp[start..].iter().take(len).cloned().collect();
    let level = rms(&v);
    if db(level) < -55.0 {
        return Err("too quiet".into());
    }
    let peak = v.iter().fold(0.0f32, |p, x| p.max(x.abs()));
    let gain = (10f32.powf(-20.0 / 20.0) / level).min(0.9 / peak.max(1e-6));
    let fin = (0.02 * SR as f32) as usize;
    let fout = (0.15 * SR as f32) as usize;
    let n = v.len();
    for (i, s) in v.iter_mut().enumerate() {
        let f = (i as f32 / fin as f32).min(1.0) * ((n - i) as f32 / fout as f32).min(1.0);
        *s *= gain * f;
    }
    Ok((v, start as f32 / SR as f32, db(gain)))
}

pub fn mix(m: &Music, instrumental: &[f32], voices: &[Vec<f32>]) -> (Vec<f32>, MixReport) {
    let mut reports = vec![];
    let mut prepared = vec![];
    for (i, raw) in voices.iter().enumerate() {
        match prepare_voice(m, raw) {
            Ok((v, on, g)) => {
                reports.push(VoiceReport { index: i, included: true, onset_s: Some(on), gain_db: g, reason: None });
                prepared.push(v);
            }
            Err(e) => reports.push(VoiceReport { index: i, included: false, onset_s: None, gain_db: 0.0, reason: Some(e) }),
        }
    }

    // crowd bus: equal-power sum so every voice stays audible as n grows
    let phrase = (m.phrase_s() * SR as f32) as usize;
    let bus_len = prepared.iter().map(|v| v.len()).max().unwrap_or(0).max(phrase) + SR as usize; // reverb tail
    let mut bus = vec![0.0f32; bus_len];
    let g = 1.0 / (prepared.len().max(1) as f32).sqrt();
    for v in &prepared {
        for (b, s) in bus.iter_mut().zip(v) {
            *b += s * g;
        }
    }
    if !bus.is_empty() {
        unsafe { freeverb_process(bus.as_mut_ptr(), bus.len() as i32, 0.6, 0.5, 0.22) };
    }
    // gain staging: backing at -20 dBFS RMS, crowd phrase at -17 dBFS RMS,
    // whatever loudness Lyria or the demo track arrived at
    let bus_level = rms(&bus[..phrase.min(bus.len())]);
    if bus_level > 0.0 {
        let k = 10f32.powf(-17.0 / 20.0) / bus_level;
        bus.iter_mut().for_each(|s| *s *= k);
    }
    let mut out = instrumental.to_vec();
    let inst_level = rms(&out);
    if inst_level > 0.0 {
        let k = 10f32.powf(-20.0 / 20.0) / inst_level;
        out.iter_mut().for_each(|s| *s *= k);
    }
    let entries: Vec<f32> = m.chorus_entry_bars.iter().map(|&b| b as f32 * m.bar_s()).collect();
    let ramp = (0.25 * SR as f32) as usize;
    let duck = 10f32.powf(-5.0 / 20.0);
    let mut crowd = vec![];
    let mut backing = vec![];
    for &e in &entries {
        let at = (e * SR as f32) as usize;
        if at >= out.len() || prepared.is_empty() {
            continue;
        }
        // duck the backing under the crowd with smooth ramps
        let lo = at.saturating_sub(ramp);
        let hi = (at + phrase + ramp).min(out.len());
        for (i, s) in out.iter_mut().enumerate().take(hi).skip(lo) {
            let k = if i < at {
                (at - i) as f32 / ramp as f32
            } else if i > at + phrase {
                (i - at - phrase) as f32 / ramp as f32
            } else {
                0.0
            };
            *s *= duck + (1.0 - duck) * k.min(1.0);
        }
        let end = (at + phrase).min(out.len());
        backing.extend_from_slice(&out[at..end]);
        crowd.extend_from_slice(&bus[..end - at]);
        for (o, b) in out[at..].iter_mut().zip(&bus) {
            *o += b;
        }
    }

    // peak-normalise to -1 dBFS; loudness is finished by ffmpeg loudnorm
    let peak = out.iter().fold(0.0f32, |p, x| p.max(x.abs()));
    let target = 10f32.powf(-1.0 / 20.0);
    if peak > target {
        let k = target / peak;
        out.iter_mut().for_each(|s| *s *= k);
    }

    let report = MixReport {
        included: prepared.len(),
        voices: reports,
        chorus_entries_s: entries,
        duration_s: out.len() as f32 / SR as f32,
        crowd_rms_db: db(rms(&crowd)),
        backing_rms_db: db(rms(&backing)),
    };
    (out, report)
}
