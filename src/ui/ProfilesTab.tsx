import { useState, useSyncExternalStore } from 'react';

import { ProfileError } from '../core/profiles';
import type { SavedSettingsStore } from '../store/settingsStore';
import { NameDialog } from './Dialog';
import styles from './Dialog.module.css';

// Says what a profile is, and what it is not. The second part matters: a
// person who reads "profile" may expect it to change their transcripts or
// their colours, and it changes neither. Speed and Word size are the two
// sliders on the Defaults tab, so they only set where a new transcript
// starts. From the desktop's gui/components/profiles_tab.py.
export const PROFILES_EXPLANATION =
  'A profile is a saved set of reader settings: the guide marks, pacing, rewind on resume, ' +
  'surrounding words, skipping, the +/- step, the scrubber and paragraph switches, the letter ' +
  'spacing, and the Speed and Word size sliders. Applying one never changes a transcript, your ' +
  'colours or chunking, and Speed and Word size only set where new transcripts start. To keep ' +
  'different texts apart, use Spaces.';

// Saving or applying first applies what was changed on the other tabs, the
// way Apply does, because both work from the settings as they are saved.
// Apply itself is hidden on this tab, so the note does not point at it.
export const PROFILES_APPLY_FIRST =
  "Saving or applying a profile first applies any changes you've made in the other tabs.";

export const NO_PROFILES_TEXT =
  'No profiles yet. Set things up the way you like in Settings, then save them here.';

interface ProfilesTabProps {
  readonly settings: SavedSettingsStore;
  // The colour the theme on screen gives the guide marks, for a profile that
  // saved them as following the theme. If the theme was changed on the
  // Appearance tab in this same visit, this is still the old theme's colour.
  // The page puts a colour that follows the theme back in step as soon as the
  // new theme is on, so the colour comes out right.
  readonly themeGuideMarkColor: string;
  // The name of the selected profile, or null. Kept by the Settings window,
  // so a visit to another tab does not lose it, as on the desktop.
  readonly chosen: string | null;
  readonly onChoose: (name: string | null) => void;
  // Applies what the other tabs hold, as Apply does, without closing. False
  // when a typed number is wrong, which it has already shown.
  readonly onPrepare: () => boolean;
  // A profile was applied. Settings closes then, as on the desktop: its other
  // tabs still hold the old values, and Apply would write them back.
  readonly onApplied: () => void;
}

// The Profiles tab of Settings: the explanation, a button to save the
// current settings as a new profile, the saved profiles, and Apply for the
// selected one. Clicking a profile selects it, and clicking it again
// unselects it.
export function ProfilesTab({
  settings,
  themeGuideMarkColor,
  chosen,
  onChoose,
  onPrepare,
  onApplied,
}: ProfilesTabProps) {
  const { profiles } = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const [naming, setNaming] = useState(false);
  const [message, setMessage] = useState('');
  // A profile that is no longer saved is not selected.
  const selected = profiles.some((profile) => profile.name === chosen) ? chosen : null;

  // Runs a change. A ProfileError is shown under the list instead of thrown.
  function run(change: () => void): boolean {
    try {
      change();
    } catch (error) {
      if (!(error instanceof ProfileError)) throw error;
      setMessage(error.message);
      return false;
    }
    setMessage('');
    return true;
  }

  function applySelected(): void {
    if (selected === null || !onPrepare()) return;
    if (run(() => settings.applyProfile(selected, themeGuideMarkColor))) onApplied();
  }

  const quiet = `${styles.note} ${styles.quiet}`;

  return (
    <>
      <p className={quiet}>{PROFILES_EXPLANATION}</p>
      <p className={quiet}>{PROFILES_APPLY_FIRST}</p>
      <button
        type="button"
        className={styles.action}
        onClick={() => {
          if (onPrepare()) setNaming(true);
        }}
      >
        Save current settings as…
      </button>

      {profiles.length === 0 ? (
        <p className={`${quiet} ${styles.profiles}`}>{NO_PROFILES_TEXT}</p>
      ) : (
        <ul className={styles.profiles} aria-label="Saved profiles">
          {profiles.map((profile) => (
            <li key={profile.name}>
              <button
                type="button"
                className={styles.profileName}
                aria-pressed={profile.name === selected}
                onClick={() => {
                  onChoose(profile.name === selected ? null : profile.name);
                }}
              >
                {profile.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.profileActions}>
        <button
          type="button"
          className={styles.action}
          disabled={selected === null}
          onClick={applySelected}
        >
          Apply
        </button>
      </div>
      {message !== '' && (
        <p className={styles.problem} role="alert">
          {message}
        </p>
      )}

      {naming && (
        <NameDialog
          title="Save Profile"
          label="Profile name"
          confirm="Save"
          onClose={() => {
            setNaming(false);
          }}
          onSubmit={(name) => {
            try {
              // Selected by the name it was saved under, which is tidied.
              onChoose(settings.saveProfile(name).name);
            } catch (error) {
              if (!(error instanceof ProfileError)) throw error;
              return error.message;
            }
            setMessage('');
            return null;
          }}
        />
      )}
    </>
  );
}
