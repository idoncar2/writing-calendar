import type { SerializedFileIndex } from "../index/file-index";
import type { TextVaultAdapter } from "./calendar-storage";

export interface CompressedFileIndex {
  formatVersion: 2;
  encoding: "gzip-base64";
  data: string;
}

export type StoredFileIndex = SerializedFileIndex | CompressedFileIndex;

export async function encodeFileIndex(index: SerializedFileIndex): Promise<StoredFileIndex> {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") return index;
  const json = JSON.stringify(index);
  const source = new Blob([json]);
  if (source.size < 256 * 1024) return index;
  const bytes = new Uint8Array(await new Response(
    source.stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer());
  // Chunking avoids the argument-count limit for large vaults.
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  const compressed: CompressedFileIndex = { formatVersion: 2, encoding: "gzip-base64", data: btoa(binary) };
  return JSON.stringify(compressed).length < source.size ? compressed : index;
}

export async function decodeFileIndex(value: unknown): Promise<unknown> {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object") throw new Error("文件索引格式无效，已停止加载以保护历史数据。");
  const stored = value as Partial<StoredFileIndex>;
  if (stored.formatVersion === 1 && Array.isArray(stored.snapshots)) return value;
  if (stored.formatVersion !== 2 || stored.encoding !== "gzip-base64" || typeof stored.data !== "string") {
    throw new Error("无法识别文件索引格式，请使用支持此数据格式的写作日历版本。");
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前 Obsidian 不支持读取压缩索引，请更新 Obsidian 后重试。");
  }
  try {
    const bytes = Uint8Array.from(atob(stored.data), (character) => character.charCodeAt(0));
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    const decoded: unknown = JSON.parse(json);
    if (!decoded || typeof decoded !== "object"
      || (decoded as SerializedFileIndex).formatVersion !== 1
      || !Array.isArray((decoded as SerializedFileIndex).snapshots)) {
      throw new Error("压缩内容不是有效的文件索引");
    }
    return decoded;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`文件索引解压失败，已停止加载，原文件未被覆盖：${detail}`);
  }
}

export async function backupBeforeIndexCompression(
  adapter: Pick<TextVaultAdapter, "exists" | "read" | "write">,
  pluginDir: string,
): Promise<void> {
  const sourcePath = `${pluginDir}/data.json`;
  if (!(await adapter.exists(sourcePath))) return;
  const original = await adapter.read(sourcePath);
  let backupPath = `${pluginDir}/data.pre-compression.json`;
  // Keep every existing backup. A different legacy file (e.g. restored by sync)
  // needs its own verified copy before it can be migrated again.
  for (let suffix = 1; await adapter.exists(backupPath); suffix++) {
    if (await adapter.read(backupPath) === original) return;
    backupPath = `${pluginDir}/data.pre-compression-${suffix}.json`;
  }
  await adapter.write(backupPath, original);
  if (await adapter.read(backupPath) !== original) {
    throw new Error("文件索引转换前备份校验失败，已取消保存。");
  }
}
