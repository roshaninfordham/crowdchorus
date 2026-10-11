// Mono Freeverb (Jezar at Dreampoint, public domain): 8 parallel lowpass-
// feedback combs into 4 series allpasses. Tunings are for 44.1 kHz.
#include <vector>

namespace {

class Comb {
  public:
    explicit Comb(int size) : buf_(size, 0.0f) {}
    float process(float in, float feedback, float damp) {
        float out = buf_[idx_];
        store_ = out * (1.0f - damp) + store_ * damp;
        buf_[idx_] = in + store_ * feedback;
        if (++idx_ >= (int)buf_.size()) idx_ = 0;
        return out;
    }

  private:
    std::vector<float> buf_;
    int idx_ = 0;
    float store_ = 0.0f;
};

class Allpass {
  public:
    explicit Allpass(int size) : buf_(size, 0.0f) {}
    float process(float in) {
        float bufout = buf_[idx_];
        buf_[idx_] = in + bufout * 0.5f;
        if (++idx_ >= (int)buf_.size()) idx_ = 0;
        return bufout - in;
    }

  private:
    std::vector<float> buf_;
    int idx_ = 0;
};

}  // namespace

extern "C" void freeverb_process(float *samples, int n, float room_size, float damping, float wet) {
    static const int kCombs[] = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
    static const int kAllpasses[] = {556, 441, 341, 225};
    std::vector<Comb> combs;
    std::vector<Allpass> allpasses;
    for (int s : kCombs) combs.emplace_back(s);
    for (int s : kAllpasses) allpasses.emplace_back(s);

    const float feedback = room_size * 0.28f + 0.7f;
    const float damp = damping * 0.4f;
    const float fixed_gain = 0.015f;
    for (int i = 0; i < n; i++) {
        float in = samples[i] * fixed_gain;
        float out = 0.0f;
        for (auto &c : combs) out += c.process(in, feedback, damp);
        for (auto &a : allpasses) out = a.process(out);
        samples[i] = samples[i] * (1.0f - wet) + out * wet * 3.0f;
    }
}
