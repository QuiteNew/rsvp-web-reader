import { useEffect, useRef, useState, type ReactNode } from 'react';

import { APP_NAME, APP_VERSION, REPO_URL } from '../core/appInfo';
import type { Library } from '../core/models';
import {
  FONT_SIZE_RANGE,
  GUIDE_MARK_LENGTH_PERCENT_RANGE,
  SKIP_WORD_COUNT_RANGE,
  WPM_RANGE,
} from '../core/settings';
import {
  DEFAULTS_ENTRIES,
  DEFAULTS_NOTE,
  NO_MATCH_TEXT,
  RESET_BUTTON_TEXT,
  RESET_NOTE_TEXT,
  SKIP_NOTE,
  WPM_APPLY_NOTE,
  checkSettingsForm,
  defaultsLayout,
  formFromSettings,
  resetDefaultsForm,
  type FormProblem,
  type SettingsForm,
} from '../core/settingsView';
import { LEVEL_NAMES } from '../core/letterSpacing';
import type { SavedLibraryStore } from '../store/libraryStore';
import type { SavedSettingsStore } from '../store/settingsStore';
import { DataSettings } from './DataSettings';
import { Dialog } from './Dialog';
import { ProfilesTab } from './ProfilesTab';
import appStyles from './App.module.css';
import styles from './Dialog.module.css';

type Tab = 'Defaults' | 'Appearance' | 'Profiles' | 'Data';
const TABS: readonly Tab[] = ['Defaults', 'Appearance', 'Profiles', 'Data'];

// The speed slider moves in steps of 10, as the desktop's 90 steps from 100
// to 1000 do.
const WPM_STEP = 10;

interface SettingsDialogProps {
  readonly settings: SavedSettingsStore;
  readonly library: Library;
  readonly store: SavedLibraryStore;
  // The colour the theme on screen gives the guide marks, for applying a
  // reading profile.
  readonly themeGuideMarkColor: string;
  readonly onConfigureChunking: () => void;
  readonly onConfigureSpeakerCues: () => void;
  readonly onImported: () => void;
  readonly onClose: () => void;
}

