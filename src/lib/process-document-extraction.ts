import { getCloudflareContext } from '@opennextjs/cloudflare';

export type ProcessSupportingDocumentExtraction = {
  text: string;
  method: 'plain-text' | 'workers-ai-markdown' | 'pptx-internal';
  truncated: boolean;
};

type MarkdownConversionResult = {
  format?: string;
  data?: string;
  error?: string;
};

type WorkersAiBinding = {
  toMarkdown: (
    input: { name: string; blob: Blob },
    options?: Record<string, unknown>
  ) => Promise<MarkdownConversionResult | MarkdownConversionResult[]>;
};

const MAX_EXTRACTED_CHARS = 90000;

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function clip(value: string) {
  const normalized = value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return {
    text: normalized.slice(0, MAX_EXTRACTED_CHARS),
    truncated: normalized.length > MAX_EXTRACTED_CHARS
  };
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function slideNumber(name: string) {
  const match = name.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateRaw(compressed: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('PPTX_DECOMPRESSION_UNAVAILABLE');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(bytes: Uint8Array) {
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('PPTX_INVALID_ZIP');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: Array<{ name: string; data: Uint8Array }> = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('PPTX_INVALID_CENTRAL_DIRECTORY');
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + fileNameLength);
    const name = decoder.decode(nameBytes);

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error('PPTX_INVALID_LOCAL_HEADER');
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error('PPTX_ENTRY_OUT_OF_RANGE');

    const compressed = bytes.subarray(dataStart, dataEnd);
    let data: Uint8Array;
    if (method === 0) {
      data = new Uint8Array(compressed);
    } else if (method === 8) {
      data = await inflateRaw(compressed);
    } else {
      data = new Uint8Array();
    }

    entries.push({ name, data });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function extractPptx(bytes: Uint8Array) {
  const entries = await unzipEntries(bytes);
  const decoder = new TextDecoder();
  const slides = entries
    .filter(item => /^ppt\/slides\/slide\d+\.xml$/i.test(item.name))
    .sort((a, b) => slideNumber(a.name) - slideNumber(b.name));

  const sections: string[] = [];
  for (const slide of slides) {
    let xml = decoder.decode(slide.data);
    xml = xml
      .replace(/<a:br\s*\/?\s*>/gi, '\n')
      .replace(/<\/a:p>/gi, '\n')
      .replace(/<a:t(?:\s[^>]*)?>/gi, '')
      .replace(/<\/a:t>/gi, ' ')
      .replace(/<[^>]+>/g, '');
    const text = decodeXmlEntities(xml)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim();
    if (text) {
      sections.push('--- Slide ' + slideNumber(slide.name) + ' ---\n' + text);
    }
  }

  if (!sections.length) throw new Error('PPTX_TEXT_NOT_FOUND');
  return sections.join('\n\n');
}

async function workersAiToText(fileName: string, mimeType: string, bytes: Uint8Array) {
  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as unknown as { AI?: WorkersAiBinding }).AI;
  if (!ai?.toMarkdown) throw new Error('DOCUMENT_CONVERTER_UNAVAILABLE');

  const result = await ai.toMarkdown(
    {
      name: fileName,
      blob: new Blob([bytes], { type: mimeType || 'application/octet-stream' })
    },
    {
      conversionOptions: {
        output: { format: 'text' },
        pdf: { metadata: false },
        image: { descriptionLanguage: 'id' }
      }
    }
  );

  const item = Array.isArray(result) ? result[0] : result;
  if (!item || item.format === 'error' || typeof item.data !== 'string') {
    throw new Error('DOCUMENT_CONVERSION_FAILED');
  }
  return item.data;
}

export async function extractProcessSupportingDocument(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ProcessSupportingDocumentExtraction> {
  const ext = extensionOf(input.fileName);

  if (ext === 'txt') {
    const clipped = clip(new TextDecoder().decode(input.bytes));
    if (!clipped.text) throw new Error('DOCUMENT_TEXT_EMPTY');
    return { ...clipped, method: 'plain-text' };
  }

  if (ext === 'pptx') {
    const clipped = clip(await extractPptx(input.bytes));
    if (!clipped.text) throw new Error('DOCUMENT_TEXT_EMPTY');
    return { ...clipped, method: 'pptx-internal' };
  }

  const converted = await workersAiToText(input.fileName, input.mimeType, input.bytes);
  const clipped = clip(converted);
  if (!clipped.text) throw new Error('DOCUMENT_TEXT_EMPTY');
  return { ...clipped, method: 'workers-ai-markdown' };
}
