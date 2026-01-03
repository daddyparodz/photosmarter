import axios from 'axios';
import { load } from 'cheerio';
import { extension } from 'mime-types';
import { clamp, env } from '~/server/common/util';

export const PhotosmartScanResolutions = {
  High: 600,
  Text: 300,
  Photo: 200,
  Screen: 75,
};

export const PhotosmartScanDimensions = {
  A4: {
    width: 2_480,
    height: 3_508,
  },
  Letter: {
    width: 2_550,
    height: 3_300,
  },
};

const ScanDimensionPresets = [
  {
    key: 'A4',
    label: 'A4 (210x297 mm)',
    width: 2_480,
    height: 3_508,
  },
  {
    key: 'Letter',
    label: 'Letter (8.5x11 in)',
    width: 2_550,
    height: 3_300,
  },
  {
    key: '4x6',
    label: '4x6 in',
    width: 1_200,
    height: 1_800,
  },
  {
    key: '5x7',
    label: '5x7 in',
    width: 1_500,
    height: 2_100,
  },
  {
    key: '10x15',
    label: '10x15 cm',
    width: 1_181,
    height: 1_772,
  },
];

export const PhotosmartScanQualities = {
  Low: 25,
  Medium: 65,
  High: 85,
  Maximum: 100,
};

export type PhotosmartScanOptions = {
  /**
   * Defaults to {@link PhotosmartScanResolutions.Text}.
   */
  resolution?: number;
  /**
   * Defaults to {@link PhotosmartScanDimensions.A4}.
   */
  dimension?: {
    width: number;
    height: number;
  };
  /**
   * Defaults to `Color`.
   */
  colorMode?: 'Color' | 'Grayscale' | 'BlackAndWhite';
  /**
   * Defaults to `PDF`.
   */
  type?: 'PDF' | 'JPEG';
  /**
   * Defaults to {@link PhotosmartScanQualities.Maximum}.
   */
  quality?: number;
};

export type PhotosmartStatus = 'Idle' | 'BusyWithScanJob';

export type PhotosmartScanResult = {
  extension?: string;
  data: ArrayBuffer;
};

export type PhotosmartScanCapabilities = {
  formats: Array<{ value: 'PDF' | 'JPEG'; label: string }>;
  colorModes: Array<{
    value: 'Color' | 'Grayscale' | 'BlackAndWhite';
    label: string;
  }>;
  resolutions: number[];
  dimensions: Array<{
    value: string;
    label: string;
    width: number;
    height: number;
  }>;
};

