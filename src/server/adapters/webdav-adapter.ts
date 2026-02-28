import { join } from 'node:path';
import { AuthType, createClient, WebDAVClient } from 'webdav';
import { Adapter } from '~/server/adapters/adapter';
import { env, isDebugEnabled } from '~/server/common/util';

class WebDavAdapter extends Adapter {
  private directory!: string;
  private client!: WebDAVClient;
  private remoteUrl!: string;

  init(): void {
    this.directory = env('WEBDAV_DIR');

    this.remoteUrl = env('WEBDAV_REMOTE_URL');
    const username = env('WEBDAV_USERNAME');
    const password = env('WEBDAV_PASSWORD');

    this.client = createClient(this.remoteUrl, {
      authType: AuthType.Password,
      username,
      password,
    });
  }

  async saveFile(name: string, data: ArrayBuffer): Promise<void> {
    if (!(await this.client.exists(this.directory))) {
      await this.client.createDirectory(this.directory, { recursive: true });
    }

    const filepath = join(this.directory, name);
    try {
      await this.client.putFileContents(filepath, data, {
        overwrite: false,
      });
      if (isDebugEnabled()) {
        const safeRemoteUrl = new URL(this.remoteUrl);
        safeRemoteUrl.username = '';
        safeRemoteUrl.password = '';
        const base = safeRemoteUrl.toString().replace(/\/$/, '');
        const normalizedPath = filepath.replace(/\\/g, '/');
        const fullPath = normalizedPath.startsWith('/')
          ? `${base}${normalizedPath}`
          : `${base}/${normalizedPath}`;
        console.info(`[WebDavAdapter] Saved file: ${fullPath}`);
      }
    } catch (error) {
      console.error(
        `[WebDavAdapter] Failed to save file '${name}' ` +
          `in directory '${this.directory}'!`,
      );
      console.error('[WebDavAdapter] Original error:', error);
      throw error;
    }
  }
}

export default new WebDavAdapter();
