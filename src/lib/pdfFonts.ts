import type jsPDF from 'jspdf';

/**
 * The three faces the printed package uses. A jsPDF built-in font is never
 * selected: they are WinAnsi, have no 'č', and fail silently.
 *
 * EB Garamond SemiBold is registered as the 'bold' style of the same family so
 * that setFont('EBGaramond', 'bold') picks it up.
 */
export const GARAMOND = 'EBGaramond';
export const MONO = 'JetBrainsMono';

interface FontFile {
  url: string;
  /** Name the TTF is filed under inside the PDF's virtual file system. */
  vfs: string;
  family: string;
  style: 'normal' | 'bold';
}

const FONT_FILES: FontFile[] = [
  {
    url: '/fonts/EBGaramond-Regular.ttf',
    vfs: 'EBGaramond-Regular.ttf',
    family: GARAMOND,
    style: 'normal',
  },
  {
    url: '/fonts/EBGaramond-SemiBold.ttf',
    vfs: 'EBGaramond-SemiBold.ttf',
    family: GARAMOND,
    style: 'bold',
  },
  {
    url: '/fonts/JetBrainsMono-Regular.ttf',
    vfs: 'JetBrainsMono-Regular.ttf',
    family: MONO,
    style: 'normal',
  },
];

/**
 * String.fromCharCode over a whole 490 KB buffer throws — the argument list is
 * the limit, not the string. 8 KB at a time is well under every engine's cap.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
}

/**
 * The 1.1 MB of TTF is fetched once per page load, not once per export — the
 * promise itself is the cache, so two exports in flight at the same time still
 * share a single download.
 */
let loading: Promise<string[]> | null = null;

function loadFontData(): Promise<string[]> {
  if (!loading) {
    loading = Promise.all(FONT_FILES.map((f) => fetchAsBase64(f.url))).catch((err) => {
      loading = null; // a failed load must not poison every later export
      throw err;
    });
  }
  return loading;
}

/** Starts the download without needing a document yet. Ignoring it is safe. */
export function preloadPdfFonts(): Promise<unknown> {
  return loadFontData();
}

export interface PdfFonts {
  serif: string;
  mono: string;
}

/** Registers all three faces on `doc`. Call once, before the first page is drawn. */
export async function registerPdfFonts(doc: jsPDF): Promise<PdfFonts> {
  const data = await loadFontData();
  FONT_FILES.forEach((file, i) => {
    doc.addFileToVFS(file.vfs, data[i]);
    doc.addFont(file.vfs, file.family, file.style);
  });
  return { serif: GARAMOND, mono: MONO };
}
