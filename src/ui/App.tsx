import { APP_NAME, APP_VERSION, REPO_URL } from '../core/appInfo';
import styles from './App.module.css';

// The whole page, for now. It only proves that the build, the tests and the
// deploy work. The reader itself arrives in phase 2.
export function App() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{APP_NAME}</h1>
      <p>
        A speed-reading page that flashes text one word at a time. It is being built, and there is
        nothing to read with yet.
      </p>
      <p className={styles.small}>
        Version {APP_VERSION}. <a href={REPO_URL}>Source on GitHub</a>
      </p>
    </main>
  );
}
