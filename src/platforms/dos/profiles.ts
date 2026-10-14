// DOS 게임 설정. 알려진 게임은 실행 파일 이름으로 알아보고 맞춤 설정을 쓴다.
export const HDD_DIR = "HDD";
export const CD_DIR = "CD";

export interface DosProfile {
  title: string;
  entry: string; // 이 파일이 있으면 이 게임으로 본다
  settings: string; // [autoexec] 앞부분
  savePattern?: string; // 세이브 파일 정규식 (없으면 자동 추적)
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
    savePattern: "^(BLACKBOX\\.SV\\d|GENESIS\\.QSV)$",
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

/** cd: CD 폴더 안의 이미지 파일 이름 (CD.CUE 또는 CD.ISO) */
export function buildConf(settings: string, exe: string, cd?: string) {
  const lines = ["[autoexec]", `mount c ${HDD_DIR}`];
  if (cd) lines.push(`imgmount d ${CD_DIR}/${cd} -t iso`);
  lines.push("c:", exe.toLowerCase().endsWith(".bat") ? `call ${exe}` : exe);
  return `${settings}\n${lines.join("\n")}\n`;
}

export { DEFAULT_SETTINGS };

// 게임 실행 파일 후보에서 뺄 것 (DOSBox 번들, 설치 프로그램 등)
const NOT_GAME = /^(dosbox.*|setup|install|uninst.*|config|setsound|sound|dos4gw|cwsdpmi|pkunzip|unins\d*)\.(exe|com|bat)$/i;

export function exeCandidates(paths: string[]): string[] {
  return paths
    .filter((p) => /\.(exe|com|bat)$/i.test(p) && !NOT_GAME.test(p.split("/").pop()!))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}
