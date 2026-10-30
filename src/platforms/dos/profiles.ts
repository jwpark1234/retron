// DOS 게임 설정. 알려진 게임은 실행 파일 이름으로 알아보고 맞춤 설정을 쓴다.
export const HDD_DIR = "HDD";
export const CD_DIR = "CD";

export interface DosProfile {
  title: string;
  entry: string; // 이 파일이 있으면 이 게임으로 본다
  settings: string; // [autoexec] 앞부분
  savePattern?: string; // 세이브 파일 정규식 (없으면 자동 추적)
  icon?: string; // 썸네일로 쓸 아이콘 파일
  /** 없으면 게임이 도중에 멈추는 파일과 그때 안 되는 것. 추가할 때 없으면 알린다 (사용자가 가진 zip에서 빠져 있던 적이 있다) */
  requires?: { files: string[]; what: string; breaks: string }; // what: 무슨 파일인지, breaks는 조사까지 ("'처음부터 시작'이")
}

const DEFAULT_SETTINGS = `[sdl]
autolock=false

[dosbox]
machine=svga_s3
memsize=16

[cpu]
core=auto
cputype=auto
cycles=auto

[sblaster]
sbtype=sb16
sbbase=220
irq=7
dma=1
hdma=5

[dos]
xms=true
ems=true
umb=true
`;

export const PROFILES: DosProfile[] = [
  {
    // 원본 번들(Daum SVN DOSBox)의 설정에서 필요한 부분만 옮겼다
    title: "창세기전2",
    entry: "GENE2.COM",
    icon: "GENESIS2.ICO",
    // BLACKBOX.DAT(진행 데이터)도 세이브와 같이 바뀐다. 크기가 그대로면 자동 추적에 안 걸려서 패턴에 넣는다
    savePattern: "^(BLACKBOX\\.(SV\\d|DAT)|GENESIS\\.QSV)$",
    // 타이틀(TTL.EXE)의 "처음부터 시작"이 BLACKBOX.DEF(새 게임 초기 데이터)를 읽는다. 없으면 "blackbox.def read error!"로 끝난다.
    // 세이브(BLACKBOX.SV1~5)·진행 데이터(BLACKBOX.DAT)와 이름이 비슷해서 세이브를 지우면서 같이 지운 일이 있었다
    requires: { files: ["BLACKBOX.DEF"], what: "세이브가 아니라 새 게임 초기 데이터입니다. 세이브(BLACKBOX.SV1~SV5, BLACKBOX.DAT)는 지워도 됩니다", breaks: "'처음부터 시작'이" },
    settings: `[sdl]
autolock=false

[dosbox]
machine=svga_s3
vmemsize=2
memsize=16

[cpu]
core=auto
cputype=auto
cycles=max

[mixer]
nosound=false
rate=44100
blocksize=1024
prebuffer=20

[sblaster]
sbtype=sb16
sbbase=220
irq=7
dma=1
hdma=5
sbmixer=true
oplmode=auto
oplemu=default
oplrate=44100

[speaker]
pcspeaker=true

[dos]
xms=true
ems=true
umb=true
`,
  },
];

export function findProfile(fileNames: string[]): DosProfile | undefined {
  const names = new Set(fileNames.map((n) => n.split("/").pop()!.toUpperCase()));
  return PROFILES.find((p) => names.has(p.entry));
}

/** 세이브 패턴. 알려진 게임은 지금 프로필 것을 쓴다 (추가할 때 게임에 복사해 둔 예전 패턴은 빠뜨린 파일이 있을 수 있다) */
export const savePatternOf = (dos: { exe: string; savePattern?: string }) =>
  PROFILES.find((p) => p.entry === dos.exe.split("/").pop()!.toUpperCase())?.savePattern ?? dos.savePattern;

/** cycles를 바꾼 settings (auto / max / 숫자). 비우면 그대로 */
export function withCycles(settings: string, cycles?: string) {
  if (!cycles) return settings;
  const line = `cycles=${cycles}`;
  if (/^cycles=.*$/m.test(settings)) return settings.replace(/^cycles=.*$/m, line);
  const cpu = /^\[cpu\][ \t]*$/m;
  return cpu.test(settings) ? settings.replace(cpu, `[cpu]\n${line}`) : `${settings}\n[cpu]\n${line}\n`;
}

/**
 * 휴대폰에서 쓸 cycles. max(창세기전2 기본값)와 auto(보호 모드 게임은 max로 바뀐다)는 CPU 한 코어를 쉬지 않고 써서
 * 20분 남짓 하면 휴대폰이 뜨거워지다 꺼졌다. 최대 속도의 절반까지만 쓰게 한다 (기기 성능에 맞춰 늘고 준다).
 * 사용자가 게임 설정에서 속도를 직접 골랐으면 그대로 둔다
 */
const PHONE_MAX = "50%";
export function phoneCycles(settings: string): string | undefined {
  const cycles = settings.match(/^cycles=(.*)$/m)?.[1].trim().toLowerCase() ?? "auto"; // 없으면 DOSBox-X 기본값 auto
  if (cycles === "max") return `max ${PHONE_MAX}`;
  if (cycles === "auto") return `auto 3000 ${PHONE_MAX}`; // 실제 모드는 auto 기본값(3000) 그대로
  return undefined;
}

const BS = String.fromCharCode(92); // DOS 경로 구분자 '\'

/** exe: C: 기준 경로, cd: CD 폴더 안의 이미지 파일 이름 (CD.CUE 또는 CD.ISO) */
export function buildConf(settings: string, exe: string, cd?: string) {
  const lines = ["[autoexec]", `mount c ${HDD_DIR}`];
  if (cd) lines.push(`imgmount d ${CD_DIR}/${cd} -t iso`);
  lines.push("c:");
  const parts = exe.split("/");
  const file = parts.pop()!;
  if (parts.length) lines.push(`cd ${BS}${parts.join(BS)}`);
  lines.push(file.toLowerCase().endsWith(".bat") ? `call ${file}` : file);
  return `${settings.trimEnd()}\n\n${lines.join("\n")}\n`;
}

export function splitConf(conf: string): { settings: string; exe: string; cd?: string } {
  const i = conf.indexOf("[autoexec]");
  const lines = conf.slice(i).split("\n").map((l) => l.trim()).filter(Boolean);
  const dirs = lines.filter((l) => l.toLowerCase().startsWith(`cd ${BS}`)).map((l) => l.slice(4).split(BS).join("/"));
  const file = lines[lines.length - 1].replace(/^call\s+/i, "");
  return {
    settings: conf.slice(0, i).trimEnd() + "\n",
    exe: [...dirs, file].join("/"),
    cd: lines.find((l) => /^imgmount d /i.test(l))?.match(/\/(\S+)\s/)?.[1],
  };
}

export { DEFAULT_SETTINGS };

// 게임 실행 파일 후보에서 뺄 것 (DOSBox 번들, 설치 프로그램 등)
const NOT_GAME = /^(dosbox.*|setup|install|uninst.*|config|setsound|sound|dos4gw|cwsdpmi|pkunzip|unins\d*)\.(exe|com|bat)$/i;

export function exeCandidates(paths: string[]): string[] {
  return paths
    .filter((p) => /\.(exe|com|bat)$/i.test(p) && !NOT_GAME.test(p.split("/").pop()!))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}
