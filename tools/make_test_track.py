#!/usr/bin/env python3
import argparse
import json
import os
import wave

import numpy as np

NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_to_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw_add(freq, n, sr, harmonics=10):
    t = np.arange(n) / sr
    out = np.zeros(n)
    for h in range(1, harmonics + 1):
        if freq * h > sr / 2 * 0.9:
            break
        out += np.sin(2 * np.pi * freq * h * t) / h
    return out * 0.6


def env_ad(n, sr, attack, decay):
    t = np.arange(n) / sr
    a = np.minimum(1.0, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def kick(sr):
    n = int(sr * 0.35)
    t = np.arange(n) / sr
    f = 50 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / sr
    return np.sin(ph) * np.exp(-t * 11) * 0.95


def snare(sr, rng):
    n = int(sr * 0.22)
    t = np.arange(n) / sr
    noise = rng.uniform(-1, 1, n)
    noise = noise - np.concatenate([[0], noise[:-1]]) * 0.6
    body = np.sin(2 * np.pi * 205 * t) * np.exp(-t * 28) * 0.7
    return (noise * np.exp(-t * 20) * 0.65 + body) * 0.9


def hat(sr, rng, open_hat=False):
    dur = 0.28 if open_hat else 0.05
    n = int(sr * dur)
    t = np.arange(n) / sr
    noise = rng.uniform(-1, 1, n)
    noise = noise - np.concatenate([[0], noise[:-1]])
    noise = noise - np.concatenate([[0], noise[:-1]]) * 0.5
    return noise * np.exp(-t * (9 if open_hat else 75)) * 0.32


def chord_midi(root_pc, minor, base=57):
    root = base + ((root_pc - base) % 12)
    third = root + (3 if minor else 4)
    fifth = root + 7
    return [root, third, fifth]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("--bpm", type=float, default=96.0)
    ap.add_argument("--sr", type=int, default=22050)
    ap.add_argument("--stereo", action="store_true")
    ap.add_argument("--lead", type=float, default=0.37, help="тиша перед першим тактом, с")
    ap.add_argument("--bars", type=int, default=32)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--name", default="test")
    ap.add_argument("--drift", type=float, default=0.0, help="відносний дрейф темпу (0.002 = 0.2%)")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    sr = args.sr
    beat = 60.0 / args.bpm
    bar = beat * 4
    step = beat / 4
    total = args.lead + args.bars * bar + 1.5
    n = int(total * sr)
    mix = np.zeros(n)

    prog = [("A", True), ("F", False), ("C", False), ("G", False)]
    chords_truth = []

    pat = {
        "kick": [[0, 6, 10], [0, 3, 10, 14]],
        "snare": [[4, 12], [4, 12]],
        "hihat": [[0, 2, 4, 6, 8, 10, 12], [0, 2, 4, 6, 8, 10, 12]],
        "ohat": [[14], [14]],
    }
    intro_bars = 4
    outro_bars = 1

    k_s, sn_s = kick(sr), snare(sr, rng)
    h_c, h_o = hat(sr, rng, False), hat(sr, rng, True)

    def place(sample, t, gain=1.0):
        i = int(round(t * sr))
        if i >= n:
            return
        seg = sample[: n - i]
        mix[i:i + len(seg)] += seg * gain

    def tmap(t_nominal):
        return args.lead + t_nominal * (1.0 + args.drift * (t_nominal / (args.bars * bar)))

    for b in range(args.bars):
        root_name, minor = prog[b % 4]
        pcs = chord_midi(NOTE[root_name], minor)
        chords_truth.append(root_name + ("m" if minor else ""))
        t0 = tmap(b * bar)
        dur = bar * 0.98
        nn = int(dur * sr)
        pad = np.zeros(nn)
        for m in pcs:
            pad += saw_add(midi_to_hz(m), nn, sr, 7)
        pad *= env_ad(nn, sr, 0.15, 3.0) * 0.16
        k = max(1, int(sr / 2500))
        pad = np.convolve(pad, np.ones(k) / k, mode="same")
        i0 = int(t0 * sr)
        mix[i0:i0 + nn] += pad[: n - i0]
        bass_f = midi_to_hz(36 + ((NOTE[root_name] - 36) % 12))
        for hit in (0, 6, 10):
            tb = t0 + hit * step * (1.0 + args.drift * (b * bar / (args.bars * bar)))
            nb = int(beat * 0.9 * sr)
            tt = np.arange(nb) / sr
            bs = np.sin(2 * np.pi * bass_f * tt) * np.exp(-tt * 3.5) * 0.35
            place(bs, tb)

        has_drums = intro_bars <= b < args.bars - outro_bars
        if has_drums:
            pi = (b - intro_bars) % 2
            for inst, sample, gain in (("kick", k_s, 0.9), ("snare", sn_s, 0.75), ("hihat", h_c, 0.8), ("ohat", h_o, 0.8)):
                for s in pat[inst][pi]:
                    tt = tmap(b * bar + s * step)
                    place(sample, tt, gain)

    mix += rng.normal(0, 0.002, n)
    mix = np.tanh(mix * 1.1)
    mix /= max(1e-6, np.max(np.abs(mix))) / 0.9

    os.makedirs(args.out_dir, exist_ok=True)
    wav_path = os.path.join(args.out_dir, f"{args.name}.wav")
    ch = 2 if args.stereo else 1
    data = np.stack([mix, mix * 0.97], axis=1) if args.stereo else mix[:, None]
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(ch)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())

    truth = {
        "bpm": args.bpm,
        "key": "A minor",
        "firstDownbeatSec": args.lead,
        "bars": args.bars,
        "chords": chords_truth,
        "chordLoop": ["Am", "F", "C", "G"],
        "drumLoopBars": 2,
        "drumLoop": pat,
        "introBars": intro_bars,
        "drift": args.drift,
    }
    with open(os.path.join(args.out_dir, f"{args.name}.json"), "w") as f:
        json.dump(truth, f, indent=2)
    print("written", wav_path, f"{total:.1f}s")


if __name__ == "__main__":
    main()
