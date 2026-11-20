#!/usr/bin/env python3

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100
OUT_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "app", "library-defaults", "Samples")


def write_wav(path, samples_stereo):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for l, r in samples_stereo:
            li = max(-1.0, min(1.0, l))
            ri = max(-1.0, min(1.0, r))
            frames += struct.pack("<hh", int(li * 32767), int(ri * 32767))
        wf.writeframes(bytes(frames))


def n_samples(seconds):
    return int(SAMPLE_RATE * seconds)


def envelope_exp(i, n, decay=8.0):
    return math.exp(-decay * (i / n))


def sine(freq, t):
    return math.sin(2 * math.pi * freq * t)


def white_noise():
    return random.uniform(-1, 1)


def mono_to_stereo(mono, pan=0.0):
    left = min(1.0, 1 - max(0.0, pan))
    right = min(1.0, 1 + min(0.0, pan))
    return [(s * left, s * right) for s in mono]


def make_kick():
    dur = 0.5
    n = n_samples(dur)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 150 * math.exp(-18 * t) + 45
        amp = envelope_exp(i, n, decay=7.0)
        click = white_noise() * math.exp(-i / (SAMPLE_RATE * 0.002)) * 0.25 if i < SAMPLE_RATE * 0.01 else 0
        out.append(sine(freq, t) * amp + click)
    return mono_to_stereo(out)


def make_snare():
    dur = 0.28
    n = n_samples(dur)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        body = sine(190, t) * envelope_exp(i, n, 14) * 0.5
        noise = white_noise() * envelope_exp(i, n, 9) * 0.9
        out.append(body + noise)
    return mono_to_stereo(out)


def make_hihat(open_hat=False):
    dur = 0.45 if open_hat else 0.08
    n = n_samples(dur)
    decay = 5.0 if open_hat else 26.0
    out = []
    prev = 0.0
    freqs = [3200, 4300, 5600, 6700, 8100]
    for i in range(n):
        t = i / SAMPLE_RATE
        val = sum(1 if math.sin(2 * math.pi * f * t) > 0 else -1 for f in freqs) / len(freqs)
        val += white_noise() * 0.35
        hp = val - prev
        prev = val
        amp = envelope_exp(i, n, decay)
        out.append(hp * amp * 0.6)
    return mono_to_stereo(out)


def make_clap():
    dur = 0.3
    n = n_samples(dur)
    out = [0.0] * n
    bursts = [0.0, 0.012, 0.024, 0.045]
    for b_start in bursts:
        start_i = int(b_start * SAMPLE_RATE)
        for i in range(start_i, n):
            local = i - start_i
            local_n = n - start_i
            amp = envelope_exp(local, local_n, 16.0)
            out[i] += white_noise() * amp * 0.5
    return mono_to_stereo(out)


def make_tom(freq_start=180):
    dur = 0.45
    n = n_samples(dur)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = freq_start * math.exp(-6 * t) + freq_start * 0.4
        amp = envelope_exp(i, n, 6.0)
        out.append(sine(freq, t) * amp)
    return mono_to_stereo(out)


def make_rim():
    dur = 0.09
    n = n_samples(dur)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        amp = envelope_exp(i, n, 40.0)
        out.append((sine(1800, t) * 0.6 + white_noise() * 0.4) * amp)
    return mono_to_stereo(out)


def make_shaker():
    dur = 0.18
    n = n_samples(dur)
    out = []
    for i in range(n):
        amp = envelope_exp(i, n, 10.0)
        out.append(white_noise() * amp * 0.5)
    return mono_to_stereo(out)


def make_sub_bass(note_freq=55.0):
    dur = 1.2
    n = n_samples(dur)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        amp = 1.0 if t < dur - 0.15 else envelope_exp(i - (n - n_samples(0.15)), n_samples(0.15), 6.0)
        val = sine(note_freq, t)
        val = math.tanh(val * 1.6)
        out.append(val * amp * 0.85)
    return mono_to_stereo(out)


def make_pluck_bass(note_freq=110.0):
    dur = 0.6
    n = n_samples(dur)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        amp = envelope_exp(i, n, 5.5)
        val = sine(note_freq, t) + 0.5 * sine(note_freq * 2, t) + 0.25 * sine(note_freq * 3, t)
        out.append(val / 1.75 * amp * 0.8)
    return mono_to_stereo(out)


def make_bell_chord():
    dur = 2.0
    n = n_samples(dur)
    freqs = [261.63, 329.63, 392.00, 523.25]
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        amp = envelope_exp(i, n, 2.2)
        val = sum(sine(f, t) + 0.3 * sine(f * 2.01, t) for f in freqs) / (len(freqs) * 1.3)
        out.append(val * amp * 0.6)
    return mono_to_stereo(out, pan=0.0)


def make_pad_swell():
    dur = 3.0
    n = n_samples(dur)
    freqs = [220.0, 277.18, 329.63]
    out = []
    attack_n = n_samples(1.2)
    for i in range(n):
        t = i / SAMPLE_RATE
        if i < attack_n:
            amp = i / attack_n
        else:
            amp = envelope_exp(i - attack_n, n - attack_n, 1.4)
        val = sum(sine(f, t) + 0.4 * sine(f * 1.003, t) for f in freqs) / (len(freqs) * 1.5)
        out.append(val * amp * 0.55)
    return mono_to_stereo(out)


def main():
    random.seed(42)
    jobs = [
        ("Drums/Kick_Deep.wav", make_kick),
        ("Drums/Snare_Tight.wav", make_snare),
        ("Drums/HiHat_Closed.wav", lambda: make_hihat(False)),
        ("Drums/HiHat_Open.wav", lambda: make_hihat(True)),
        ("Drums/Clap_808.wav", make_clap),
        ("Drums/Tom_Low.wav", lambda: make_tom(140)),
        ("Drums/Tom_High.wav", lambda: make_tom(220)),
        ("Drums/Rim.wav", make_rim),
        ("Drums/Shaker.wav", make_shaker),
        ("Bass/Sub_One_Shot.wav", make_sub_bass),
        ("Bass/Pluck_Bass.wav", make_pluck_bass),
        ("Melodic/Bell_Chord_Cmaj.wav", make_bell_chord),
        ("Melodic/Pad_Swell_Am.wav", make_pad_swell),
    ]
    for rel_path, fn in jobs:
        out_path = os.path.join(OUT_ROOT, rel_path)
        write_wav(out_path, fn())
        print("generated:", rel_path)


if __name__ == "__main__":
    main()
