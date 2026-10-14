"""Split a single-file MODE1/2352 + AUDIO cue/bin into ISO + per-track raw PCM (16-bit LE stereo 44.1kHz)."""
import os, re, sys

SECTOR = 2352


def parse_cue(cue_path):
    tracks = []
    for line in open(cue_path, encoding="ascii"):
        m = re.match(r"\s*TRACK (\d+) (\S+)", line)
        if m:
            tracks.append({"no": int(m[1]), "mode": m[2]})
        m = re.match(r"\s*INDEX 01 (\d+):(\d+):(\d+)", line)
        if m:
            mm, ss, ff = map(int, m.groups())
            tracks[-1]["start"] = (mm * 60 + ss) * 75 + ff
    return tracks


def main(cue_path, out_dir):
    bin_path = os.path.join(os.path.dirname(cue_path), re.search(r'FILE "([^"]+)"', open(cue_path).read())[1])
    total = os.path.getsize(bin_path) // SECTOR
    tracks = parse_cue(cue_path)
    os.makedirs(out_dir, exist_ok=True)
    with open(bin_path, "rb") as f:
        for i, t in enumerate(tracks):
            end = tracks[i + 1]["start"] if i + 1 < len(tracks) else total
            f.seek(t["start"] * SECTOR)
            if t["mode"] == "MODE1/2352":
                out = os.path.join(out_dir, "data.iso")
                with open(out, "wb") as o:
                    for _ in range(end - t["start"]):
                        o.write(f.read(SECTOR)[16:16 + 2048])
            else:
                out = os.path.join(out_dir, f"track{t['no']:02d}.raw")
                with open(out, "wb") as o:
                    o.write(f.read((end - t["start"]) * SECTOR))
            print(t["no"], t["mode"], end - t["start"], "sectors ->", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
