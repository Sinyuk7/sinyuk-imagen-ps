import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ConfigStorageAdapter, ProviderConfig } from '@imagen-ps/shared-commands';

/**
 * File-based ConfigStorageAdapter for CLI surface.
 * Persists provider configuration to ~/.imagen-ps/config.json using atomic writes.
 */
export class FileConfigAdapter implements ConfigStorageAdapter {
  private readonly configDir: string;
  private readonly configPath: string;
  private readonly tmpPath: string;

  constructor(configDir?: string) {
    this.configDir = configDir ?? path.join(os.homedir(), '.imagen-ps');
    this.configPath = path.join(this.configDir, 'config.json');
    this.tmpPath = path.join(this.configDir, 'config.json.tmp');
  }

  async get(providerId: string): Promise<ProviderConfig | undefined> {
    const data = this.readConfigFile();
    if (!data) return undefined;
    return data.providers[providerId] as ProviderConfig | undefined;
  }

  async save(providerId: string, config: ProviderConfig): Promise<void> {
    // Clean up residual tmp file from previous interrupted writes
    this.cleanupTmp();

    // Ensure config directory exists
    this.ensureDir();

    // Read existing config or create fresh
    const data = this.readConfigFile() ?? { version: 1, providers: {} };

    // Update the specific provider
    data.providers[providerId] = config;

    // Atomic write: write to tmp, then rename
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(this.tmpPath, content, 'utf-8');
    fs.renameSync(this.tmpPath, this.configPath);
  }

  private readConfigFile(): ConfigFile | undefined {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content) as ConfigFile;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }
  }

  private ensureDir(): void {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'EEXIST') {
        // Check if it's a file, not a directory
        const stat = fs.statSync(this.configDir);
        if (!stat.isDirectory()) {
          throw new Error(`Config directory path is occupied by a file: ${this.configDir}`);
        }
        return;
      }
      throw err;
    }
  }

  private cleanupTmp(): void {
    try {
      fs.unlinkSync(this.tmpPath);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return; // No tmp file to clean
      }
      throw err;
    }
  }
}

interface ConfigFile {
  version: number;
  providers: Record<string, ProviderConfig>;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
