const ICONS = {
  office365: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff8a3d" />
          <stop offset="100%" stopColor="#d6410f" />
        </linearGradient>
      </defs>
      <rect x="4" y="6" width="32" height="28" rx="7" fill={`url(#${id})`} />
      <path d="M13 15h10l5 6-5 6H13l5-6-5-6Z" fill="#fff" opacity=".92" />
    </>
  ),
  teams: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b7bf0" />
          <stop offset="100%" stopColor="#5b4bc4" />
        </linearGradient>
      </defs>
      <circle cx="15" cy="14" r="5.5" fill={`url(#${id})`} />
      <circle cx="27" cy="16" r="4" fill={`url(#${id})`} opacity=".55" />
      <rect x="7" y="20" width="19" height="14" rx="6" fill={`url(#${id})`} />
      <rect x="24" y="19" width="10" height="11" rx="4.5" fill={`url(#${id})`} opacity=".55" />
    </>
  ),
  printer: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3fb6a8" />
          <stop offset="100%" stopColor="#137d72" />
        </linearGradient>
      </defs>
      <rect x="9" y="15" width="22" height="14" rx="4" fill={`url(#${id})`} />
      <rect x="13" y="6" width="14" height="10" rx="2" fill={`url(#${id})`} opacity=".6" />
      <rect x="13" y="24" width="14" height="11" rx="1.5" fill="#fff" opacity=".92" />
      <circle cx="26" cy="19" r="1.6" fill="#fff" />
    </>
  ),
  network: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4aa3ff" />
          <stop offset="100%" stopColor="#1f66c9" />
        </linearGradient>
      </defs>
      <path d="M20 30a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" fill={`url(#${id})`} />
      <path d="M11 21a12.7 12.7 0 0 1 18 0" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" fill="none" opacity=".85" />
      <path d="M6 14.5a19.5 19.5 0 0 1 28 0" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" fill="none" opacity=".45" />
    </>
  ),
  phone: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e777a8" />
          <stop offset="100%" stopColor="#a03d6f" />
        </linearGradient>
      </defs>
      <path
        d="M11 8c1.9-1 3.8-1.2 4.6.3l1.7 3.2c.6 1.2.2 2.3-.8 3.1l-1.6 1.3c1 2.7 3.1 4.8 5.8 5.8l1.3-1.6c.8-1 1.9-1.4 3.1-.8l3.2 1.7c1.5.8 1.3 2.7.3 4.6-1.2 2.2-3.6 3.1-6 2.4-6.8-1.9-11.8-6.9-13.7-13.7-.7-2.4.2-4.8 2.4-6.3Z"
        fill={`url(#${id})`}
      />
    </>
  ),
  chart: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3bc4d6" />
          <stop offset="100%" stopColor="#1c7c9c" />
        </linearGradient>
      </defs>
      <rect x="8" y="21" width="5.5" height="13" rx="1.6" fill={`url(#${id})`} opacity=".55" />
      <rect x="17.2" y="14" width="5.5" height="20" rx="1.6" fill={`url(#${id})`} opacity=".8" />
      <rect x="26.5" y="8" width="5.5" height="26" rx="1.6" fill={`url(#${id})`} />
    </>
  ),
  mail: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f8cf2" />
          <stop offset="100%" stopColor="#2a58b8" />
        </linearGradient>
      </defs>
      <rect x="6" y="11" width="28" height="19" rx="4.5" fill={`url(#${id})`} />
      <path d="M8 13.5 20 22l12-8.5" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".92" />
    </>
  ),
  shield: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3fcf8e" />
          <stop offset="100%" stopColor="#1a8f63" />
        </linearGradient>
      </defs>
      <path d="M20 5.5 32 9.5v9.3c0 8-5 13.7-12 15.7-7-2-12-7.7-12-15.7V9.5l12-4Z" fill={`url(#${id})`} />
      <path d="M14.8 20.2l3.6 3.6 7-7.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
};

export default function CommonServiceArt({ type, id }) {
  const render = ICONS[type];
  if (!render) return null;
  return (
    <svg
      className="mesa-common-art-svg"
      viewBox="0 0 40 40"
      width="40"
      height="40"
      aria-hidden="true"
    >
      {render(`csa-${id}`)}
    </svg>
  );
}
