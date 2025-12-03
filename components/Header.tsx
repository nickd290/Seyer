import React from 'react';
import { Cuboid } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Cuboid className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              ArchiVision AI
            </h1>
            <p className="text-[10px] text-zinc-500 tracking-[0.2em] uppercase">Structural Integrity Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="hidden md:flex px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Gemini 3 Pro Active
           </div>
        </div>
      </div>
    </header>
  );
};

export default Header;