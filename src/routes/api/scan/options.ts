import { CustomResponse, json } from '@solidjs/router';
import { scanCapabilities, ScanCapabilities } from '~/server/api/scan';

export async function GET(): Promise<CustomResponse<ScanCapabilities>> {
  const capabilities = await scanCapabilities();
  return json(capabilities);
}
