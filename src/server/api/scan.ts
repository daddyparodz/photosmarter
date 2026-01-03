import { format } from 'date-fns';
import sanitize from 'sanitize-filename';
import fileService from '~/server/services/file-service';
import photosmartService, {
  PhotosmartScanDimensions,
  PhotosmartScanCapabilities,
  PhotosmartScanOptions,
  PhotosmartScanResolutions,
  PhotosmartScanResult,
} from '~/server/services/photosmart-service';

export type ScanResult = {
  success: boolean;
  message: string;
};

export type ScanCapabilities = PhotosmartScanCapabilities;

const parseDimension = (
  value: string | null,
): { width: number; height: number } | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d+)x(\d+)$/);
  if (match) {
    const width = Number.parseInt(match[1], 10);
    const height = Number.parseInt(match[2], 10);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }

  if (value in PhotosmartScanDimensions) {
    return PhotosmartScanDimensions[
      value as keyof typeof PhotosmartScanDimensions
    ];
  }

  return undefined;
};

const normalizeColorMode = (
  value: string | null,
): PhotosmartScanOptions['colorMode'] | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'color' || normalized === 'rgb24') {
    return 'Color';
  }
  if (normalized === 'grayscale' || normalized === 'grayscale8') {
    return 'Grayscale';
  }
  if (
    normalized === 'black' ||
    normalized === 'blackandwhite' ||
    normalized === 'blackandwhite1'
  ) {
    return 'BlackAndWhite';
  }

  return undefined;
};

export const scanCapabilities = async (): Promise<ScanCapabilities> => {
  return photosmartService.capabilities();
};

export const scan = async (form: FormData): Promise<ScanResult> => {
  const type = form.get('type') as PhotosmartScanOptions['type'];
  const dimensionValue = form.get('dimension') as string | null;
  const resolutionValue = form.get('resolution') as string | null;
  const quality = Number.parseInt(form.get('quality') as string, 10);
  const colorModeValue = (form.get('colorMode') ??
    form.get('color')) as string | null;
  const preferredFileName = form.get('fileName') as string | null;

  const dimension =
    parseDimension(dimensionValue) ?? PhotosmartScanDimensions.A4;
  const resolution =
    Number.parseInt(resolutionValue ?? '', 10) ||
    PhotosmartScanResolutions.Text;
  const colorMode = normalizeColorMode(colorModeValue);

  const status = await photosmartService.status();
  if (status !== 'Idle') {
    const translatedStatus =
      status === 'BusyWithScanJob' ? 'busy' : 'unavailable';
    return {
      success: false,
      message:
        `Photosmart scanner is ${translatedStatus}, ` +
        'please try again later!',
    };
  }

  let result: PhotosmartScanResult | undefined;
  try {
    result = await photosmartService.scan({
      type,
      dimension,
      resolution,
      quality,
      colorMode,
    });
  } catch (error) {
    return {
      success: false,
      message: `Failed to scan ${type === 'PDF' ? 'document' : 'photo'}`,
    };
  }

  const { data, extension } = result;
  const safeFileName = !!preferredFileName?.trim()
    ? sanitize(preferredFileName)
    : format(new Date(), 'yyyyMMdd_HHmmss');
  const safeExtension = extension ?? 'unknown';

  try {
    const name = safeFileName.concat(
      !safeFileName.includes('.') ? `.${safeExtension}` : '',
    );
    await fileService.save(name, data);
  } catch (error) {
    return {
      success: false,
      message: 'Failed to save scanned file',
    };
  }

  return {
    success: true,
    message: 'Scan completed successfully',
  };
};
