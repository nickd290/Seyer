import React from 'react';
import { Palette, Sun, Armchair, Layers } from 'lucide-react';
import { DesignPreferences } from '../types';

interface DesignSelectorsProps {
  preferences: DesignPreferences;
  onChange: (prefs: DesignPreferences) => void;
}

const STYLES = [
  { id: 'Modern Minimalist', label: 'Minimalist', bg: 'bg-zinc-200' },
  { id: 'Industrial Loft', label: 'Industrial', bg: 'bg-stone-600' },
  { id: 'Scandinavian', label: 'Scandi', bg: 'bg-orange-100' },
  { id: 'Mid-Century Modern', label: 'Mid-Century', bg: 'bg-amber-700' },
  { id: 'Luxury Contemporary', label: 'Luxury', bg: 'bg-zinc-900' },
  { id: 'Biophilic (Nature)', label: 'Biophilic', bg: 'bg-emerald-800' },
];

const PALETTES = [
  { id: 'Warm Neutrals', label: 'Warm Neutrals', colors: ['#f5f5f5', '#e5e5e5', '#d4d4d4'] },
  { id: 'Dark & Moody', label: 'Dark & Moody', colors: ['#18181b', '#27272a', '#3f3f46'] },
  { id: 'Cool Greys', label: 'Cool Greys', colors: ['#f1f5f9', '#cbd5e1', '#64748b'] },
  { id: 'Earthy Tones', label: 'Earthy', colors: ['#78350f', '#b45309', '#fcd34d'] },
];

const LIGHTING = [
  { id: 'Natural Daylight', label: 'Daylight (Bright)' },
  { id: 'Warm Evening', label: 'Evening (Cozy)' },
  { id: 'Studio Professional', label: 'Studio (Balanced)' },
  { id: 'Cinematic', label: 'Cinematic (Dramatic)' },
];

const FLOORING = [
  { id: 'Light Oak Wood', label: 'Light Oak' },
  { id: 'Dark Walnut Wood', label: 'Dark Walnut' },
  { id: 'Polished Concrete', label: 'Concrete' },
  { id: 'Marble / Stone', label: 'Marble/Stone' },
];

const DesignSelectors: React.FC<DesignSelectorsProps> = ({ preferences, onChange }) => {
  
  const update = (key: keyof DesignPreferences, value: string) => {
    onChange({ ...preferences, [key]: value });
  };

  return (
    <div className="space-y-6">
      
      {/* STYLE */}
      <div>
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Armchair size={14} /> Architectural Style
        </label>
        <div className="grid grid-cols-3 gap-2">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => update('style', s.id)}
              className={`
                h-12 rounded-lg text-xs font-medium transition-all relative overflow-hidden group
                ${preferences.style === s.id 
                  ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-900 text-white bg-zinc-800' 
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                }
              `}
            >
              <div className={`absolute inset-0 opacity-10 ${s.bg}`} />
              <span className="relative z-10">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* PALETTE */}
      <div>
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Palette size={14} /> Color Palette
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => update('palette', p.id)}
              className={`
                flex items-center gap-3 p-2 rounded-lg transition-all
                ${preferences.palette === p.id 
                  ? 'bg-zinc-800 ring-1 ring-indigo-500/50' 
                  : 'bg-zinc-900/50 hover:bg-zinc-800'
                }
              `}
            >
              <div className="flex -space-x-1">
                {p.colors.map((c, i) => (
                  <div key={i} className="w-4 h-4 rounded-full ring-1 ring-black/20" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className={`text-xs ${preferences.palette === p.id ? 'text-white' : 'text-zinc-400'}`}>
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* LIGHTING */}
        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sun size={14} /> Lighting
          </label>
          <div className="space-y-1">
            {LIGHTING.map((l) => (
              <button
                key={l.id}
                onClick={() => update('lighting', l.id)}
                className={`
                  w-full text-left px-3 py-2 rounded-md text-xs transition-colors
                  ${preferences.lighting === l.id ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}
                `}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* FLOORING */}
        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Layers size={14} /> Flooring
          </label>
          <div className="space-y-1">
            {FLOORING.map((f) => (
              <button
                key={f.id}
                onClick={() => update('flooring', f.id)}
                className={`
                  w-full text-left px-3 py-2 rounded-md text-xs transition-colors
                  ${preferences.flooring === f.id ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}
                `}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default DesignSelectors;