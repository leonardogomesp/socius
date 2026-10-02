export function WorldLandscape() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 w-3/5 overflow-hidden opacity-50"
    >
      <svg className="h-full w-full" viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice">
        <circle cx="450" cy="60" r="34" fill="#c9bc8e" opacity=".16" />
        <path d="M0 210L130 75 200 145 310 24 435 140 520 90 600 185V260H0Z" fill="#405449" />
        <path d="M0 240L120 153 200 210 340 105 480 212 600 140V260H0Z" fill="#2b3c32" />
        <path d="M0 260L210 192 290 237 420 183 600 235V260Z" fill="#1d2e26" />
        <path d="M310 24l-40 55 38-14 18 16 9-29Z" fill="#aab6a4" opacity=".35" />
      </svg>
    </div>
  );
}
