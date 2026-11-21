import type {
  DecodeFile,
  DecodeRequest,
  DecodedImage,
  Disposable,
  ImageDecoderContribution,
  PluginHost,
} from '@tyto/plugin-api';

import { DECODED_MAX_BYTES } from './limits.js';
import { encodePng } from './png.js';
import { drawComposite, drawLayer } from './psd.js';
import { readWholeFile } from './read-file.js';

/** The decoder's id, which the host names in an error and in its cache folder. */
export const DECODER_ID = 'psd';

type Answer = Awaited<ReturnType<ImageDecoderContribution['decode']>>;

/**
 * The plugin's entry point: one `image-decoder` for `.psd` (Tyto ADR 0223). A brief that cites
 * `arte.psd` gets the file's stored composite; `arte.psd#layer` gets that layer, placed on the
 * document's canvas.
 */
export function activate(host: PluginHost): Disposable {
  return host.registerImageDecoder({
    id: DECODER_ID,
    extensions: ['.psd'],
    decode: (file, request) => decodePsd(host, file, request),
  });
}

async function decodePsd(
  host: PluginHost,
  file: DecodeFile,
  request: DecodeRequest,
): Promise<Answer> {
  const bytes = await readWholeFile(host.decoding, file);
  const drawn =
    request.layer === undefined ? drawComposite(bytes) : drawLayer(bytes, request.layer);
  if (!drawn.ok) return failed(file, drawn.problem);
  const png = encodePng(drawn.image);
  // The wire refuses a bigger answer with a message about the wire; this one says what to do.
  if (png.length > DECODED_MAX_BYTES) {
    const mebibytes = (png.length / 2 ** 20).toFixed(1);
    return failed(
      file,
      `the picture is ${mebibytes} MiB as a PNG, more than the ` +
        `${DECODED_MAX_BYTES / 2 ** 20} MiB a decoded picture may weigh; ` +
        'make the document smaller or name a smaller layer',
    );
  }
  const image: DecodedImage = { bytes: png };
  return { ok: true, value: image, diagnostics: [] };
}

/**
 * The host puts this message inside its own `E_ASSET_DECODE_FAILED` ("…could not be decoded by
 * plugin 'psd': <message>."), so it starts lowercase and ends with no stop.
 */
function failed(file: DecodeFile, problem: string): Answer {
  return {
    ok: false,
    error: [
      { severity: 'error', code: 'E_ASSET_DECODE_FAILED', message: `${file.name}: ${problem}` },
    ],
  };
}
