//! chorus-dsp — CLI over the CrowdChorus audio core. Prints JSON on stdout.
//!
//!   chorus-dsp instrumental <out.wav>
//!   chorus-dsp voice <n> <out.wav>
//!   chorus-dsp analyze <in.wav>
//!   chorus-dsp mix <instrumental.wav> <out.wav> <voice.wav>...

use chorus_dsp::*;
use std::path::Path;
use std::process::exit;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let m = Music::load();
    let result = match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["instrumental", out] => write_wav(Path::new(out), &demo_instrumental(&m)).map(|_| "{\"ok\":true}".to_string()),
        ["voice", n, out] => n
            .parse::<u32>()
            .map_err(|e| e.to_string())
            .and_then(|n| write_wav(Path::new(out), &simulated_voice(&m, n)))
            .map(|_| "{\"ok\":true}".to_string()),
        ["analyze", input] => read_wav(Path::new(input)).map(|s| serde_json::to_string(&analyze(&s)).unwrap()),
        ["mix", inst, out, voices @ ..] if !voices.is_empty() => (|| {
            let inst = read_wav(Path::new(inst))?;
            let vs = voices.iter().map(|v| read_wav(Path::new(v))).collect::<Result<Vec<_>, _>>()?;
            let (mixed, report) = mix(&m, &inst, &vs);
            if report.included == 0 {
                return Err("no usable voices".to_string());
            }
            write_wav(Path::new(out), &mixed)?;
            Ok(serde_json::to_string(&report).unwrap())
        })(),
        _ => Err("usage: chorus-dsp instrumental|voice|analyze|mix ...".into()),
    };
    match result {
        Ok(json) => println!("{json}"),
        Err(e) => {
            println!("{}", serde_json::json!({ "error": e }));
            exit(1);
        }
    }
}
