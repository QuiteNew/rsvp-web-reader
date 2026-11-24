// The few icons the page needs, drawn as small SVGs so nothing is loaded
// from anywhere. Each one is decoration: the button around it has the name.

interface IconProps {
  readonly path: string;
  readonly filled?: boolean;
}

function Icon({ path, filled = false }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

// The Normalize button: a page with a tick, and a plain page while it
// offers to put the original back, as the desktop's two icons are.
// The bold word starts button: three rows of two "words" drawn as rounded
// bars, from the desktop's icon. Off, every word is a soft tone. On, the
// front half of each word is at full strength, so switching it on only ever
// adds ink. The button colour stays the same, so the icon is what tells.
const BOLD_ROWS: readonly (readonly [y: number, x: number, end: number][])[] = [
  [
    [5.76, 1.92, 10.56],
    [5.76, 12.72, 22.32],
  ],
  [
    [12, 1.92, 12.48],
    [12, 14.64, 22.32],
  ],
  [
    [18.24, 1.92, 9.12],
    [18.24, 11.28, 17.04],
  ],
];
const BOLD_BAR = 3.12;
// The desktop's soft tone, an alpha of 130 out of 255.
const BOLD_SOFT = 130 / 255;

export function BoldStartsIcon({ on }: { readonly on: boolean }) {
  const words = BOLD_ROWS.flat();
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      {words.map(([y, x, end]) => (
        <rect
          key={`soft ${y} ${x}`}
          x={x}
          y={y - BOLD_BAR / 2}
          width={end - x}
          height={BOLD_BAR}
          rx={BOLD_BAR * 0.4}
          opacity={BOLD_SOFT}
        />
      ))}
      {on &&
        words.map(([y, x, end]) => (
          <rect
            key={`start ${y} ${x}`}
            data-word-start=""
            x={x}
            y={y - BOLD_BAR / 2}
            width={(end - x) / 2}
            height={BOLD_BAR}
            rx={BOLD_BAR * 0.4}
          />
        ))}
    </svg>
  );
}

export const NormalizeIcon = () => <Icon path="M6 3h9l3 3v15H6zM9 13l2 2 4-4" />;
export const RevertIcon = () => <Icon path="M6 3h9l3 3v15H6zM9 11h6M9 15h6" />;
export const PowerIcon = () => <Icon path="M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0" />;
export const PauseIcon = () => <Icon path="M5 4h14v16H5zM10 9v6M14 9v6" />;
export const PlayIcon = () => <Icon path="M8 5l11 7-11 7z" filled />;
export const RestartIcon = () => <Icon path="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" />;
export const BookmarkIcon = () => <Icon path="M7 4h10v16l-5-4-5 4z" />;
export const PencilIcon = () => <Icon path="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />;
