import { replaceConfigsAfterSync } from "../storage/db.js";
import { normalizeConfig } from "../config/normalize-config.js";

export async function syncConfigsFromDirectory(directoryHandle) {
  const permission = await directoryHandle.queryPermission({ mode: "read" });
  if (permission !== "granted") {
    const requested = await directoryHandle.requestPermission({ mode: "read" });
    if (requested !== "granted") {
      throw new Error("Folder access was not granted.");
    }
  }

  const configs = await readConfigs(directoryHandle);
  const importedAt = Date.now();
  const ruleCount = configs.reduce((sum, config) => sum + config.rules.length, 0);
  for (const config of configs) {
    config.importedAt = importedAt;
  }
  const meta = {
    key: "sync",
    lastSyncAt: importedAt,
    folderName: directoryHandle.name,
    configCount: configs.length,
    ruleCount
  };
  await replaceConfigsAfterSync(configs, meta);
  return { configs, meta };
}

async function readConfigs(directoryHandle) {
  const files = [];
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
      files.push(entry);
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  const configs = [];
  const configFiles = new Map();
  for (const entry of files) {
    const file = await entry.getFile();
    let value;
    try {
      value = JSON.parse(await file.text());
    } catch (error) {
      throw new Error(`${entry.name}: ${messageOf(error)}`);
    }
    const config = normalizeConfig(value, entry.name);
    if (configFiles.has(config.id)) {
      throw new Error(`Duplicate config id "${config.id}":\n${configFiles.get(config.id)}\n${entry.name}`);
    }
    configFiles.set(config.id, entry.name);
    configs.push({
      ...config,
      formatVersion: 3,
      sourceFile: entry.name,
      fileLastModified: file.lastModified,
      importedAt: 0
    });
  }
  return configs;
}

function messageOf(error) { return error instanceof Error ? error.message : String(error); }
