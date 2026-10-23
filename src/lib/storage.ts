import fs from "node:fs/promises";
import path from "node:path";
export interface StorageAdapter {
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
}
class LocalStorage implements StorageAdapter {
  private root = path.resolve(
    /* turbopackIgnore: true */ process.env.STORAGE_PATH || "storage",
  );
  private filename(key: string) {
    if (!/^[a-zA-Z0-9-]+\.webp$/.test(key))
      throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }
  async write(key: string, data: Buffer) {
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(this.filename(key), data, { flag: "wx" });
  }
  async read(key: string) {
    return fs.readFile(this.filename(key));
  }
}
export function storage(): StorageAdapter {
  if (process.env.STORAGE_DRIVER && process.env.STORAGE_DRIVER !== "local")
    throw new Error(
      "Configure an implemented storage adapter before changing STORAGE_DRIVER.",
    );
  return new LocalStorage();
}
