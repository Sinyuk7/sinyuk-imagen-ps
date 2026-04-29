import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProviderProfile, ProviderProfileRepository, SecretStorageAdapter } from '@imagen-ps/shared-commands';

interface ProviderProfilesFile {
  schemaVersion: 1;
  profiles: ProviderProfile[];
}

interface ProviderSecretsFile {
  schemaVersion: 1;
  secrets: Record<string, string>;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  try {
    fs.unlinkSync(tmpPath);
  } catch (err: unknown) {
    if (!isNodeError(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * CLI provider profile repository。
 *
 * INTENT: 使用新的 versioned provider profiles schema 持久化 CLI profiles。
 * INPUT: 可选 configDir；默认 `~/.imagen-ps`。
 * OUTPUT: `ProviderProfileRepository` contract。
 * SIDE EFFECT: 读写 Node filesystem，仅限 CLI surface。
 * FAILURE: 文件无法读取、JSON 无法解析或写入失败时抛出底层错误。
 */
export class FileProviderProfileRepository implements ProviderProfileRepository {
  private readonly profilesPath: string;

  constructor(configDir = path.join(os.homedir(), '.imagen-ps')) {
    this.profilesPath = path.join(configDir, 'provider-profiles.json');
  }

  async list(): Promise<readonly ProviderProfile[]> {
    return this.readFile().profiles;
  }

  async get(profileId: string): Promise<ProviderProfile | undefined> {
    return this.readFile().profiles.find((profile) => profile.profileId === profileId);
  }

  async save(profile: ProviderProfile): Promise<void> {
    const file = this.readFile();
    const index = file.profiles.findIndex((item) => item.profileId === profile.profileId);
    const profiles = [...file.profiles];
    if (index >= 0) {
      profiles[index] = profile;
    } else {
      profiles.push(profile);
    }
    writeJsonFileAtomic(this.profilesPath, { schemaVersion: 1, profiles } satisfies ProviderProfilesFile);
  }

  async delete(profileId: string): Promise<void> {
    const file = this.readFile();
    writeJsonFileAtomic(this.profilesPath, {
      schemaVersion: 1,
      profiles: file.profiles.filter((profile) => profile.profileId !== profileId),
    } satisfies ProviderProfilesFile);
  }

  private readFile(): ProviderProfilesFile {
    return readJsonFile<ProviderProfilesFile>(this.profilesPath) ?? { schemaVersion: 1, profiles: [] };
  }
}

/**
 * CLI secret storage adapter。
 *
 * 当前开发期实现使用单独 versioned JSON 文件保存 secret values，便于 CLI 无额外依赖运行。
 * Photoshop UXP 不复用该实现；UXP surface 应注入 secureStorage-backed adapter。
 */
export class FileSecretStorageAdapter implements SecretStorageAdapter {
  private readonly secretsPath: string;

  constructor(configDir = path.join(os.homedir(), '.imagen-ps')) {
    this.secretsPath = path.join(configDir, 'provider-secrets.json');
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.readFile().secrets[key];
  }

  async setSecret(key: string, value: string): Promise<void> {
    const file = this.readFile();
    writeJsonFileAtomic(this.secretsPath, {
      schemaVersion: 1,
      secrets: { ...file.secrets, [key]: value },
    } satisfies ProviderSecretsFile);
  }

  async deleteSecret(key: string): Promise<void> {
    const file = this.readFile();
    const { [key]: _deleted, ...secrets } = file.secrets;
    writeJsonFileAtomic(this.secretsPath, { schemaVersion: 1, secrets } satisfies ProviderSecretsFile);
  }

  private readFile(): ProviderSecretsFile {
    return readJsonFile<ProviderSecretsFile>(this.secretsPath) ?? { schemaVersion: 1, secrets: {} };
  }
}
