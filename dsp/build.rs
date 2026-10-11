fn main() {
    cc::Build::new().file("csrc/yin.c").opt_level(3).compile("yin");
    cc::Build::new()
        .cpp(true)
        .file("csrc/freeverb.cpp")
        .flag_if_supported("-std=c++17")
        .opt_level(3)
        .compile("freeverb");
    println!("cargo:rerun-if-changed=csrc");
}
