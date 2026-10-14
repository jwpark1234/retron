"""Build a test CD: real data.iso + each audio track replaced by a sine tone (freq = 100 * track no. Hz)."""
import math, os, shutil, struct, sys

RATE = 44100
SECONDS = 20


def write_wav(path, freq):
    n = RATE * SECONDS
    frame = bytearray()
    for i in range(n):
        v = int(12000 * math.sin(2 * math.pi * freq * i / RATE))
        frame += struct.pack("<hh", v, v)
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(frame)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, RATE, RATE * 4, 4, 16))
        f.write(b"data" + struct.pack("<I", len(frame)) + frame)


def main(src_cd, out_dir, first=2, last=19):
    os.makedirs(out_dir, exist_ok=True)
    shutil.copyfile(os.path.join(src_cd, "data.iso"), os.path.join(out_dir, "DATA.ISO"))
    cue = ['FILE "DATA.ISO" BINARY', "  TRACK 01 MODE1/2048", "    INDEX 01 00:00:00"]
    for t in range(first, last + 1):
        name = f"TRACK{t:02d}.WAV"
        write_wav(os.path.join(out_dir, name), 100 * t)
        cue += [f'FILE "{name}" WAVE', f"  TRACK {t:02d} AUDIO", "    INDEX 01 00:00:00"]
    open(os.path.join(out_dir, "GENE2.CUE"), "w", newline="\r\n").write("\n".join(cue) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
