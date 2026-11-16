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

export const PowerIcon = () => <Icon path="M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0" />;
export const PauseIcon = () => <Icon path="M5 4h14v16H5zM10 9v6M14 9v6" />;
export const PlayIcon = () => <Icon path="M8 5l11 7-11 7z" filled />;
export const RestartIcon = () => <Icon path="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" />;
export const PencilIcon = () => <Icon path="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />;
