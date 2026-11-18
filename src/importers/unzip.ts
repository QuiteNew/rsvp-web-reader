// A small zip reader, enough for the parts of a Word file (.docx), which is
// a zip of XML files. It uses the browser's own DecompressionStream, so no
// library is needed. It reads the zip's directory at the end of the file,
// then unpacks one entry when asked.
//
// Only what Word files use: entries stored as they are (method 0) or
// compressed with deflate (method 8). Not encrypted entries and not the
// zip64 form for files over 4 GB. Those, and anything that does not add up,
// throw a ZipError.

export class ZipError extends Error {}

interface Entry {
  readonly method: number;
  readonly compressedSize: number;
  readonly localHeader: number;
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const output = input.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(output).arrayBuffer());
}

export class ZipArchive {
  private readonly bytes: Uint8Array<ArrayBuffer>;
  private readonly view: DataView;
  // Lower-case names, because the names of a Word file's parts do not
  // depend on case.
  private readonly entries = new Map<string, Entry>();

  constructor(bytes: Uint8Array<ArrayBuffer>) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = this.findEndOfDirectory();
    const count = this.view.getUint16(end + 10, true);
    let at = this.view.getUint32(end + 16, true);
    if (at === 0xffffffff) throw new ZipError('zip64 is not supported');
    const names = new TextDecoder('utf-8');
    for (let index = 0; index < count; index += 1) {
      if (this.uint32(at) !== DIRECTORY_ENTRY) throw new ZipError('broken zip directory');
      const flags = this.view.getUint16(at + 8, true);
      const nameLength = this.view.getUint16(at + 28, true);
      const extraLength = this.view.getUint16(at + 30, true);
      const commentLength = this.view.getUint16(at + 32, true);
      const name = names.decode(this.slice(at + 46, nameLength));
      this.entries.set(name.toLowerCase(), {
        method: (flags & 1) === 1 ? -1 : this.view.getUint16(at + 10, true),
        compressedSize: this.view.getUint32(at + 20, true),
        localHeader: this.view.getUint32(at + 42, true),
      });
      at += 46 + nameLength + extraLength + commentLength;
    }
  }

  /** The entry's bytes, or null if the zip has no entry by that name. */
  async read(name: string): Promise<Uint8Array | null> {
    const entry = this.entries.get(name.toLowerCase());
    if (entry === undefined) return null;
    const local = entry.localHeader;
    if (this.uint32(local) !== LOCAL_HEADER) throw new ZipError('broken zip entry');
    const start =
      local + 30 + this.view.getUint16(local + 26, true) + this.view.getUint16(local + 28, true);
    const data = this.slice(start, entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) {
      try {
        return await inflate(data);
      } catch {
        throw new ZipError('a zip entry could not be unpacked');
      }
    }
    throw new ZipError(`zip method ${entry.method} is not supported`);
  }

  /** The entry as UTF-8 text, or null if there is none. */
  async readText(name: string): Promise<string | null> {
    const data = await this.read(name);
    return data === null ? null : new TextDecoder('utf-8').decode(data);
  }

  private findEndOfDirectory(): number {
    // The record is 22 bytes, followed by a comment of up to 65,535 bytes.
    const last = this.bytes.length - 22;
    for (let at = last; at >= 0 && at >= last - 0xffff; at -= 1) {
      if (this.uint32(at) === END_OF_DIRECTORY) return at;
    }
    throw new ZipError('not a zip file');
  }

  private uint32(at: number): number {
    if (at < 0 || at + 4 > this.bytes.length) throw new ZipError('zip offset out of range');
    return this.view.getUint32(at, true);
  }

  private slice(start: number, length: number): Uint8Array<ArrayBuffer> {
    if (start < 0 || start + length > this.bytes.length) {
      throw new ZipError('zip entry out of range');
    }
    return this.bytes.subarray(start, start + length);
  }
}