class PhotosmartService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = env('PHOTOSMART_URL');
  }

  async capabilities(): Promise<PhotosmartScanCapabilities> {
    const fallback = this.getFallbackCapabilities();
    try {
      return await this.fetchEsclCapabilities(fallback);
    } catch (error) {
      console.error('[PhotosmartService] Failed to retrieve capabilities!');
      console.error('[PhotosmartService] Original error:', error);
      return fallback;
    }
  }

  async status(): Promise<PhotosmartStatus | undefined> {
    try {
      const response = await axios.get<string>(
        this.baseUrl.concat('/eSCL/ScannerStatus'),
      );
      const match = response.data.match(/<pwg:State>([^<]+)<\/pwg:State>/);
      if (match) {
        return match[1] === 'Idle' ? 'Idle' : 'BusyWithScanJob';
      }
    } catch (error) {
      console.error(
        '[PhotosmartService] Failed to retrieve eSCL scanner status!',
      );
      console.error('[PhotosmartService] Original error:', error);
    }

    const url = this.baseUrl.concat('/Scan/Status');
    try {
      const response = await axios.get<string>(url);

      const $ = load(response.data);
      const status = $('ScannerState').first().text();
      return status as PhotosmartStatus;
    } catch (error) {
      console.error('[PhotosmartService] Failed to retrieve scanner status!');
      console.error('[PhotosmartService] Original error:', error);
      return undefined;
    }
  }

  async scan(options?: PhotosmartScanOptions): Promise<PhotosmartScanResult> {
    const normalizedOptions: Required<PhotosmartScanOptions> = {
      resolution: options?.resolution ?? PhotosmartScanResolutions.Text,
      dimension: options?.dimension ?? PhotosmartScanDimensions.A4,
      type: options?.type ?? 'PDF',
      quality: clamp(
        0,
        options?.quality ?? PhotosmartScanQualities.Maximum,
        100,
      ),
      colorMode: options?.colorMode ?? 'Color',
    };

    try {
      return await this.scanEscl(normalizedOptions);
    } catch (error) {
      console.error('[PhotosmartService] eSCL scan failed!');
      console.error('[PhotosmartService] Original error:', error);
      if (normalizedOptions.type === 'PDF') {
        throw error;
      }
    }

    return this.scanLegacy(normalizedOptions);
  }

  private async scanEscl(
    options: Required<PhotosmartScanOptions>,
  ): Promise<PhotosmartScanResult> {
    const url = this.baseUrl.concat('/eSCL/ScanJobs');
    const xml = this.createEsclScanJob(options);

    const response = await axios.post<void>(url, xml, {
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xml, 'utf-8').toString(),
      },
    });

    if (response.status !== 201) {
      throw new Error(
        `Failed sending eSCL scan job (${response.status} ${response.statusText})`,
      );
    }

    const location = response.headers.location;
    if (typeof location !== 'string' || location.length === 0) {
      throw new Error('eSCL job location could not be determined');
    }

    const jobUrl = location.startsWith('http')
      ? location
      : this.baseUrl.concat(location);

    const binaryResponse = await axios.get<ArrayBuffer>(
      `${jobUrl}/NextDocument`,
      {
        responseType: 'arraybuffer',
      },
    );

    const contentType = binaryResponse.headers['content-type'];

    return {
      extension:
        typeof contentType === 'string'
          ? extension(contentType) || undefined
          : undefined,
      data: binaryResponse.data,
    };
  }

  private async scanLegacy(
    options: Required<PhotosmartScanOptions>,
  ): Promise<PhotosmartScanResult> {
    const url = this.baseUrl.concat('/Scan/Jobs');
    const xml = this.createScanJob(options);

    const response = await axios.post<void>(url, xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Length': Buffer.byteLength(xml, 'utf-8').toString(),
      },
    });
    if (response.status !== 201) {
      throw new Error(
        `Failed sending scan job (${response.status} ${response.statusText})`,
      );
    }

    // The binary URL should always exist and since we just requested a scan,
    // there should be only a single scan job.
    const [binaryUrl] = await this.fetchIncompleteBinaryUrls();
    if (binaryUrl === undefined) {
      throw new Error('Binary URL could not be determined');
    }

    const binaryResponse = await axios.get<ArrayBuffer>(
      this.baseUrl.concat(binaryUrl),
      {
        responseType: 'arraybuffer',
      },
    );

    const contentType = binaryResponse.headers['content-type'];

    return {
      extension:
        typeof contentType === 'string'
          ? extension(contentType) || undefined
          : undefined,
      data: binaryResponse.data,
    };
  }

  private async fetchIncompleteBinaryUrls() {
    const url = this.baseUrl.concat('/Jobs/JobList');

    const response = await fetch(url, {
      method: 'GET',
    });
    const xml = await response.text();
    const $ = load(xml);

    const urls: string[] = [];

    for (const element of $('ScanJob')) {
      const $element = $(element);

      const state = $element.find('PageState').first().text();
      if (state === 'Completed') {
        continue;
      }

      const url = $element.find('BinaryURL').first().text();
      if (url) {
        urls.push(url);
      }
    }

    return urls;
  }

  private createScanJob(options: Required<PhotosmartScanOptions>): string {
    const format = options.type === 'PDF' ? 'Pdf' : 'Jpeg';
    const contentType = options.type === 'PDF' ? 'Document' : 'Photo';
    const compressionFactor = 100 - options.quality;
    const color = options.colorMode === 'Color' ? 'Color' : 'Gray';

    return `
      <scan:ScanJob xmlns:scan="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19"
        xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
        <scan:XResolution>${options.resolution}</scan:XResolution>
        <scan:YResolution>${options.resolution}</scan:YResolution>
        <scan:XStart>0</scan:XStart>
        <scan:YStart>0</scan:YStart>
        <scan:Width>${options.dimension.width}</scan:Width>
        <scan:Height>${options.dimension.height}</scan:Height>
        <scan:Format>${format}</scan:Format>
        <scan:CompressionQFactor>${compressionFactor}</scan:CompressionQFactor>
        <scan:ColorSpace>${color}</scan:ColorSpace>
        <scan:BitDepth>8</scan:BitDepth>
        <scan:InputSource>Platen</scan:InputSource>
        <scan:GrayRendering>NTSC</scan:GrayRendering>
        <scan:ToneMap>
            <scan:Gamma>1000</scan:Gamma>
            <scan:Brightness>800</scan:Brightness>
            <scan:Contrast>800</scan:Contrast>
            <scan:Highlite>179</scan:Highlite>
            <scan:Shadow>25</scan:Shadow>
        </scan:ToneMap>
        <scan:ContentType>${contentType}</scan:ContentType>
      </scan:ScanJob>
    `;
  }

  private createEsclScanJob(options: Required<PhotosmartScanOptions>): string {
    const colorMode =
      options.colorMode === 'Color'
        ? 'RGB24'
        : options.colorMode === 'BlackAndWhite'
          ? 'BlackAndWhite1'
          : 'Grayscale8';
    const intent = options.type === 'PDF' ? 'Document' : 'Photo';
    const documentFormat =
      options.type === 'PDF' ? 'application/pdf' : 'image/jpeg';

    return `
      <scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
        xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
        <pwg:Version>2.62</pwg:Version>
        <scan:Intent>${intent}</scan:Intent>
        <scan:ColorMode>${colorMode}</scan:ColorMode>
        <scan:XResolution>${options.resolution}</scan:XResolution>
        <scan:YResolution>${options.resolution}</scan:YResolution>
        <scan:DocumentFormatExt>${documentFormat}</scan:DocumentFormatExt>
        <scan:InputSource>Platen</scan:InputSource>
        <scan:ScanRegions>
          <scan:ScanRegion>
            <scan:Width>${options.dimension.width}</scan:Width>
            <scan:Height>${options.dimension.height}</scan:Height>
            <scan:XOffset>0</scan:XOffset>
            <scan:YOffset>0</scan:YOffset>
          </scan:ScanRegion>
        </scan:ScanRegions>
      </scan:ScanSettings>
    `;
  }

  private getFallbackCapabilities(): PhotosmartScanCapabilities {
    return {
      formats: [
        { value: 'PDF', label: 'PDF' },
        { value: 'JPEG', label: 'JPEG' },
      ],
      colorModes: [
        { value: 'Color', label: 'Color' },
        { value: 'Grayscale', label: 'Grayscale' },
        { value: 'BlackAndWhite', label: 'Black and white' },
      ],
      resolutions: Object.values(PhotosmartScanResolutions).sort(
        (a, b) => a - b,
      ),
      dimensions: ScanDimensionPresets.map((preset) => ({
        value: `${preset.width}x${preset.height}`,
        label: preset.label,
        width: preset.width,
        height: preset.height,
      })),
    };
  }

  private async fetchEsclCapabilities(
    fallback: PhotosmartScanCapabilities,
  ): Promise<PhotosmartScanCapabilities> {
    const url = this.baseUrl.concat('/eSCL/ScannerCapabilities');
    const response = await axios.get<string>(url);
    const xml = response.data;
    const $ = load(xml, { xmlMode: true });

    const colorModes = new Map<
      PhotosmartScanCapabilities['colorModes'][number]['value'],
      string
    >();
    $('scan\\:ColorMode').each((_, element) => {
      const value = $(element).text().trim();
      if (value === 'RGB24') {
        colorModes.set('Color', 'Color');
      } else if (value === 'Grayscale8') {
        colorModes.set('Grayscale', 'Grayscale');
      } else if (value === 'BlackAndWhite1') {
        colorModes.set('BlackAndWhite', 'Black and white');
      }
    });

    const resolutions = new Set<number>();
    $('scan\\:DiscreteResolution scan\\:XResolution').each((_, element) => {
      const value = Number.parseInt($(element).text().trim(), 10);
      if (!Number.isNaN(value)) {
        resolutions.add(value);
      }
    });

    const formats = new Map<
      PhotosmartScanCapabilities['formats'][number]['value'],
      string
    >();
    $('scan\\:DocumentFormatExt').each((_, element) => {
      const value = $(element).text().trim().toLowerCase();
      if (value === 'application/pdf') {
        formats.set('PDF', 'PDF');
      } else if (value === 'image/jpeg') {
        formats.set('JPEG', 'JPEG');
      }
    });

    const minWidth = Number.parseInt(
      $('scan\\:MinWidth').first().text().trim(),
      10,
    );
    const maxWidth = Number.parseInt(
      $('scan\\:MaxWidth').first().text().trim(),
      10,
    );
    const minHeight = Number.parseInt(
      $('scan\\:MinHeight').first().text().trim(),
      10,
    );
    const maxHeight = Number.parseInt(
      $('scan\\:MaxHeight').first().text().trim(),
      10,
    );

    const widthMin = Number.isNaN(minWidth) ? 0 : minWidth;
    const heightMin = Number.isNaN(minHeight) ? 0 : minHeight;
    const widthMax = Number.isNaN(maxWidth) ? Number.MAX_SAFE_INTEGER : maxWidth;
    const heightMax = Number.isNaN(maxHeight)
      ? Number.MAX_SAFE_INTEGER
      : maxHeight;

    const dimensions = ScanDimensionPresets.filter(
      (preset) =>
        preset.width >= widthMin &&
        preset.width <= widthMax &&
        preset.height >= heightMin &&
        preset.height <= heightMax,
    ).map((preset) => ({
      value: `${preset.width}x${preset.height}`,
      label: preset.label,
      width: preset.width,
      height: preset.height,
    }));

    const formatOrder: PhotosmartScanCapabilities['formats'][number]['value'][] =
      ['PDF', 'JPEG'];
    const colorOrder: PhotosmartScanCapabilities['colorModes'][number]['value'][] =
      ['Color', 'Grayscale', 'BlackAndWhite'];

    return {
      formats:
        formats.size > 0
          ? formatOrder
              .filter((value) => formats.has(value))
              .map((value) => ({
                value,
                label: formats.get(value) ?? value,
              }))
          : fallback.formats,
      colorModes:
        colorModes.size > 0
          ? colorOrder
              .filter((value) => colorModes.has(value))
              .map((value) => ({
                value,
                label: colorModes.get(value) ?? value,
              }))
          : fallback.colorModes,
      resolutions:
        resolutions.size > 0
          ? Array.from(resolutions).sort((a, b) => a - b)
          : fallback.resolutions,
      dimensions: dimensions.length > 0 ? dimensions : fallback.dimensions,
    };
  }
}

export default new PhotosmartService();