// The Settings window, as the desktop's settings_window.py has it. The
// Defaults tab lists the settings with a search over them. Nothing is
// saved until Apply, which checks the typed numbers first and closes the
// window when they are fine. Closing it any other way drops the changes.
// The skip amount and pausing on a skip are the exception: they are saved
// at once, as the note above them says.
//
// The desktop's Layout and Stats tabs are not here: the page has no window
// to size, and the stats are not ported. Its Storage tab is Data here, which
// holds export and import. On the Profiles tab Apply is hidden, as on the
// desktop: saving or applying a profile applies the other tabs first.
export function SettingsDialog({
  settings,
  library,
  store,
  themeGuideMarkColor,
  onConfigureChunking,
  onConfigureSpeakerCues,
  onImported,
  onClose,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('Defaults');
  const [form, setForm] = useState<SettingsForm>(() => formFromSettings(settings.getSnapshot()));
  const [query, setQuery] = useState('');
  const [inDescriptions, setInDescriptions] = useState(false);
  const [problem, setProblem] = useState<FormProblem | null>(null);
  // The profile selected on the Profiles tab. Kept here and not in the tab,
  // so it is still selected after a visit to another tab.
  const [profileChosen, setProfileChosen] = useState<string | null>(null);
  const boxes = useRef(new Map<FormProblem['field'], HTMLInputElement>());

  // After a failed Apply, the box with the problem gets the cursor, with
  // its text selected so typing replaces it. This runs once it is drawn.
  useEffect(() => {
    if (problem === null) return;
    const box = boxes.current.get(problem.field);
    box?.scrollIntoView?.({ block: 'nearest' });
    box?.focus();
    box?.select();
  }, [problem]);

  function change(changes: Partial<SettingsForm>): void {
    setForm((current) => ({ ...current, ...changes }));
  }

  // Saves what the tabs hold. When a typed number is wrong it takes the
  // person to it instead, and gives false. The Profiles tab uses this on its
  // own, before saving or applying a profile, as the desktop does.
  function applyForm(): boolean {
    const check = checkSettingsForm(form);
    if (!check.ok) {
      // Take the person to the box: its tab, and no search hiding it.
      setTab('Defaults');
      setQuery('');
      setProblem(check.problem);
      return false;
    }
    setProblem(null);
    settings.update(check.changes);
    settings.setGuideMarkColor(form.guideMarkColor);
    return true;
  }

  function apply(): void {
    if (applyForm()) onClose();
  }

  function numberBox(field: FormProblem['field'], label: string): ReactNode {
    return (
      <label className={styles.row}>
        <span>{label}</span>
        <input
          type="text"
          inputMode="numeric"
          ref={(element) => {
            if (element === null) boxes.current.delete(field);
            else boxes.current.set(field, element);
          }}
          value={form[field]}
          aria-invalid={problem?.field === field}
          onChange={(event) => {
            change({ [field]: event.target.value });
          }}
        />
      </label>
    );
  }

  function slider(
    label: string,
    [low, high]: readonly [number, number],
    step: number,
    value: number,
    shown: string,
    onChange: (value: number) => void,
  ): ReactNode {
    return (
      <label className={styles.row}>
        <span>{label}</span>
        <input
          type="range"
          className={appStyles.slider}
          min={low}
          max={high}
          step={step}
          value={value}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
        />
        <span>{shown}</span>
      </label>
    );
  }

  function swatch(label: string, value: string, onChange: (color: string) => void): ReactNode {
    return (
      <label className={styles.row}>
        <span>{label}</span>
        <input
          type="color"
          className={appStyles.swatch}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </label>
    );
  }

  function toggle(
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ): ReactNode {
    return (
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        <span>{label}</span>
      </label>
    );
  }

  const quiet = `${styles.note} ${styles.quiet}`;

  // The controls of one entry of the Defaults tab.
  function controls(id: string): ReactNode {
    switch (id) {
      case 'note':
        return <p className={quiet}>{DEFAULTS_NOTE}</p>;
      case 'speed':
        return slider(
          'Speed',
          WPM_RANGE,
          WPM_STEP,
          form.defaultWpm,
          `${form.defaultWpm} WPM`,
          (v) => {
            change({ defaultWpm: v });
          },
        );
      case 'fontColor':
        return swatch('Font colour', form.defaultFontColor, (c) => {
          change({ defaultFontColor: c });
        });
      case 'highlightColor':
        return swatch('Highlight colour', form.defaultHighlightColor, (c) => {
          change({ defaultHighlightColor: c });
        });
      case 'backgroundColor':
        return swatch('Background colour', form.defaultBackgroundColor, (c) => {
          change({ defaultBackgroundColor: c });
        });
      case 'wordSize':
        return slider(
          'Word size',
          FONT_SIZE_RANGE,
          1,
          form.defaultFontSize,
          `${form.defaultFontSize} px`,
          (v) => {
            change({ defaultFontSize: v });
          },
        );
      case 'wpmNote':
        return <p className={quiet}>{WPM_APPLY_NOTE}</p>;
      case 'chunking':
        return (
          <button type="button" className={styles.action} onClick={onConfigureChunking}>
            Configure chunking…
          </button>
        );
      case 'speakerCues':
        return (
          <button type="button" className={styles.action} onClick={onConfigureSpeakerCues}>
            Configure speaker cues…
          </button>
        );
      case 'fontSizeStep':
        return numberBox(
          'fontSizeStep',
          'Increase the word size by this many pixels each time +/- is clicked:',
        );
      case 'highlightOffset':
        return numberBox(
          'highlightOffsetPx',
          'Shift the highlighted letter vertically by this many pixels (positive = up, negative = down):',
        );
      case 'guideMarkThickness':
        return numberBox(
          'guideMarkThicknessPx',
          'Thickness of the vertical guide marks, in pixels:',
        );
      case 'guideMarkLength':
        return slider(
          'Mark length',
          GUIDE_MARK_LENGTH_PERCENT_RANGE,
          1,
          form.guideMarkLengthPercent,
          `${form.guideMarkLengthPercent}%`,
          (v) => {
            change({ guideMarkLengthPercent: v });
          },
        );
      case 'guideMarkColor':
        return swatch('Mark colour', form.guideMarkColor, (c) => {
          change({ guideMarkColor: c });
        });
      case 'guideMarkHorizontal':
        return toggle('Show horizontal guide lines', form.guideMarkHorizontalEnabled, (on) => {
          change({ guideMarkHorizontalEnabled: on });
        });
      case 'lengthPacing':
        return toggle('Slow down for long words', form.lengthPacingEnabled, (on) => {
          change({ lengthPacingEnabled: on });
        });
      case 'warmUp':
        return toggle('Ease in at the start of reading', form.warmUpEnabled, (on) => {
          change({ warmUpEnabled: on });
        });
      case 'splitLongParagraphs':
        return toggle(
          'Split long paragraphs when normalizing',
          form.splitLongParagraphsEnabled,
          (on) => {
            change({ splitLongParagraphsEnabled: on });
          },
        );
      case 'resumeRewind':
        return (
          <>
            {toggle('Rewind a few words when resuming', form.resumeRewindEnabled, (on) => {
              change({ resumeRewindEnabled: on });
            })}
            {numberBox('resumeRewindWords', 'Words to rewind on resume:')}
          </>
        );
      case 'scrubPause':
        return toggle('Pause after using the scrubber', form.scrubPauseEnabled, (on) => {
          change({ scrubPauseEnabled: on });
        });
      case 'peripheralContext':
        return toggle('Show surrounding words', form.peripheralContextEnabled, (on) => {
          change({ peripheralContextEnabled: on });
        });
      case 'reopenLast':
        return toggle('Reopen the last transcript at launch', form.reopenLastTranscript, (on) => {
          change({ reopenLastTranscript: on });
        });
      case 'skipNote':
        return <p className={quiet}>{SKIP_NOTE}</p>;
      case 'skipAmount':
        // Saved at once, not on Apply.
        return slider(
          'Skip amount',
          SKIP_WORD_COUNT_RANGE,
          1,
          form.skipWordCount,
          `${form.skipWordCount} words`,
          (v) => {
            change({ skipWordCount: v });
            settings.set('skipWordCount', v);
          },
        );
      case 'pauseOnSkip':
        return toggle('Pause playback when skipping', form.pauseOnSkip, (on) => {
          change({ pauseOnSkip: on });
          settings.set('pauseOnSkip', on);
        });
      case 'reset':
        return (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              const original = resetDefaultsForm(form);
              setForm(original);
              setProblem(null);
              // The two skip settings are saved at once here too.
              settings.update({
                skipWordCount: original.skipWordCount,
                pauseOnSkip: original.pauseOnSkip,
              });
            }}
          >
            {RESET_BUTTON_TEXT}
          </button>
        );
      default:
        return null;
    }
  }

  const layout = defaultsLayout(query, inDescriptions);
  const descriptions = new Map(DEFAULTS_ENTRIES.map((entry) => [entry.id, entry.description]));

  return (
    <Dialog title="Settings" onClose={onClose} wide>
      <div className={styles.tabs} role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === name}
            onClick={() => {
              setTab(name);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === 'Defaults' && (
        <div role="tabpanel" aria-label="Defaults" className={styles.panel}>
          <div className={styles.searchRow}>
            <input
              type="search"
              aria-label="Search settings"
              placeholder="Search settings…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
            <button
              type="button"
              className={inDescriptions ? `${styles.small} ${styles.pressed}` : styles.small}
              aria-pressed={inDescriptions}
              title="Search the descriptions too"
              onClick={() => {
                setInDescriptions(!inDescriptions);
              }}
            >
              Descriptions
            </button>
          </div>
          {layout.shown.map((id) => (
            <div key={id} className={styles.entry} data-testid={`setting-${id}`}>
              {controls(id)}
              {descriptions.get(id) ? <p className={quiet}>{descriptions.get(id)}</p> : null}
            </div>
          ))}
          {layout.noMatch && <p className={quiet}>{NO_MATCH_TEXT}</p>}
          {layout.resetNote && <p className={quiet}>{RESET_NOTE_TEXT}</p>}
        </div>
      )}

      {tab === 'Appearance' && (
        <div role="tabpanel" aria-label="Appearance" className={styles.panel}>
          <label className={styles.row}>
            <span>Colour theme</span>
            <select
              value={form.appearanceMode}
              onChange={(event) => {
                change({ appearanceMode: event.target.value as SettingsForm['appearanceMode'] });
              }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <p className={quiet}>
            System follows your browser's own light or dark choice. Reading colours you picked by
            hand stay as they are. Takes effect after clicking Apply.
          </p>
          <label className={styles.row}>
            <span>Letter spacing</span>
            <select
              value={form.letterSpacingLevel}
              onChange={(event) => {
                change({ letterSpacingLevel: Number(event.target.value) });
              }}
            >
              {LEVEL_NAMES.map((name, level) => (
                <option key={name} value={level}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className={quiet}>
            Adds room between the letters of the flashing word, and between the words of a chunk. It
            applies as soon as you press Apply and is saved in reading profiles. The right amount
            differs from person to person, so try the levels by eye.
          </p>
          {toggle('Use the OpenDyslexic font', form.dyslexiaFontEnabled, (on) => {
            change({ dyslexiaFontEnabled: on });
          })}
          <p className={quiet}>
            Changes every font on the page, not only the reader's. It applies as soon as you press
            Apply. OpenDyslexic is a typeface made with dyslexia in mind. The research on whether it
            helps is mixed, and it was not done on words flashed one at a time, so this is a comfort
            setting to try, not a treatment.
          </p>
        </div>
      )}

      {tab === 'Profiles' && (
        <div role="tabpanel" aria-label="Profiles" className={styles.panel}>
          <ProfilesTab
            settings={settings}
            themeGuideMarkColor={themeGuideMarkColor}
            chosen={profileChosen}
            onChoose={setProfileChosen}
            onPrepare={applyForm}
            onApplied={onClose}
          />
        </div>
      )}

      {tab === 'Data' && (
        <div role="tabpanel" aria-label="Data" className={styles.panel}>
          <DataSettings
            library={library}
            store={store}
            settings={settings}
            onImported={onImported}
          />
          <p className={quiet}>
            {APP_NAME}, version {APP_VERSION}. <a href={REPO_URL}>Source on GitHub</a>
          </p>
        </div>
      )}

      {problem !== null && (
        <p className={styles.problem} role="alert">
          {problem.message}
        </p>
      )}
      {tab !== 'Profiles' && (
        <div className={styles.footer}>
          <button type="button" className={styles.action} onClick={apply}>
            Apply
          </button>
        </div>
      )}
    </Dialog>
  );
}
