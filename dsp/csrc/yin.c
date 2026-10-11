/* YIN fundamental-frequency estimator (de Cheveigne & Kawahara, 2002).
 * Returns the pitch in Hz of one analysis window, or 0 when unvoiced. */
#include <stdlib.h>

float yin_pitch(const float *buf, int n, int sample_rate, float threshold) {
    int half = n / 2;
    if (half < 2) return 0.0f;
    float *d = malloc(sizeof(float) * half);
    if (!d) return 0.0f;

    /* difference function */
    for (int tau = 0; tau < half; tau++) {
        float sum = 0.0f;
        for (int i = 0; i < half; i++) {
            float delta = buf[i] - buf[i + tau];
            sum += delta * delta;
        }
        d[tau] = sum;
    }

    /* cumulative mean normalised difference */
    d[0] = 1.0f;
    float running = 0.0f;
    for (int tau = 1; tau < half; tau++) {
        running += d[tau];
        d[tau] = running > 0.0f ? d[tau] * tau / running : 1.0f;
    }

    /* absolute threshold: first dip below threshold, then walk to its minimum */
    int tau = -1;
    for (int t = 2; t < half; t++) {
        if (d[t] < threshold) {
            while (t + 1 < half && d[t + 1] < d[t]) t++;
            tau = t;
            break;
        }
    }
    if (tau < 0) { free(d); return 0.0f; }

    /* parabolic interpolation for sub-sample accuracy */
    float better = (float)tau;
    if (tau > 0 && tau + 1 < half) {
        float s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
        float denom = 2.0f * (2.0f * s1 - s2 - s0);
        if (denom != 0.0f) better = tau + (s2 - s0) / denom;
    }
    free(d);
    return better > 0.0f ? (float)sample_rate / better : 0.0f;
}
