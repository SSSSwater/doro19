"""Render the original, softly looping music-box bed used on the birthday page."""

from pathlib import Path

import lameenc
import numpy as np


SAMPLE_RATE = 24_000
BEATS_PER_MINUTE = 76
BEAT = 60 / BEATS_PER_MINUTE
BAR = 4 * BEAT
BARS = 8
SAMPLES = round(SAMPLE_RATE * BAR * BARS)
OUTPUT = Path(__file__).resolve().parents[1] / "ambient-bgm.mp3"


def frequency(midi_note):
    return 440 * 2 ** ((midi_note - 69) / 12)


def add_note(track, midi_note, start_beat, length_beats, strength, voice, pan=0):
    seconds = (length_beats + (1.5 if voice == "pad" else 1.8)) * BEAT
    time = np.arange(round(seconds * SAMPLE_RATE), dtype=np.float64) / SAMPLE_RATE
    base = frequency(midi_note)

    if voice == "pad":
        tone = sum(weight * np.sin(2 * np.pi * base * harmonic * time)
                   for harmonic, weight in ((1, 1), (2, .19), (3, .045)))
        attack = 1 - np.exp(-time / .25)
        release = np.exp(-np.maximum(0, time - length_beats * BEAT) / .55)
        envelope = attack * release
    else:
        tone = sum(weight * np.sin(2 * np.pi * base * harmonic * time)
                   for harmonic, weight in ((1, 1), (2, .31), (3, .10), (4, .03)))
        attack = 1 - np.exp(-time / .008)
        envelope = attack * np.exp(-time / (.75 if voice == "bell" else .57))

    sound = strength * tone * envelope
    start = round(start_beat * BEAT * SAMPLE_RATE)
    positions = (start + np.arange(len(sound))) % SAMPLES
    left = np.sqrt((1 - pan) / 2)
    right = np.sqrt((1 + pan) / 2)
    np.add.at(track[:, 0], positions, sound * left)
    np.add.at(track[:, 1], positions, sound * right)


def main():
    track = np.zeros((SAMPLES, 2), dtype=np.float64)
    chords = [
        (48, (60, 64, 67, 71)),  # Cmaj7
        (47, (59, 62, 67, 71)),  # G/B
        (45, (57, 60, 64, 67)),  # Am7
        (41, (53, 57, 60, 64)),  # Fmaj7
        (50, (62, 65, 69, 72)),  # Dm7
        (52, (64, 67, 71, 74)),  # Em7
        (41, (53, 57, 60, 64)),  # Fmaj7
        (43, (55, 60, 62, 65)),  # Gsus4/G7
    ]
    arpeggio = (0, 2, 1, 3, 2, 1, 3, 1)
    for bar, (bass, chord) in enumerate(chords):
        origin = bar * 4
        add_note(track, bass, origin, 3.6, .045, "pad", -.18)
        add_note(track, chord[0], origin, 3.6, .023, "pad", .16)
        for step, index in enumerate(arpeggio):
            add_note(track, chord[index], origin + step * .5, .45,
                     .065 if step % 2 == 0 else .047, "bell", -.28 if step % 2 else .28)

    melody = ((0, 72), (1.5, 74), (3, 71), (5, 72), (6.5, 74),
              (9, 76), (10.5, 72), (12, 69), (14, 72),
              (17, 72), (18.5, 74), (20, 76), (22, 72),
              (25, 74), (26.5, 76), (28, 72), (30, 71))
    for beat, note in melody:
        add_note(track, note, beat, .8, .041, "bell", .08)

    # Circular room echoes let the last notes continue into the first bar.
    dry = track.copy()
    for seconds, amount, opposite_channel in ((.16, .12, True), (.31, .075, False), (.49, .045, True)):
        echo = np.roll(dry, round(seconds * SAMPLE_RATE), axis=0)
        track += amount * (echo[:, ::-1] if opposite_channel else echo)

    track *= .55 / max(np.max(np.abs(track)), 1e-8)
    pcm = np.int16(np.clip(track, -1, 1) * 32767)
    encoder = lameenc.Encoder()
    encoder.set_in_sample_rate(SAMPLE_RATE)
    encoder.set_channels(2)
    encoder.set_bit_rate(112)
    encoder.set_quality(2)
    OUTPUT.write_bytes(encoder.encode(pcm.tobytes()) + encoder.flush())
    print(f"Wrote {OUTPUT} ({SAMPLES / SAMPLE_RATE:.2f}s)")


if __name__ == "__main__":
    main()
