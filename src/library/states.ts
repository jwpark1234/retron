// 플랫폼 단 상태 저장 슬롯. games/{id}/states/{slot}.state(+ .png, .json)
import { gameDir } from "./library";
import { getFile, readJson, writeFile, writeJson } from "./store";

export const SLOTS = [1, 2, 3, 4];

export interface SlotInfo {
  slot: number;
  savedAt: number;
  thumb?: string; // object URL
}

const path = (id: string, slot: number, ext: string) => `${gameDir(id)}/states/${slot}.${ext}`;

export async function listSlots(id: string): Promise<(SlotInfo | null)[]> {
  return Promise.all(
    SLOTS.map(async (slot) => {
      const meta = await readJson<{ savedAt: number } | null>(path(id, slot, "json"), null);
      if (!meta) return null;
      const png = await getFile(path(id, slot, "png"));
      return { slot, savedAt: meta.savedAt, thumb: png ? URL.createObjectURL(png) : undefined };
    }),
  );
}

export async function writeSlot(id: string, slot: number, state: Uint8Array, thumb: Blob | null) {
  await writeFile(path(id, slot, "state"), state);
  if (thumb) await writeFile(path(id, slot, "png"), thumb);
  await writeJson(path(id, slot, "json"), { savedAt: Date.now() });
}

export async function readSlot(id: string, slot: number): Promise<Uint8Array | null> {
  const f = await getFile(path(id, slot, "state"));
  return f ? new Uint8Array(await f.arrayBuffer()) : null;
}
