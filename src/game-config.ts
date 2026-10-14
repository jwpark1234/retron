// 창세기전2 설정. 원본 번들(Daum SVN DOSBox)의 설정에서 필요한 부분만 옮겼다.
export const GAME_ID = "genesis2";
export const TITLE = "창세기전2";
export const ENTRY = "GENE2.COM";
export const HDD_DIR = "GENESIS2";
export const CD_DIR = "CD";
export const SAVE_FILES = /^(BLACKBOX\.SV\d|GENESIS\.QSV)$/i;

export const DOSBOX_CONF = `[sdl]
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

[autoexec]
mount c ${HDD_DIR}
imgmount d ${CD_DIR}/GENE2.CUE -t iso
c:
GENE2
`;

// 모바일 가상 키 (js-dos 키 코드)
export const VIRTUAL_KEYS: { label: string; key: number }[] = [
  { label: "ESC", key: 256 },
  { label: "Enter", key: 257 },
  { label: "Space", key: 32 },
];
