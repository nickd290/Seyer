
import React, { useState, useEffect, useRef } from 'react';
import { 
  Wand2, Download, AlertCircle, Eye, Loader2, Sparkles, MoveRight, 
  ImagePlus, Key, ExternalLink, Send, Layout, CheckCircle2, ArrowRight,
  ChevronRight, Lock, History, PlayCircle, Pencil, Save, Paperclip, X
} from 'lucide-react';
import Header from './components/Header';
import ImageUpload from './components/ImageUpload';
import DesignSelectors from './components/DesignSelectors';
import { FileData, ViewPerspective, ProjectState, Room, RoomStatus, ChatMessage, DesignPreferences } from './types';
import { analyzeLayout, generateHeroView, generateSecondaryViews, refineRoomRender } from './services/geminiService';

const App: React.FC = () => {
  // --- Global State ---
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  
  const [project, setProject] = useState<ProjectState>({
    stage: 'UPLOAD',
    layoutFile: null,
    rooms: [],
    currentRoomId: null,
    globalStyle: null,
    projectStyleReference: null, // Stores the Master Style from Room 1
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Design Loop Inputs
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentStyleRef, setCurrentStyleRef] = useState<FileData | null>(null);
  const [designPreferences, setDesignPreferences] = useState<DesignPreferences>({
    style: 'Modern Minimalist',
    palette: 'Warm Neutrals',
    lighting: 'Natural Daylight',
    flooring: 'Light Oak Wood'
  });

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatAttachment, setChatAttachment] = useState<FileData | null>(null);
  
  // Refs for scrolling
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Initialization ---
  useEffect(() => {
    checkApiKey();
    if (process.env.API_KEY) setApiKey(process.env.API_KEY);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [project.rooms]);

  const checkApiKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      const hasKey = await win.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
      if (hasKey) setApiKey(process.env.API_KEY || '');
    }
  };

  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      await win.aistudio.openSelectKey();
      setHasApiKey(true);
      setApiKey(process.env.API_KEY || '');
    }
  };

  // --- Workflow Actions ---

  // Stage 1: Analyze Layout
  const handleAnalyzeLayout = async () => {
    if (!project.layoutFile) return;
    setIsLoading(true);
    setError(null);
    try {
      // Analyze returns object with dimensions and details now
      const analyzedRooms = await analyzeLayout(apiKey, project.layoutFile.base64);
      
      const initialRooms: Room[] = analyzedRooms.map((r, idx) => ({
        id: `room-${idx}`,
        name: r.name,
        dimensions: r.dimensions,
        details: r.details,
        status: 'pending',
        styleReference: null,
        generatedViews: {},
        chatHistory: [],
        finalImage: null
      }));

      setProject(prev => ({
        ...prev,
        stage: 'CONFIRM_ROOMS',
        rooms: initialRooms
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to edit room details in Stage 2
  const updateRoomData = (id: string, field: keyof Room, value: string) => {
    setProject(prev => ({
      ...prev,
      rooms: prev.rooms.map(r => r.id === id ? { ...r, [field]: value } : r)
    }));
  };

  // Stage 2: Confirm Rooms & Select specific one to start
  const handleStartDesign = (startRoomId?: string) => {
    setProject(prev => ({
      ...prev,
      stage: 'DESIGN_LOOP',
      currentRoomId: startRoomId || prev.rooms[0]?.id || null
    }));
  };

  // Stage 3: Generate Views (Two Step Process)
  const handleGenerateRoom = async () => {
    if (!project.currentRoomId || !project.layoutFile) return;
    
    const roomIndex = project.rooms.findIndex(r => r.id === project.currentRoomId);
    if (roomIndex === -1) return;
    const room = project.rooms[roomIndex];

    setIsLoading(true);
    // Step 1: Generate Hero
    updateRoom(room.id, { status: 'generating_hero', preferences: designPreferences });

    try {
      // 1. Generate Hero View
      const heroImage = await generateHeroView(
        apiKey,
        project.layoutFile.base64,
        room.name,
        room.dimensions, // Pass dimensions
        room.details,    // Pass details
        designPreferences,
        currentStyleRef?.base64 || null,
        project.projectStyleReference, // Pass the Locked Project Style!
        currentPrompt
      );

      // Save Hero View & Move to Step 2
      updateRoom(room.id, { 
        status: 'generating_secondary',
        generatedViews: { [ViewPerspective.EYE_LEVEL]: heroImage }
      });

      // 2. Generate Secondary Views using Hero as reference
      const secondaryViews = await generateSecondaryViews(
        apiKey,
        project.layoutFile.base64,
        heroImage,
        room.name
      );

      // Merge results
      const allViews = { ...secondaryViews, [ViewPerspective.EYE_LEVEL]: heroImage };
      
      const initialChat: ChatMessage = {
        role: 'assistant',
        content: `I've generated the ${room.name} based on your "${designPreferences.style}" style. I've ensured all perspectives match the Hero view structurally.`,
        timestamp: Date.now()
      };

      updateRoom(room.id, { 
        status: 'reviewing', 
        generatedViews: allViews,
        chatHistory: [initialChat]
      });

    } catch (err: any) {
      setError(err.message);
      updateRoom(room.id, { status: 'pending' });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Chat File Attachment
  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setChatAttachment({
          file,
          previewUrl: URL.createObjectURL(file),
          base64: reader.result as string,
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeChatAttachment = () => {
    setChatAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Stage 3: Refine/Chat
  const handleSendMessage = async () => {
    if ((!chatInput.trim() && !chatAttachment) || !project.currentRoomId) return;

    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room) return;
    
    const activeViewKey = ViewPerspective.EYE_LEVEL;
    const currentImage = room.generatedViews[activeViewKey];

    if (!currentImage) return;

    const userMsg: ChatMessage = { 
      role: 'user', 
      content: chatInput, 
      timestamp: Date.now(),
      attachment: chatAttachment || undefined
    };

    const updatedHistory = [...room.chatHistory, userMsg];
    updateRoom(room.id, { chatHistory: updatedHistory });
    
    setChatInput('');
    setChatAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    setIsLoading(true);

    try {
      const newImage = await refineRoomRender(
        apiKey, 
        currentImage, 
        userMsg.content,
        userMsg.attachment?.base64 // Pass the reference image
      );
      
      const updatedViews = { ...room.generatedViews, [activeViewKey]: newImage };
      
      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: "Updated. Note: Only the Hero view is updated in this edit loop. If you love it, I'll assume this style for the next room.", 
        timestamp: Date.now() 
      };

      updateRoom(room.id, { 
        generatedViews: updatedViews,
        chatHistory: [...updatedHistory, assistantMsg]
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Stage 3: Approve
  const handleApproveRoom = () => {
    if (!project.currentRoomId) return;
    const roomIndex = project.rooms.findIndex(r => r.id === project.currentRoomId);
    const room = project.rooms[roomIndex];
    
    const finalImg = room.generatedViews[ViewPerspective.EYE_LEVEL] || Object.values(room.generatedViews)[0];
    
    // Set Room as completed
    const updatedRooms = project.rooms.map(r => r.id === room.id ? { ...r, status: 'completed' as RoomStatus, finalImage: finalImg || null } : r);
    
    // PROJECT STYLE LOGIC:
    // If this is the FIRST room being completed (or no style ref exists yet),
    // we LOCK this image as the Project Style Reference.
    let newProjectStyleRef = project.projectStyleReference;
    if (!newProjectStyleRef && finalImg) {
      newProjectStyleRef = finalImg;
    }

    // Move to next room or export
    if (roomIndex < project.rooms.length - 1) {
      const nextRoom = project.rooms[roomIndex + 1];
      setProject(prev => ({
        ...prev,
        rooms: updatedRooms,
        currentRoomId: nextRoom.id,
        projectStyleReference: newProjectStyleRef
      }));
      // Reset inputs for next room
      setCurrentPrompt('');
      setCurrentStyleRef(null);
      // We Keep preferences to minimize typing, but the "Project Style" will override visuals
    } else {
      setProject(prev => ({ 
        ...prev, 
        rooms: updatedRooms,
        stage: 'EXPORT',
        projectStyleReference: newProjectStyleRef
      }));
    }
  };

  const updateRoom = (roomId: string, updates: Partial<Room>) => {
    setProject(prev => ({
      ...prev,
      rooms: prev.rooms.map(r => r.id === roomId ? { ...r, ...updates } : r)
    }));
  };

  const selectRoom = (roomId: string) => {
    setProject(prev => ({ ...prev, currentRoomId: roomId }));
  };

  const activeRoom = project.rooms.find(r => r.id === project.currentRoomId);
  
  // --- RENDER ---
  if (!hasApiKey) {
     return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center p-4">
        {/* Auth Screen */}
        <div className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative">
            <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-lg mx-auto">
              <Key className="text-indigo-400" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2 text-center">Authentication</h1>
            <button onClick={handleSelectKey} className="w-full py-3 bg-white text-black rounded-xl font-semibold hover:bg-zinc-200 mt-4">Connect API Key</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30">
      <Header />
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 lg:p-6 flex flex-col">
        
        {/* Progress Stepper */}
        <div className="mb-8 flex items-center justify-center gap-4 text-sm font-medium text-zinc-500">
          <div className={`flex items-center gap-2 ${project.stage === 'UPLOAD' ? 'text-indigo-400' : ''}`}>
            <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center">1</span> Layout
          </div>
          <ChevronRight size={16} />
          <div className={`flex items-center gap-2 ${project.stage === 'CONFIRM_ROOMS' ? 'text-indigo-400' : ''}`}>
             <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center">2</span> Spaces
          </div>
          <ChevronRight size={16} />
          <div className={`flex items-center gap-2 ${project.stage === 'DESIGN_LOOP' ? 'text-indigo-400' : ''}`}>
             <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center">3</span> Design
          </div>
          <ChevronRight size={16} />
          <div className={`flex items-center gap-2 ${project.stage === 'EXPORT' ? 'text-indigo-400' : ''}`}>
             <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center">4</span> Export
          </div>
        </div>

        {/* STAGE 1: UPLOAD */}
        {project.stage === 'UPLOAD' && (
           <div className="max-w-2xl mx-auto w-full mt-12 animate-in fade-in slide-in-from-bottom-8">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent mb-4">Let's Start with the Blueprint</h1>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 backdrop-blur-sm">
              <ImageUpload label="Floorplan" description="Upload PNG or JPG" fileData={project.layoutFile} onFileSelect={(f) => setProject(prev => ({ ...prev, layoutFile: f }))} />
              <button onClick={handleAnalyzeLayout} disabled={!project.layoutFile || isLoading} className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="animate-spin" /> : 'Analyze Layout'}
              </button>
            </div>
          </div>
        )}

        {/* STAGE 2: CONFIRM ROOMS - UPDATED UI */}
        {project.stage === 'CONFIRM_ROOMS' && (
          <div className="max-w-5xl mx-auto w-full mt-12 animate-in fade-in">
             <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white mb-2">Confirm & Edit Spaces</h2>
                <p className="text-zinc-400">Review the identified rooms. Add dimensions or details to ensure accuracy.</p>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {project.rooms.map((room) => (
                <div key={room.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl hover:border-zinc-700 transition-colors group">
                  
                  {/* Header & Name */}
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                          <Layout size={16} />
                       </div>
                       <input 
                         value={room.name}
                         onChange={(e) => updateRoomData(room.id, 'name', e.target.value)}
                         className="bg-transparent font-bold text-lg text-white w-full outline-none focus:text-indigo-400 transition-colors"
                       />
                    </div>
                  </div>

                  {/* Dimensions Input */}
                  <div>
                    <label className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1 block">Dimensions</label>
                    <input 
                      value={room.dimensions}
                      onChange={(e) => updateRoomData(room.id, 'dimensions', e.target.value)}
                      placeholder="e.g. 12' x 14'"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  {/* Details Input */}
                  <div>
                    <label className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1 block">Structural Details</label>
                    <textarea 
                      value={room.details}
                      onChange={(e) => updateRoomData(room.id, 'details', e.target.value)}
                      placeholder="e.g. Bay window, Kitchen Island..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none h-20 resize-none"
                    />
                  </div>

                  <button 
                    onClick={() => handleStartDesign(room.id)}
                    className="mt-auto w-full py-3 bg-zinc-800 hover:bg-indigo-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                  >
                    Start Design <ArrowRight size={16} />
                  </button>

                </div>
              ))}
            </div>
            
            <div className="flex justify-center">
               <p className="text-zinc-500 text-sm">Select a room above to begin the design process.</p>
            </div>
          </div>
        )}

        {/* STAGE 3: DESIGN LOOP */}
        {project.stage === 'DESIGN_LOOP' && (
          <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)] min-h-[600px]">
            {/* Sidebar */}
            <div className="w-full lg:w-72 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex flex-col h-full overflow-hidden">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 px-2">Project Spaces</h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {project.rooms.map((room) => (
                  <button key={room.id} onClick={() => selectRoom(room.id)} className={`w-full text-left p-3 rounded-lg flex items-center justify-between ${room.id === project.currentRoomId ? 'bg-indigo-600/10 border border-indigo-500/50 text-white' : 'hover:bg-zinc-800 text-zinc-400 border border-transparent'}`}>
                    <span className="text-sm font-medium truncate">{room.name}</span>
                    {room.status === 'completed' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col gap-6 h-full overflow-hidden">
               {activeRoom && (
                <div className="flex items-center justify-between bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50 shrink-0">
                  <div className="flex flex-col">
                     <h2 className="text-xl font-bold flex items-center gap-2">{activeRoom.name}</h2>
                     <p className="text-xs text-zinc-500 font-mono">{activeRoom.dimensions} • {activeRoom.details}</p>
                  </div>
                  {(activeRoom.status === 'reviewing') && (
                    <button onClick={handleApproveRoom} className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2">
                      {project.projectStyleReference ? "Approve & Next Room" : "Love it (Lock Project Style)"} <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
                {/* 1. CONFIGURATION */}
                {activeRoom?.status === 'pending' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                     <div className="space-y-6">
                        <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800">
                          <h3 className="text-lg font-medium text-white mb-6">Design Configuration</h3>
                          
                          {/* GLOBAL PROJECT STYLE INDICATOR */}
                          {project.projectStyleReference ? (
                            <div className="mb-6 p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex gap-4">
                              <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-emerald-500/20">
                                <img src={project.projectStyleReference} className="w-full h-full object-cover" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2"><Lock size={14} /> Project Style Locked</h4>
                                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                  Using the visual style from the first room as the master reference. 
                                  Materials, lighting, and palette will be automatically matched.
                                </p>
                              </div>
                            </div>
                          ) : (
                             // Only show manual upload if NO project style is locked yet
                            <div className="mb-6">
                              <ImageUpload 
                                label="Style Reference (First Room)" 
                                description="Upload an inspiration image. This will define the style for the ENTIRE project." 
                                fileData={currentStyleRef} 
                                onFileSelect={setCurrentStyleRef} 
                              />
                            </div>
                          )}

                          <DesignSelectors preferences={designPreferences} onChange={setDesignPreferences} />
                          
                          <div className="mt-6 pt-6 border-t border-zinc-800">
                             <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Specific Notes</label>
                             <textarea 
                                value={currentPrompt}
                                onChange={(e) => setCurrentPrompt(e.target.value)}
                                placeholder="Any additional requirements beyond the architectural details?"
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-sm h-20 resize-none focus:border-indigo-500 outline-none"
                             />
                          </div>
                        </div>

                        <button onClick={handleGenerateRoom} disabled={isLoading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
                          {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 size={20} />} Generate Architecture
                        </button>
                     </div>
                     <div className="hidden lg:flex flex-col items-center justify-center bg-zinc-900/20 rounded-2xl border border-zinc-800/50 p-8 text-center">
                        <img src={project.layoutFile?.previewUrl} alt="Layout" className="max-h-[300px] object-contain opacity-70 border border-zinc-700 rounded-lg mb-4" />
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 w-full max-w-sm">
                           <h4 className="font-bold text-sm mb-2 text-white">Room Specs</h4>
                           <div className="text-xs text-zinc-400 grid grid-cols-2 gap-2 text-left">
                              <div><span className="text-zinc-500 block">Dimensions</span> {activeRoom.dimensions}</div>
                              <div><span className="text-zinc-500 block">Details</span> {activeRoom.details}</div>
                           </div>
                        </div>
                     </div>
                  </div>
                )}

                {/* 2. LOADING STATES */}
                {(activeRoom?.status === 'generating_hero' || activeRoom?.status === 'generating_secondary') && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
                    <div className="w-full max-w-2xl bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 relative aspect-video flex items-center justify-center">
                       {/* If we have Hero, show it while loading others */}
                       {activeRoom.generatedViews[ViewPerspective.EYE_LEVEL] ? (
                          <>
                             <img src={activeRoom.generatedViews[ViewPerspective.EYE_LEVEL]} className="w-full h-full object-cover opacity-50 blur-sm" />
                             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                                <Loader2 size={40} className="animate-spin text-white mb-2" />
                                <p className="text-white font-bold">Generating secondary views based on Hero...</p>
                             </div>
                          </>
                       ) : (
                          <div className="flex flex-col items-center">
                             <Loader2 size={40} className="animate-spin text-indigo-500 mb-4" />
                             <p className="text-zinc-400">Constructing Hero View...</p>
                          </div>
                       )}
                    </div>
                  </div>
                )}

                {/* 3. REVIEW */}
                {(activeRoom?.status === 'reviewing' || activeRoom?.status === 'completed') && (
                   <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-[600px]">
                      {/* Chat Sidebar */}
                      <div className="xl:col-span-4 flex flex-col bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden h-full">
                         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {activeRoom.chatHistory.map((msg, idx) => (
                               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm space-y-2 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                                    {msg.attachment && (
                                      <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                                        <img src={msg.attachment.previewUrl} className="w-full h-auto object-cover max-h-32" />
                                      </div>
                                    )}
                                    <div>{msg.content}</div>
                                  </div>
                               </div>
                            ))}
                            <div ref={chatEndRef} />
                         </div>
                         
                         {/* Input Area */}
                         <div className="p-3 bg-zinc-900/60 border-t border-zinc-800 relative">
                            {/* Attachment Preview */}
                            {chatAttachment && (
                              <div className="absolute bottom-full left-4 mb-2 p-2 bg-zinc-800 rounded-lg border border-zinc-700 shadow-lg flex items-center gap-2">
                                <img src={chatAttachment.previewUrl} className="w-10 h-10 object-cover rounded" />
                                <span className="text-xs text-zinc-300 max-w-[100px] truncate">{chatAttachment.file.name}</span>
                                <button onClick={removeChatAttachment} className="p-1 hover:bg-zinc-700 rounded-full"><X size={12} /></button>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <button onClick={() => fileInputRef.current?.click()} className={`p-2 rounded-full transition-colors ${chatAttachment ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                                <Paperclip size={18} />
                              </button>
                              <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={handleChatFileSelect} 
                              />
                              
                              <input 
                                value={chatInput} 
                                onChange={(e) => setChatInput(e.target.value)} 
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
                                placeholder="Refine design..." 
                                className="flex-1 bg-black border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" 
                              />
                              <button onClick={handleSendMessage} className="p-2 text-zinc-400 hover:text-white"><Send size={18} /></button>
                            </div>
                         </div>
                      </div>

                      {/* Images Grid */}
                      <div className="xl:col-span-8 overflow-y-auto custom-scrollbar">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="col-span-1 md:col-span-2 relative group rounded-2xl overflow-hidden border border-zinc-800">
                               <img src={activeRoom.generatedViews[ViewPerspective.EYE_LEVEL]} className="w-full h-auto object-cover max-h-[400px]" />
                               <div className="absolute bottom-0 left-0 p-4 bg-black/60 text-white text-sm font-bold">Hero View (Source of Truth)</div>
                            </div>
                            {[ViewPerspective.WIDE_ANGLE, ViewPerspective.OVERHEAD, ViewPerspective.DETAIL].map(p => (
                               <div key={p} className="relative group rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
                                  {activeRoom.generatedViews[p] ? (
                                     <img src={activeRoom.generatedViews[p]} className="w-full h-48 object-cover" />
                                  ) : <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}
                                  <div className="absolute bottom-0 left-0 p-2 bg-black/60 text-white text-xs">{p}</div>
                               </div>
                            ))}
                         </div>
                      </div>
                   </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
