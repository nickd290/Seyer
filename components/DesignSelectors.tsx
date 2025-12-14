
import React from 'react';
import { Sparkles, Leaf, Sun, Palette } from 'lucide-react';
import { DesignPreferences } from '../types';

interface DesignSelectorsProps {
  preferences: DesignPreferences;
  onChange: (prefs: DesignPreferences) => void;
}

// 1. MOOD (Replaces "Architectural Style")
const MOODS = [
  { 
    id: 'Cozy & Intimate', 
    desc: 'Warm, soft, and inviting. Great for relaxation.',
    color: 'bg-orange-900/40 border-orange-700/50'
  },
  { 
    id: 'Bright & Airy', 
    desc: 'Open, spacious, and full of light. Energetic feel.',
    color: 'bg-sky-900/40 border-sky-700/50'
  },
  { 
    id: 'Sleek & Modern', 
    desc: 'Clean lines, minimal clutter, sophisticated.',
    color: 'bg-zinc-800/60 border-zinc-600/50'
  },
  { 
    id: 'Bold & Dramatic', 
    desc: 'High contrast, rich colors, statement pieces.',
    color: 'bg-purple-900/40 border-purple-700/50'
  },
  { 
    id: 'Rustic & Natural', 
    desc: 'Earthy, organic, and grounded. Biophilic.',
    color: 'bg-emerald-900/40 border-emerald-700/50'
  }
];

// 2. MATERIALS (Replaces generic Flooring/Material lists)
const MATERIALS = [
  { id: 'Natural (Wood & Stone)', label: 'Natural & Organic' },
  { id: 'Polished (Glass & Metal)', label: 'Sleek & Shiny' },
  { id: 'Soft (Fabric & Carpet)', label: 'Soft & Plush' },
  { id: 'Industrial (Concrete & Steel)', label: 'Raw & Industrial' },
];

// 3. COLORS (Simplified Palettes)
const COLORS = [
  { id: 'Warm Earth Tones', label: 'Warm Earth (Beige/Brown)' },
  { id: 'Bright Neutrals', label: 'Light Neutrals (White/Cream)' },
  { id: 'Cool Greys & Blues', label: 'Cool Tones (Grey/Blue)' },
  { id: 'Dark & Rich', label: 'Dark & Moody (Black/Navy)' },
];

// 4. LIGHTING
const LIGHTING = [
  { id: 'Natural Daylight', label: 'Bright Daylight' },
  { id: 'Warm Evening', label: 'Cozy Evening' },
  { id: 'Soft Ambient', label: 'Soft Ambient' },
];

const DesignSelectors: React.FC<DesignSelectorsProps> = ({ preferences, onChange }) => {
  
  const update = (key: keyof DesignPreferences, value: string) => {
    onChange({ ...preferences, [key]: value });
  };

  return (
    <div className="space-y-8">
      
      {/* SECTION 1: MOOD (The most important choice) */}
      <div>
        <label className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-yellow-500" /> How should this room feel?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MOODS.map((m) => (
            <button
              key={m.id}
              onClick={() => update('mood', m.id)}
              className={`
                text-left p-4 rounded-xl border transition-all duration-200 relative overflow-hidden group
                ${preferences.mood === m.id 
                  ? `ring-2 ring-indigo-500 ${m.color} bg-opacity-100` 
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                }
              `}
            >
              <div className="relative z-10">
                <div className="font-bold text-white text-sm mb-1">{m.id}</div>
                <div className="text-xs text-zinc-400 group-hover:text-zinc-300">{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* SECTION 2: MATERIALS */}
        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Leaf size={14} /> Preferred Textures
          </label>
          <div className="space-y-2">
            {MATERIALS.map((m) => (
              <button
                key={m.id}
                onClick={() => update('materials', m.id)}
                className={`
                  w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all
                  ${preferences.materials === m.id 
                    ? 'bg-zinc-800 text-white border border-zinc-600 shadow-lg' 
                    : 'bg-zinc-900/50 text-zinc-400 border border-transparent hover:bg-zinc-800'
                  }
                `}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* SECTION 3: COLORS */}
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Palette size={14} /> Color Theme
            </label>
            <div className="grid grid-cols-2 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => update('colors', c.id)}
                  className={`
                    px-3 py-2 rounded-lg text-xs font-medium transition-all border
                    ${preferences.colors === c.id 
                      ? 'bg-zinc-800 text-white border-zinc-500' 
                      : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'
                    }
                  `}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 4: LIGHTING */}
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sun size={14} /> Lighting
            </label>
            <div className="flex flex-wrap gap-2">
              {LIGHTING.map((l) => (
                <button
                  key={l.id}
                  onClick={() => update('lighting', l.id)}
                  className={`
                    px-3 py-2 rounded-full text-xs font-medium transition-all
                    ${preferences.lighting === l.id 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'
                    }
                  `}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignSelectors;
