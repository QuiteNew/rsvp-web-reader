// Loads pdf.js, Mozilla's PDF reader, only when someone picks a PDF. It is
// the biggest part of importing (about 510 KB compressed, most of it the
// worker), so the reader's own download does not carry it.
//
// The worker is the part that reads the PDF, in a thread of its own, so a
// long PDF does not freeze the page. Its file is built into the site by
// Vite (the ?url import) and served from the site itself: nothing is
// fetched from anywhere else, and it will work offline once the site does.

export type Pdfjs = typeof import('pdfjs-dist');

export async function loadPdfjs(): Promise<Pdfjs> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
