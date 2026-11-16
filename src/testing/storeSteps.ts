// The desktop's TranscriptStore methods, each as the pure rule that ports
// it. Tests replay calls recorded from the desktop through this table.
import * as rules from '../core/library';
import type { Library } from '../core/models';
import { toSavedData } from '../core/storageFormat';

/** One store method: the library after it, and what the method gave back. */
export type Step = (library: Library, args: readonly unknown[]) => [Library, unknown];

const nothing =
  (apply: (library: Library, ...args: never[]) => Library): Step =>
  (library, args) => [apply(library, ...(args as never[])), null];

/** For the methods that answer whether they did anything. */
const whetherChanged =
  (apply: (library: Library, ...args: never[]) => Library): Step =>
  (library, args) => {
    const after = apply(library, ...(args as never[]));
    return [after, after !== library];
  };

/** For the two that answer with the name of the open Space. */
const openSpace =
  (apply: (library: Library, ...args: never[]) => Library): Step =>
  (library, args) => {
    const after = apply(library, ...(args as never[]));
    return [after, rules.currentSpace(after)];
  };

const NEW_FIELDS = [
  'wpm',
  'fontColor',
  'highlightColor',
  'backgroundColor',
  'fontSize',
  'chunkingEnabled',
  'chunkSize',
  'chunkMode',
  'chunkCharTarget',
] as const;

/** Every TranscriptStore method that changes the library, by its Python name. */
export const STORE_STEPS: Readonly<Record<string, Step>> = {
  add_space: openSpace(rules.addSpace),
  switch_to_space: openSpace(rules.switchToSpace),
  rename_space: whetherChanged(rules.renameSpace),
  delete_space: whetherChanged(rules.deleteSpace),
  add_transcript: (library, [title, space, ...rest]) => {
    // The desktop takes the other fields by position, in this order.
    const fields = Object.fromEntries(rest.map((value, i) => [NEW_FIELDS[i], value]));
    const after = rules.addTranscript(library, title as string, space as string, fields);
    const added = toSavedData({ ...after, transcripts: after.transcripts.slice(-1) })
      .transcripts[0];
    return [after, added];
  },
  delete_transcript: nothing(rules.deleteTranscript),
  set_transcript_title: nothing(rules.setTitle),
  set_transcript_space: nothing(rules.setSpace),
  set_transcript_text: nothing(rules.setText),
  set_transcript_draft_text: nothing(rules.setDraftText),
  set_transcript_position: nothing(rules.setPosition),
  set_transcript_wpm: nothing(rules.setWpm),
  set_transcript_paused: nothing(rules.setPaused),
  set_transcript_stopped: nothing(rules.setStopped),
  set_transcript_font_size: nothing(rules.setFontSize),
  set_transcript_font_color: nothing(rules.setFontColor),
  set_transcript_highlight_color: nothing(rules.setHighlightColor),
  set_transcript_background_color: nothing(rules.setBackgroundColor),
  resync_default_reading_colors: nothing(rules.resyncDefaultReadingColors),
  set_transcript_normalization: nothing(rules.setNormalization),
  set_transcript_chunking: nothing(rules.setChunking),
  set_transcript_speakers: nothing(rules.setSpeakers),
  add_bookmark: (library, [id, index, snippet = '']) => [
    rules.addBookmark(library, id as number, index as number, snippet as string, 'NOW'),
    null,
  ],
  remove_bookmark: nothing(rules.removeBookmark),
  set_bookmark_label: nothing(rules.setBookmarkLabel),
  add_session_stats: nothing(rules.addSessionStats),
};
