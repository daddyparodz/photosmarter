import { action, useSubmission } from '@solidjs/router';
import { createEffect, createSignal, onMount, untrack } from 'solid-js';
import toast from 'solid-toast';
import '~/components/Scan/Scan.css';
import { scan, ScanCapabilities, ScanResult } from '~/server/api/scan';

const resolutionLabels: Record<number, string> = {
  600: 'High',
  300: 'Text',
  200: 'Photo',
  75: 'Screen',
};

const formatResolutionLabel = (dpi: number) => {
  const label = resolutionLabels[dpi];
  return label ? `${label} - ${dpi} dpi` : `Custom - ${dpi} dpi`;
};

const pickDefaultResolution = (resolutions: number[]) => {
  if (resolutions.length === 0) {
    return undefined;
  }
  return resolutions.includes(300) ? 300 : resolutions[0];
};

const performScan = action(async (form: FormData): Promise<ScanResult> => {
  'use server';
  return scan(form);
}, 'scan');

const fetchCapabilities = async (): Promise<ScanCapabilities> => {
  const response = await fetch('/api/scan/options');
  if (!response.ok) {
    throw new Error('Failed to load scan options');
  }
  return response.json();
};

export default () => {
  const [loading, setLoading] = createSignal<string>();
  const [quality, setQuality] = createSignal(80);
  const [fileName, setFileName] = createSignal('');
  const [capabilities, setCapabilities] = createSignal<ScanCapabilities>();
  const [format, setFormat] = createSignal<string>();
  const [dimension, setDimension] = createSignal<string>();
  const [resolution, setResolution] = createSignal<string>();
  const [colorMode, setColorMode] = createSignal<string>();
  const scanning = useSubmission(performScan);

  onMount(async () => {
    try {
      setCapabilities(await fetchCapabilities());
    } catch (error) {
      toast.error('Failed to load scan options');
    }
  });

  const handleSubmit = (event: Event) => {
    const name = prompt('Enter a file name');
    // Prompt was cancelled!
    if (name === null) {
      event.preventDefault();
      return;
    }

    setFileName(name);
  };

  createEffect(() => {
    if (scanning.pending) {
      const toastId = toast.loading('Scanning ...', {
        iconTheme: {
          primary: 'rgb(100, 100, 100)',
          secondary: 'rgb(180, 180, 180)',
        },
      });
      setLoading(toastId);
    } else {
      const loadingId = untrack(() => loading());
      if (loadingId !== undefined) {
        toast.dismiss(loadingId);
        setLoading(undefined);
      }
    }
  });

  createEffect(() => {
    if (scanning.result === undefined) {
      return;
    }

    if (scanning.result.success) {
      toast.success(scanning.result.message);
    } else {
      toast.error(scanning.result.message);
    }
  });

  createEffect(() => {
    if (!scanning.error) {
      return;
    }

    toast.error(`Scan failed (${scanning.error})`);
    scanning.clear();
  });

  createEffect(() => {
    const caps = capabilities();
    if (!caps) {
      return;
    }

    if (
      !format() ||
      !caps.formats.some((option) => option.value === format())
    ) {
      setFormat(caps.formats[0]?.value);
    }

    if (
      !dimension() ||
      !caps.dimensions.some((option) => option.value === dimension())
    ) {
      setDimension(caps.dimensions[0]?.value);
    }

    if (
      !resolution() ||
      !caps.resolutions.some(
        (option) => option.toString() === resolution(),
      )
    ) {
      const preferred = pickDefaultResolution(caps.resolutions);
      setResolution(preferred?.toString());
    }

    if (
      !colorMode() ||
      !caps.colorModes.some((option) => option.value === colorMode())
    ) {
      setColorMode(caps.colorModes[0]?.value);
    }
  });

  return (
    <form
      method="post"
      action={performScan}
      onSubmit={(event) => handleSubmit(event)}
    >
      <fieldset class="options">
        <legend class="options__legend">Options</legend>

        <input type="hidden" name="fileName" value={fileName()} />

        <label for="type-select" class="options__label">
          Format
        </label>
        <select
          id="type-select"
          name="type"
          class="options__select"
          required={true}
          disabled={scanning.pending || !capabilities()}
          value={format()}
          onChange={({ currentTarget }) => setFormat(currentTarget.value)}
        >
          {(capabilities()?.formats ?? []).map((option) => (
            <option value={option.value}>{option.label}</option>
          ))}
        </select>

        <label for="dimension-select" class="options__label">
          Paper size
        </label>
        <select
          id="dimension-select"
          name="dimension"
          class="options__select"
          required={true}
          disabled={scanning.pending || !capabilities()}
          value={dimension()}
          onChange={({ currentTarget }) => setDimension(currentTarget.value)}
        >
          {(capabilities()?.dimensions ?? []).map((option) => (
            <option value={option.value}>{option.label}</option>
          ))}
        </select>

        <label for="resolution-select" class="options__label">
          Resolution
        </label>
        <select
          id="resolution-select"
          name="resolution"
          class="options__select"
          required={true}
          disabled={scanning.pending || !capabilities()}
          value={resolution()}
          onChange={({ currentTarget }) => setResolution(currentTarget.value)}
        >
          {(capabilities()?.resolutions ?? []).map((option) => (
            <option value={option.toString()}>
              {formatResolutionLabel(option)}
            </option>
          ))}
        </select>

        <label for="color-select" class="options__label">
          Color preference
        </label>
        <select
          id="color-select"
          name="colorMode"
          class="options__select"
          required={true}
          disabled={scanning.pending || !capabilities()}
          value={colorMode()}
          onChange={({ currentTarget }) => setColorMode(currentTarget.value)}
        >
          {(capabilities()?.colorModes ?? []).map((option) => (
            <option value={option.value}>{option.label}</option>
          ))}
        </select>

        <label for="quality-range" class="options__label">
          Quality <strong>({quality()}%)</strong>
        </label>
        <input
          type="range"
          name="quality"
          id="quality-range"
          min={0}
          max={100}
          step={5}
          value={quality()}
          oninput={({ currentTarget }) => {
            setQuality(Number(currentTarget.value));
          }}
          required={true}
          disabled={scanning.pending}
        />
      </fieldset>

      <button
        type="submit"
        class="options__scan"
        disabled={scanning.pending || !capabilities()}
      >
        <span>Scan</span>
      </button>
    </form>
  );
};
