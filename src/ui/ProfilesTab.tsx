import { useState, useSyncExternalStore } from 'react';

import { ProfileError, cleanName } from '../core/profiles';
import type { SavedSettingsStore } from '../store/settingsStore';
import { ConfirmDialog, NameDialog } from './Dialog';
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

// Saving, updating or applying first applies what was changed on the other
// tabs, the way Apply does, because all three work from the settings as they
// are saved. Apply itself is hidden on this tab, so the note does not point
// at it.
export const PROFILES_APPLY_FIRST =
  "Saving, updating or applying a profile first applies any changes you've made in the other tabs.";

export const NO_PROFILES_TEXT =
  'No profiles yet. Set things up the way you like in Settings, then save them here.';

// The one window this tab may have open over Settings at a time.
type Popup =
  | { readonly kind: 'save' }
  | { readonly kind: 'rename' | 'update' | 'delete'; readonly name: string };

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
// current settings as a new profile, the saved profiles, and Apply, Update,
// Rename and Delete for the selected one. Clicking a profile selects it, and
// clicking it again unselects it, which switches the four buttons off.
export function ProfilesTab({
  settings,
  themeGuideMarkColor,
  chosen,
  onChoose,
  onPrepare,
  onApplied,
}: ProfilesTabProps) {
  const { profiles } = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const [popup, setPopup] = useState<Popup | null>(null);
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

  // For the name dialogs: a refused name is named in the dialog, which
  // stays open, so a typo does not cost the person the whole dialog.
  function named(change: () => void): string | null {
    try {
      change();
    } catch (error) {
      if (!(error instanceof ProfileError)) throw error;
      return error.message;
    }
    setMessage('');
    return null;
  }

  function closePopup(): void {
    setPopup(null);
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
          if (onPrepare()) setPopup({ kind: 'save' });
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
        <button
          type="button"
          className={styles.action}
          disabled={selected === null}
          onClick={() => {
            if (selected !== null && onPrepare()) setPopup({ kind: 'update', name: selected });
          }}
        >
          Update
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={selected === null}
          onClick={() => {
            if (selected !== null) setPopup({ kind: 'rename', name: selected });
          }}
        >
          Rename
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={selected === null}
          onClick={() => {
            if (selected !== null) setPopup({ kind: 'delete', name: selected });
          }}
        >
          Delete
        </button>
      </div>
      {message !== '' && (
        <p className={styles.problem} role="alert">
          {message}
        </p>
      )}

      {popup?.kind === 'save' && (
        <NameDialog
          title="Save Profile"
          label="Profile name"
          confirm="Save"
          onClose={closePopup}
          onSubmit={(name) =>
            named(() => {
              // Selected by the name it was saved under, which is tidied.
              onChoose(settings.saveProfile(name).name);
            })
          }
        />
      )}

      {popup?.kind === 'rename' && (
        <NameDialog
          title="Rename Profile"
          label="Profile name"
          confirm="Rename"
          initialValue={popup.name}
          selectText
          onClose={closePopup}
          onSubmit={(name) =>
            named(() => {
              // The same name, tidied, is no change, and nothing is saved.
              if (cleanName(name) === popup.name) return;
              onChoose(settings.renameProfile(popup.name, name).name);
            })
          }
        />
      )}

      {popup?.kind === 'update' && (
        <ConfirmDialog
          title="Update Profile"
          message={`Replace what "${popup.name}" holds with the settings you are using now? The old settings can't be brought back.`}
          confirm="Update"
          onConfirm={() => {
            run(() => settings.updateProfile(popup.name));
          }}
          onClose={closePopup}
        />
      )}

      {popup?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete Profile"
          message={`Delete the profile "${popup.name}"? This can't be undone.`}
          confirm="Delete"
          onConfirm={() => {
            if (run(() => settings.deleteProfile(popup.name))) onChoose(null);
          }}
          onClose={closePopup}
        />
      )}
    </>
  );
}
