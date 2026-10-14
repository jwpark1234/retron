// Headless DOSBox-X run: boot the game with a test CD and report which CD audio track (by tone frequency) is heard.
const fs = require("fs");
const path = require("path");

global.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
require("emulators");
const emulators = global.emulators;
emulators.pathPrefix = path.join(__dirname, "../node_modules/emulators/dist/");

const [gameDir, cdDir, seconds = "90"] = process.argv.slice(2);

function collect(dir, prefix) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const rel = prefix + "/" + name;
    if (fs.statSync(p).isDirectory()) out.push(...collect(p, rel));
    else out.push({ path: rel, contents: new Uint8Array(fs.readFileSync(p)) });
  }
  return out;
}

// Goertzel power for the candidate track tones (100 Hz * track no.)
function dominantTrack(samples, rate) {
  let best = null;
  let total = 0;
  for (const s of samples) total += s * s;
  for (let t = 2; t <= 19; t++) {
    const w = (2 * Math.PI * 100 * t) / rate;
    const c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (const x of samples) {
      const s0 = x + c * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const p = s1 * s1 + s2 * s2 - c * s1 * s2;
    if (!best || p > best.p) best = { t, p };
  }
  const ratio = total > 0 ? best.p / (total * samples.length / 2) : 0;
  return { track: best.t, ratio, rms: Math.sqrt(total / samples.length) };
}

function writePpm(file, img) {
  const rgb = Buffer.alloc(img.width * img.height * 3);
  for (let i = 0, j = 0; i < img.width * img.height; i++) {
    rgb[j++] = img.data[i * 4];
    rgb[j++] = img.data[i * 4 + 1];
    rgb[j++] = img.data[i * 4 + 2];
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6 ${img.width} ${img.height} 255
`), rgb]));
}

(async () => {
  const files = [...collect(gameDir, "GENESIS2"), ...collect(cdDir, "CD")];
  const conf = fs.readFileSync(process.env.CONF || path.join(__dirname, "../config/dosbox.conf"), "utf8");
  const ci = await emulators.dosboxXNode([...files, { dosboxConf: conf, jsdosConf: { version: "js-dos-v8" } }]);
  const rate = ci.soundFrequency();
  console.log("started, sound freq", rate);

  ci.events().onStdout((m) => process.stdout.write("[stdout] " + m));
  ci.events().onMessage((type, ...args) => {
    console.log(`[${type}]`, args.join(" ").trim().slice(0, 200));
  });

  let buf = [];
  const start = Date.now();
  ci.events().onSoundPush((samples) => {
    for (const s of samples) buf.push(s);
    if (buf.length >= rate) {
      const sec = ((Date.now() - start) / 1000).toFixed(0);
      const r = dominantTrack(buf.slice(0, rate), rate);
      const label = r.rms < 0.003 ? "silent" : `best=track${r.track} purity=${r.ratio.toFixed(3)}`;
      console.log(`t=${sec}s rms=${r.rms.toFixed(4)} ${label}`);
      buf = [];
    }
  });

  // KEYS="sec:code,sec:code" presses keys at given seconds; SHOTS="sec,sec" saves screenshots
  for (const spec of (process.env.KEYS || "").split(",").filter(Boolean)) {
    const [sec, code] = spec.split(":").map(Number);
    setTimeout(() => { console.log(`key ${code} @${sec}s`); ci.simulateKeyPress(code); }, sec * 1000);
  }
  // CLICKS="sec:x:y" clicks at normalized screen coords
  for (const spec of (process.env.CLICKS || "").split(",").filter(Boolean)) {
    const [sec, x, y] = spec.split(":").map(Number);
    setTimeout(() => {
      console.log(`click ${x},${y} @${sec}s`);
      ci.sendMouseMotion(x, y);
      setTimeout(() => ci.sendMouseButton(0, true), 200);
      setTimeout(() => ci.sendMouseButton(0, false), 400);
    }, sec * 1000);
  }
  for (const sec of (process.env.SHOTS || "").split(",").filter(Boolean).map(Number)) {
    setTimeout(async () => writePpm(path.join(__dirname, `../game-data/shot-${sec}.ppm`), await ci.screenshot()), sec * 1000);
  }

  setTimeout(async () => {
    const shot = await ci.screenshot();
    writePpm(path.join(__dirname, "../game-data/shot.ppm"), shot);
    console.log("screenshot", shot.width, shot.height);
    await ci.exit();
    process.exit(0);
  }, Number(seconds) * 1000);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
