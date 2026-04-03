import React from "react";

export function getRankTier(level: number) {
  if (level >= 10) return "platinum";
  if (level >= 7) return "gold";
  if (level >= 4) return "silver";
  return "bronze";
}

export function getRankColor(level: number) {
  const tier = getRankTier(level);
  if (tier === "platinum") return "#cceeff";
  if (tier === "gold") return "#ffcc00";
  if (tier === "silver") return "#f0f0f0";
  return "#e6a87c";
}

export function RankInsignia({ level, size = 24 }: { level: number; size?: number }) {
  const tier = getRankTier(level);
  
  // High-fidelity metallic drop-shadows matching the tier
  const glowShadow = 
    tier === "platinum" ? "rgba(204, 238, 255, 0.9)" :
    tier === "gold" ? "rgba(255, 204, 0, 0.7)" :
    tier === "silver" ? "rgba(255, 255, 255, 0.6)" :
    "rgba(230, 168, 124, 0.5)";

  const gradId = `${tier}-grad`;
  const textGradId = `${tier}-text-grad`;

  // Render the unique shape for the specific level (1-10)
  const renderShape = () => {
    switch (level) {
      // ── BRONZE TIER (1-3): The Headstone & Early Path ──
      case 1:
        return (
          <g>
            {/* Solid Headstone */}
            <path d="M 25 85 L 25 45 C 25 15 75 15 75 45 L 75 85 Z" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
            <path d="M 50 19 C 71 19 71 45 71 45 L 71 85 L 50 85 Z" fill="rgba(255,255,255,0.2)" />
            {/* Center Path Engraving */}
            <path d="M 50 35 L 50 65" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="4" strokeLinecap="round" />
          </g>
        );
      case 2:
        return (
          <g>
            {/* Stepped Headstone */}
            <path d="M 20 85 L 20 50 C 20 15 80 15 80 50 L 80 85 Z" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
            <path d="M 28 85 L 28 50 C 28 25 72 25 72 50 L 72 85 Z" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="3" />
            <path d="M 50 19 C 76 19 76 50 76 50 L 76 85 L 50 85 Z" fill="rgba(255,255,255,0.15)" />
            {/* Compass Star Engraving */}
            <polygon points="50,30 55,45 70,50 55,55 50,70 45,55 30,50 45,45" fill="rgba(0,0,0,0.3)" />
          </g>
        );
      case 3:
        return (
          <g>
            {/* Arching Headstone with Eye / Lens */}
            <path d="M 15 85 L 15 45 C 15 5 85 5 85 45 L 85 85 Z" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
            <path d="M 22 85 L 22 45 C 22 15 78 15 78 45 L 78 85 Z" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="2" />
            <path d="M 50 9 C 81 9 81 45 81 45 L 81 85 L 50 85 Z" fill="rgba(255,255,255,0.2)" />
            {/* The Lens of Observation */}
            <circle cx="50" cy="40" r="14" fill="rgba(255,255,255,0.3)" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
            <circle cx="50" cy="40" r="6" fill="rgba(0,0,0,0.4)" />
            <path d="M 50 65 L 50 78" stroke="rgba(0,0,0,0.3)" strokeWidth="4" strokeLinecap="round" />
          </g>
        );

      // ── SILVER TIER (4-6): The Spade & Archive ──
      case 4:
        return (
          <g>
            {/* Silver Spade Shield */}
            <path d="M 50 10 C 80 20 90 55 50 90 C 10 55 20 20 50 10 Z" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
            <path d="M 50 10 C 80 20 90 55 50 90 Z" fill="rgba(255,255,255,0.25)" />
            {/* Inner Trowel/Chevron */}
            <path d="M 35 45 L 50 30 L 65 45 L 50 65 Z" fill="rgba(0,0,0,0.3)" />
            <path d="M 50 65 L 50 80" stroke="rgba(0,0,0,0.3)" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
      case 5:
        return (
          <g>
            {/* Silver Escutcheon */}
            <path d="M 15 15 L 85 15 L 85 40 C 85 70 50 90 50 90 C 50 90 15 70 15 40 Z" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
            <path d="M 23 23 L 77 23 L 77 40 C 77 65 50 82 50 82 C 50 82 23 65 23 40 Z" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="2" />
            <path d="M 50 15 L 85 15 L 85 40 C 85 70 50 90 Z" fill="rgba(255,255,255,0.25)" />
            {/* Archival Ledger */}
            <path d="M 35 45 L 50 52 L 65 45 L 65 65 L 50 72 L 35 65 Z" fill="rgba(0,0,0,0.3)" />
            <path d="M 50 52 L 50 72" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          </g>
        );
      case 6:
        return (
          <g>
            {/* Ornate Silver Crest */}
            <path d="M 50 8 C 70 8 90 20 85 50 C 80 80 50 95 50 95 C 50 95 20 80 15 50 C 10 20 30 8 50 8 Z" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" />
            <path d="M 50 8 C 70 8 90 20 85 50 C 80 80 50 95 50 95 Z" fill="rgba(255,255,255,0.3)" />
            {/* Quill and Seedling */}
            <path d="M 50 70 C 40 70 35 55 35 45 C 35 35 45 25 50 25 C 55 25 65 35 65 45 C 65 55 60 70 50 70 Z" fill="rgba(0,0,0,0.3)" />
            <path d="M 50 80 L 50 40" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
            <path d="M 50 55 C 58 50 60 45 60 45" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
            <path d="M 50 62 C 40 58 40 52 40 52" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
          </g>
        );

      // ── GOLD TIER (7-9): Ornate Family Trees & Iron Gates ──
      case 7:
        return (
          <g>
            {/* Gold Sunburst Base */}
            <circle cx="50" cy="50" r="42" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
            <path d="M 50 5 L 60 30 L 85 15 L 70 40 L 95 50 L 70 60 L 85 85 L 60 70 L 50 95 L 40 70 L 15 85 L 30 60 L 5 50 L 30 40 L 15 15 L 40 30 Z" fill="rgba(0,0,0,0.15)" />
            <path d="M 50 5 A 45 45 0 0 1 50 95 Z" fill="rgba(255,255,255,0.25)" />
            {/* The Ancestral Tree */}
            <path d="M 50 75 Q 45 60 40 55 T 30 45 Q 45 50 50 60 Q 55 50 70 45 T 60 55 Q 55 60 50 75" fill="rgba(50,30,10,0.7)" />
            <path d="M 50 75 L 50 35" stroke="rgba(50,30,10,0.7)" strokeWidth="4" strokeLinecap="round" />
            <circle cx="50" cy="30" r="5" fill="rgba(50,30,10,0.7)" />
            <circle cx="35" cy="40" r="4" fill="rgba(50,30,10,0.7)" />
            <circle cx="65" cy="40" r="4" fill="rgba(50,30,10,0.7)" />
          </g>
        );
      case 8:
        return (
          <g>
            {/* Hexagonal Gold Shield */}
            <polygon points="50,5 92,25 92,75 50,95 8,75 8,25" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinejoin="round" />
            <polygon points="50,15 82,32 82,68 50,85 18,68 18,32" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="2" />
            <polygon points="50,5 92,25 92,75 50,95 50,50" fill="rgba(255,255,255,0.3)" />
            {/* Iron Gate & Lantern Motif */}
            <path d="M 40 35 L 60 35 L 60 70 L 40 70 Z" fill="rgba(0,0,0,0.4)" />
            <path d="M 45 40 L 55 40 L 55 55 L 45 55 Z" fill={`url(#${gradId})`} />
            <path d="M 50 40 L 50 55 L 45 47 L 55 47" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
            <path d="M 35 30 L 65 30 M 35 75 L 65 75" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
          </g>
        );
      case 9:
        return (
          <g>
            {/* The Master's Mandala Crest */}
            <path d="M 50 0 C 70 0 100 20 100 50 C 100 80 70 100 50 100 C 30 100 0 80 0 50 C 0 20 30 0 50 0 Z" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.7)" strokeWidth="3" />
            <path d="M 50 10 L 85 50 L 50 90 L 15 50 Z" fill="rgba(0,0,0,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
            <path d="M 15 50 L 85 50 M 50 10 L 50 90" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
            <path d="M 50 0 C 70 0 100 20 100 50 C 100 80 70 100 50 100 Z" fill="rgba(255,255,255,0.25)" />
            {/* Intricate Eternal Flame / Knot */}
            <path d="M 50 30 C 65 45 65 65 50 80 C 35 65 35 45 50 30 Z" fill="rgba(0,0,0,0.5)" />
            <circle cx="50" cy="62" r="6" fill={`url(#${gradId})`} />
            <path d="M 50 30 Q 60 50 50 62 Q 40 50 50 30" fill="rgba(255,255,255,0.8)" />
          </g>
        );

      // ── PLATINUM TIER (10): The Radiant Winged Shield ──
      case 10:
        return (
          <g>
            {/* Epic Wing Extensions (Breaking the bounding box subtly!) */}
            <path d="M 15 25 Q -5 20 -5 40 Q 15 45 15 60" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
            <path d="M 85 25 Q 105 20 105 40 Q 85 45 85 60" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
            <path d="M 10 45 Q -10 40 -10 60 Q 10 65 10 75" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
            <path d="M 90 45 Q 110 40 110 60 Q 90 65 90 75" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
            
            {/* Massive Geometric Monolith Core */}
            <polygon points="50,0 85,25 85,75 50,100 15,75 15,25" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.9)" strokeWidth="3" strokeLinejoin="round" />
            <polygon points="50,0 85,25 85,75 50,100 50,50" fill="rgba(255,255,255,0.4)" />
            
            {/* Inner Lens / Glowing Eye of History */}
            <circle cx="50" cy="50" r="22" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.8)" strokeWidth="4" />
            <polygon points="50,30 58,45 70,50 58,55 50,70 42,55 30,50 42,45" fill="rgba(255,255,255,0.95)" />
            <circle cx="50" cy="50" r="10" fill={`url(#${gradId})`} />
            <circle cx="50" cy="50" r="4" fill="#ffffff" />
          </g>
        );
      
      default:
        // Fallback for unexpected levels
        return <circle cx="50" cy="50" r="45" fill={`url(#${gradId})`} />;
    }
  };

  return (
    <div
      className="relative flex items-center justify-center shrink-0 transition-transform duration-500 hover:scale-105"
      style={{
        width: size,
        height: size,
        filter: `drop-shadow(0 6px 12px ${glowShadow}) drop-shadow(0 1px 3px rgba(0,0,0,0.6))`,
      }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="bronze-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffcca8" />
            <stop offset="35%" stopColor="#cd7f32" />
            <stop offset="65%" stopColor="#8c5a24" />
            <stop offset="100%" stopColor="#4a2c0c" />
          </linearGradient>
          <linearGradient id="silver-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#e6e6e6" />
            <stop offset="70%" stopColor="#999999" />
            <stop offset="100%" stopColor="#4d4d4d" />
          </linearGradient>
          <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffeeaa" />
            <stop offset="35%" stopColor="#ffb300" />
            <stop offset="70%" stopColor="#b37700" />
            <stop offset="100%" stopColor="#664400" />
          </linearGradient>
          <linearGradient id="platinum-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="25%" stopColor="#e0f4ff" />
            <stop offset="65%" stopColor="#a3daff" />
            <stop offset="100%" stopColor="#4d94ff" />
          </linearGradient>
        </defs>
        
        {renderShape()}
      </svg>
      
      {/* Absolute positioning for the text, hidden behind elements if needed but layered here */}
      <div 
        className="absolute inset-0 flex flex-col items-center justify-center font-black font-serif z-10 pointer-events-none"
        style={{
          color: (tier === "silver" || tier === "platinum") ? "#0a0a0a" : "#fff8f0",
          fontSize: size * 0.35,
          textShadow: (tier === "silver" || tier === "platinum") ? "0px 1px 2px rgba(255,255,255,0.7)" : "0px 2px 4px rgba(0,0,0,0.8)",
          // For level 10, shift down slightly as the lens occupies the center
          transform: level === 10 ? "translateY(25%) scale(0.85)" : "none",
        }}
      >
        {level}
      </div>
    </div>
  );
}
