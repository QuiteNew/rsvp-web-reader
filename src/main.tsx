import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IndexedDbLibrary } from './store/indexedDbLibrary';
import { SavedLibraryStore } from './store/libraryStore';
import { browserStorageHealth } from './store/storageHealth';
import { App } from './ui/App';
import './ui/global.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html has no element with id "root"');
}

// One store for the page, made here so that React's StrictMode, which
// mounts everything twice while developing, still reads the saved library
// once.
const store = new SavedLibraryStore(new IndexedDbLibrary());

createRoot(root).render(
  <StrictMode>
    <App store={store} health={browserStorageHealth} />
  </StrictMode>,
);
