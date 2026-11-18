// Turning a text file's bytes into text, as the desktop's
// _read_text_with_fallback() does, with one difference the owner chose.
//
// First UTF-8, with a byte order mark at the start dropped. If the bytes
// are not valid UTF-8, the file is most likely an older Windows text file.
// The desktop reads those as Latin-1. The web app reads them as
// Windows-1252, which is the same except for bytes 0x80 to 0x9F: there
// Windows-1252 has curly quotes, dashes, the euro sign and a few letters,
// where Latin-1 has invisible control characters. So an old file's quotes
// come out as quotes. Decided on 2026-11-18, see
// docs/handoff/phase-5-progress.md.
//
// Neither step can fail: every byte means something in Windows-1252 (the
// five it leaves unassigned come out as the control character of the same
// number, as in Latin-1).

const UTF_8 = new TextDecoder('utf-8', { fatal: true });
const WINDOWS_1252 = new TextDecoder('windows-1252');

export function decodeText(bytes: Uint8Array): string {
  try {
    return UTF_8.decode(bytes);
  } catch {
    return WINDOWS_1252.decode(bytes);
  }
}
