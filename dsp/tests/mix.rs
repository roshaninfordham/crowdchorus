use chorus_dsp::*;

fn window(s: &[f32], at_s: f32, len_s: f32) -> &[f32] {
    let a = (at_s * SR as f32) as usize;
    &s[a..a + (len_s * SR as f32) as usize]
}

#[test]
fn yin_finds_the_motif_pitch() {
    let m = Music::load();
    let a = analyze(&simulated_voice(&m, 1));
    let hz = a.median_pitch_hz.expect("voiced");
    // motif spans C4..A4 (262..440 Hz)
    assert!((240.0..460.0).contains(&hz), "pitch {hz}");
    assert!(a.voiced_ratio > 0.5, "voiced {}", a.voiced_ratio);
}

#[test]
fn every_voice_is_audible_in_the_chorus() {
    let m = Music::load();
    let inst = demo_instrumental(&m);
    let voices: Vec<_> = (0..3).map(|i| simulated_voice(&m, i)).collect();
    let (out, rep) = mix(&m, &inst, &voices);
    assert_eq!(rep.included, 3);
    assert_eq!(out.len(), inst.len());

    // the crowd sits on top of the ducked backing, not buried under it
    assert!(rep.crowd_rms_db > rep.backing_rms_db, "crowd {} vs backing {}", rep.crowd_rms_db, rep.backing_rms_db);

    let entry = rep.chorus_entries_s[0];
    let phrase = m.phrase_s();

    // dropping any single voice measurably changes the chorus window
    for drop in 0..3 {
        let fewer: Vec<_> = voices.iter().enumerate().filter(|(i, _)| *i != drop).map(|(_, v)| v.clone()).collect();
        let (alt, _) = mix(&m, &inst, &fewer);
        let diff: Vec<f32> = window(&out, entry, phrase).iter().zip(window(&alt, entry, phrase)).map(|(a, b)| a - b).collect();
        assert!(db(rms(&diff)) > -40.0, "voice {drop} contributes only {} dB", db(rms(&diff)));
    }
}

#[test]
fn silent_clip_is_rejected_not_mixed() {
    let m = Music::load();
    let inst = demo_instrumental(&m);
    let (_, rep) = mix(&m, &inst, &[vec![0.0; SR as usize * 5], simulated_voice(&m, 2)]);
    assert_eq!(rep.included, 1);
    assert!(!rep.voices[0].included);
}

#[test]
fn freeverb_adds_a_tail() {
    let m = Music::load();
    // reverb runs only inside mix(); exercise it via a one-voice mix over silence
    let voice = simulated_voice(&m, 4);
    let (out, _) = mix(&m, &vec![0.0; (m.track_seconds * SR as f32) as usize], &[voice]);
    let entry = m.chorus_entry_bars[0] as f32 * m.bar_s();
    // just after the phrase ends the dry voice is gone but reverb still rings
    let tail = window(&out, entry + m.phrase_s() + 0.45, 0.2);
    assert!(db(rms(tail)) > -70.0, "tail {}", db(rms(tail)));
}
