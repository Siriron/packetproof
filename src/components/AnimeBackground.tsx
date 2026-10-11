/**
 * Animated anime-style background with floating particles and grid.
 * Pure CSS + SVG — no external images.
 */
export function AnimeBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Deep space gradient */}
      <div className="absolute inset-0 bg-[#060914]" />

      {/* Subtle grid lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#7C9EFF" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Glowing orb — top right */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #4F6EF7 0%, #7C3FBF 50%, transparent 70%)" }} />

      {/* Glowing orb — bottom left */}
      <div className="absolute -bottom-48 -left-24 w-[500px] h-[500px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #E040FB 0%, #3F51B5 50%, transparent 70%)" }} />

      {/* Scanline shimmer across hero */}
      <div className="absolute top-0 left-0 w-full h-[2px] opacity-40"
        style={{ background: "linear-gradient(90deg, transparent, #7C9EFF 50%, transparent)", animation: "scanline 4s linear infinite" }} />

      {/* Floating data-stream dots */}
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: i % 3 === 0 ? "3px" : "2px",
            height: i % 3 === 0 ? "3px" : "2px",
            background: i % 5 === 0 ? "#E040FB" : i % 3 === 0 ? "#7C9EFF" : "#4FC3F7",
            left: `${(i * 6.2 + 3) % 100}%`,
            top: `${(i * 7.1 + 5) % 100}%`,
            opacity: 0.5 + (i % 4) * 0.1,
            animation: `float-particle ${3 + (i % 4)}s ease-in-out ${i * 0.4}s infinite alternate`,
          }}
        />
      ))}
    </div>
  )
}
