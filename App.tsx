
import React, { useState, useEffect, useRef } from 'react';
import { 
  Wand2, Download, AlertCircle, Eye, Loader2, Sparkles, MoveRight, 
  ImagePlus, Key, ExternalLink, Send, Layout, CheckCircle2, ArrowRight,
  ChevronRight, Lock, History, PlayCircle, Pencil, Save, Paperclip, X,
  Lightbulb, Palette, Sun, ShieldCheck, ZoomIn, Minimize2, Check, MousePointer2, BrickWall, Ruler,
  MoveLeft, RotateCw, Trash2, MoreHorizontal, Layers
} from 'lucide-react';
import Header from './components/Header';
import ImageUpload from './components/ImageUpload';
import DesignSelectors from './components/DesignSelectors';
import { FileData, ViewPerspective, ProjectState, Room, RoomStatus, ChatMessage, DesignPreferences, Hotspot, StructuralHotspot, StructureActionType } from './types';
import { 
  analyzeLayout, generateHeroView, generateSecondaryViews, refineRoomRender, 
  generateDesignAudit, runComplianceCheck, integrateCrop, detectHotspots, syncSecondaryViews, generateWireframeView,
  detectStructuralHotspots, modifyStructure
} from './services/geminiService';

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
  const [isSyncing, setIsSyncing] = useState(false); // New state for updating all views
  const [error, setError] = useState<string | null>(null);
  
  // Design Loop Inputs
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentStyleRef, setCurrentStyleRef] = useState<FileData | null>(null);
  const [designPreferences, setDesignPreferences] = useState<DesignPreferences>({
    mood: 'Cozy & Intimate',
    materials: 'Natural (Wood & Stone)',
    colors: 'Warm Earth Tones',
    lighting: 'Natural Daylight'
  });

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatAttachment, setChatAttachment] = useState<FileData | null>(null);
  
  // Compliance UI State
  const [showCompliance, setShowCompliance] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  
  // Structural Edit State
  const [activeStructuralSpot, setActiveStructuralSpot] = useState<StructuralHotspot | null>(null);

  // Refs for scrolling & canvas
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // For handling crops

  // --- Initialization ---
  useEffect(() => {
    checkApiKey();
    if (process.env.API_KEY) setApiKey(process.env.API_KEY);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [project.rooms, project.rooms.find(r => r.id === project.currentRoomId)?.chatHistory]);

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
      const analyzedRooms = await analyzeLayout(apiKey, project.layoutFile.base64);
      
      const initialRooms: Room[] = analyzedRooms.map((r, idx) => ({
        id: `room-${idx}`,
        name: r.name,
        dimensions: r.dimensions,
        details: r.details,
        structuralConstraints: r.structural_constraints, // Capture strict constraints
        status: 'pending',
        sketchImage: null,
        styleReference: null,
        generatedViews: {},
        chatHistory: [],
        finalImage: null,
        activePerspective: ViewPerspective.EYE_LEVEL,
        isHeroApproved: false
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

  // Stage 2: Confirm Rooms
  const handleStartDesign = (startRoomId?: string) => {
    setProject(prev => ({
      ...prev,
      stage: 'DESIGN_LOOP',
      currentRoomId: startRoomId || prev.rooms[0]?.id || null
    }));
  };

  // PHASE 1: GENERATE STRUCTURAL SKETCH
  const handleGenerateSketch = async () => {
    if (!project.currentRoomId || !project.layoutFile) return;
    const roomIndex = project.rooms.findIndex(r => r.id === project.currentRoomId);
    if (roomIndex === -1) return;
    const room = project.rooms[roomIndex];

    setIsLoading(true);
    updateRoom(room.id, { status: 'generating_sketch' });

    try {
      const sketchImage = await generateWireframeView(
        apiKey,
        project.layoutFile.base64,
        room.name,
        room.dimensions,
        room.structuralConstraints,
        currentPrompt // Use prompt for structural notes
      );
      
      // Auto-detect structural items for editing
      const structuralHotspots = await detectStructuralHotspots(apiKey, sketchImage);

      const initialChat: ChatMessage = {
        role: 'assistant',
        content: `I've created a Clay Model based on the floorplan. Click the markers to Move/Rotate objects if the layout isn't perfect yet.`,
        timestamp: Date.now()
      };

      updateRoom(room.id, {
        status: 'reviewing_sketch',
        sketchImage,
        structuralHotspots,
        chatHistory: [initialChat]
      });

    } catch (err: any) {
      setError(err.message);
      updateRoom(room.id, { status: 'pending' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // PHASE 1.1: MODIFY STRUCTURE (Interactive Edit)
  const handleModifyStructure = async (action: StructureActionType) => {
    if (!project.currentRoomId || !activeStructuralSpot) return;
    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room || !room.sketchImage) return;
    
    setIsLoading(true);
    setActiveStructuralSpot(null); // Close menu
    
    try {
      const newSketch = await modifyStructure(apiKey, room.sketchImage, action, activeStructuralSpot.label);
      
      const actionText = action === 'move_left' ? 'Moved Left' : 
                         action === 'move_right' ? 'Moved Right' : 
                         action === 'rotate_90' ? 'Rotated' : 'Deleted';
                         
      const userMsg: ChatMessage = {
        role: 'user',
        content: `${actionText}: ${activeStructuralSpot.label}`,
        timestamp: Date.now()
      };
      
      // Refresh hotspots on new image
      const newHotspots = await detectStructuralHotspots(apiKey, newSketch);
      
      updateRoom(room.id, {
        sketchImage: newSketch,
        structuralHotspots: newHotspots,
        chatHistory: [...room.chatHistory, userMsg, {
          role: 'assistant',
          content: `I've updated the structure. ${activeStructuralSpot.label} has been adjusted.`,
          timestamp: Date.now()
        }]
      });
      
    } catch(err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // PHASE 1.5: APPROVE SKETCH -> MOVE TO DESIGN
  const handleApproveSketch = () => {
    if (!project.currentRoomId) return;
    updateRoom(project.currentRoomId, { status: 'designing' });
  };

  // PHASE 2A: GENERATE HERO RENDER (Step 1)
  const handleGenerateRoom = async () => {
    if (!project.currentRoomId || !project.layoutFile) return;
    
    const roomIndex = project.rooms.findIndex(r => r.id === project.currentRoomId);
    if (roomIndex === -1) return;
    const room = project.rooms[roomIndex];

    setIsLoading(true);
    updateRoom(room.id, { status: 'generating_hero', preferences: designPreferences, isHeroApproved: false });

    try {
      // 1. Generate Hero View using Approved Sketch as Guide
      const heroImage = await generateHeroView(
        apiKey,
        project.layoutFile.base64,
        room.sketchImage, // PASS THE SKETCH!
        room.name,
        room.dimensions,
        room.structuralConstraints, 
        room.details,
        designPreferences,
        currentStyleRef?.base64 || null,
        project.projectStyleReference, 
        currentPrompt
      );

      // 2. Generate Audit & Hotspots (But NOT secondary views yet)
      const [audit, spots] = await Promise.all([
        generateDesignAudit(apiKey, heroImage, room.name),
        detectHotspots(apiKey, heroImage)
      ]);

      const initialChat: ChatMessage = {
        role: 'assistant',
        content: `I've rendered the Hero Shot. Chat with me to refine details, or click "Lock Look & Build Suite" to generate the rest of the room.`,
        timestamp: Date.now()
      };

      updateRoom(room.id, { 
        status: 'reviewing', 
        generatedViews: { [ViewPerspective.EYE_LEVEL]: heroImage },
        chatHistory: [initialChat],
        designAudit: audit,
        hotspots: spots,
        activePerspective: ViewPerspective.EYE_LEVEL,
        isHeroApproved: false // Explicitly false until user approves
      });

    } catch (err: any) {
      setError(err.message);
      updateRoom(room.id, { status: 'designing' }); // Go back to design phase if fail
    } finally {
      setIsLoading(false);
    }
  };

  // PHASE 2B: APPROVE HERO -> GENERATE SUITE (Step 2)
  const handleApproveHeroAndBuildSuite = async () => {
    if (!project.currentRoomId || !project.layoutFile) return;
    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room || !room.generatedViews[ViewPerspective.EYE_LEVEL]) return;

    const heroImage = room.generatedViews[ViewPerspective.EYE_LEVEL]!;
    
    // 1. Lock the Look
    setIsLoading(true);
    updateRoom(room.id, { 
        status: 'generating_secondary', 
        isHeroApproved: true 
    });

    // Update Project Style Ref immediately (Learning)
    setProject(prev => ({ ...prev, projectStyleReference: heroImage }));

    try {
        // 2. Build the Suite based on the Hero
        const secondaryViews = await generateSecondaryViews(apiKey, project.layoutFile.base64, heroImage, room.name);
        
        updateRoom(room.id, {
            status: 'reviewing',
            generatedViews: { ...room.generatedViews, ...secondaryViews },
            chatHistory: [...room.chatHistory, {
                role: 'assistant',
                content: "Full suite generated! The style has been memorized for the project.",
                timestamp: Date.now()
            }]
        });

    } catch (err: any) {
        setError(err.message);
        updateRoom(room.id, { status: 'reviewing' });
    } finally {
        setIsLoading(false);
    }
  };

  // --- View Switching ---
  const handleSwitchView = async (perspective: ViewPerspective) => {
    if (!project.currentRoomId) return;
    
    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room) return;

    if (room.activePerspective === perspective) return;

    // Optimistic switch
    updateRoom(room.id, { activePerspective: perspective, hotspots: [] });
    
    // Background: Detect hotspots for the new perspective
    if (room.generatedViews[perspective]) {
       try {
         const newSpots = await detectHotspots(apiKey, room.generatedViews[perspective]!);
         updateRoom(room.id, { hotspots: newSpots });
       } catch (e) {
         console.error("Failed to refresh hotspots");
       }
    }
  };


  // --- Focus Mode / Magic Zoom Logic ---
  // ... (Same as before)
  const handleHotspotClick = (spot: Hotspot) => {
      const room = project.rooms.find(r => r.id === project.currentRoomId);
      if (!room || !room.generatedViews[room.activePerspective]) return;

      const imgElement = document.getElementById('main-view-image') as HTMLImageElement;
      if (!imgElement) return;
      
      const xPct = spot.x / 100;
      const yPct = spot.y / 100;

      createFocusCrop(room, imgElement, xPct, yPct, spot.label);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const activeRoom = project.rooms.find(r => r.id === project.currentRoomId);
    if (!activeRoom || activeRoom.status !== 'reviewing' || isLoading) return;
    if (activeRoom.focusState?.isActive) return;

    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    createFocusCrop(activeRoom, img, xPercent, yPercent, "Custom Area");
  };

  const createFocusCrop = (room: Room, imgElement: HTMLImageElement, xPct: number, yPct: number, label: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;
    const cropSize = Math.min(naturalWidth, naturalHeight) * 0.45; // 45% zoom

    let cx = xPct * naturalWidth;
    let cy = yPct * naturalHeight;

    cx = Math.max(cropSize/2, Math.min(cx, naturalWidth - cropSize/2));
    cy = Math.max(cropSize/2, Math.min(cy, naturalHeight - cropSize/2));

    const startX = cx - cropSize/2;
    const startY = cy - cropSize/2;

    canvas.width = cropSize;
    canvas.height = cropSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(imgElement, startX, startY, cropSize, cropSize, 0, 0, cropSize, cropSize);
    const cropBase64 = canvas.toDataURL('image/png');

    updateRoom(room.id, {
      focusState: {
        isActive: true,
        x: xPct,
        y: yPct,
        label,
        originalCrop: cropBase64,
        currentCrop: cropBase64
      },
      chatHistory: [...room.chatHistory, {
        role: 'assistant',
        content: `Zoomed in on ${label}. What specific change would you like to make here?`,
        timestamp: Date.now()
      }]
    });
  };

  const exitFocusMode = () => {
    if (!project.currentRoomId) return;
    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room) return;

    updateRoom(room.id, {
      focusState: undefined,
      chatHistory: [...room.chatHistory, {
        role: 'assistant',
        content: "Exited Focus Mode.",
        timestamp: Date.now()
      }]
    });
  };

  const handleMergeFocusEdit = async () => {
    if (!project.currentRoomId) return;
    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room || !room.focusState) return;

    setIsLoading(true);
    try {
      const fullImage = room.generatedViews[room.activePerspective];
      if (!fullImage) throw new Error("Missing full image");

      const mergedImage = await integrateCrop(apiKey, fullImage, room.focusState.currentCrop);

      updateRoom(room.id, {
        generatedViews: { ...room.generatedViews, [room.activePerspective]: mergedImage },
        focusState: undefined, 
        chatHistory: [...room.chatHistory, {
          role: 'assistant',
          content: "Successfully merged changes. Note: This change is local. Re-sync if needed.",
          timestamp: Date.now()
        }]
      });

      // Optionally auto-sync, but for focus edits usually better to keep fast first
      if (room.isHeroApproved) {
          triggerGlobalSync(room, mergedImage);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };


  // --- Compliance Check ---
  const handleRunCompliance = async () => {
    if (!project.currentRoomId || !project.layoutFile) return;
    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room) return;

    const currentImg = room.generatedViews[room.activePerspective];
    if (!currentImg) return;

    setIsAuditing(true);
    try {
      const report = await runComplianceCheck(apiKey, project.layoutFile.base64, currentImg, room.name);
      updateRoom(room.id, { complianceReport: report });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAuditing(false);
    }
  };

  // --- Global Sync Logic ---
  const triggerGlobalSync = async (room: Room, newSourceImage: string) => {
      if (!project.layoutFile) return;
      setIsSyncing(true);
      try {
          const syncedViews = await syncSecondaryViews(apiKey, project.layoutFile.base64, newSourceImage, room.name);
          updateRoom(room.id, {
              generatedViews: {
                  ...syncedViews,
                  [room.activePerspective]: newSourceImage 
              }
          });
      } catch (e) {
          console.error("Failed to sync views", e);
      } finally {
          setIsSyncing(false);
      }
  };


  // --- Chat ---
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

  const handleSendMessage = async () => {
    if ((!chatInput.trim() && !chatAttachment) || !project.currentRoomId) return;

    const room = project.rooms.find(r => r.id === project.currentRoomId);
    if (!room) return;
    
    // Determine target image (Sketch or Final or Crop)
    let currentImage = '';
    const isFocusMode = room.focusState?.isActive;
    
    if (room.status === 'reviewing_sketch') {
      currentImage = room.sketchImage || '';
    } else if (isFocusMode) {
      currentImage = room.focusState?.currentCrop || '';
    } else {
      currentImage = room.generatedViews[room.activePerspective] || '';
    }

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
        userMsg.attachment?.base64
      );
      
      let assistantMsgContent = "Updated.";
      let updates: Partial<Room> = {};

      if (room.status === 'reviewing_sketch') {
         updates = { sketchImage: newImage };
         assistantMsgContent = "Updated the Clay Model. How does the structure look now?";
      } else if (isFocusMode && room.focusState) {
         updates = {
           focusState: { ...room.focusState, currentCrop: newImage }
         };
         assistantMsgContent = "I've updated the focus area. Click 'Love it' to merge this change.";
      } else {
         updates = {
           generatedViews: { ...room.generatedViews, [room.activePerspective]: newImage }
         };
         
         // If we are editing the Hero view BEFORE approval, we don't need to sync yet.
         // If AFTER approval, we should sync.
         if (room.isHeroApproved) {
            assistantMsgContent = "Updated the view. Syncing changes to other angles...";
            triggerGlobalSync(room, newImage);
         } else {
            assistantMsgContent = "Hero view updated. Approve when ready to generate other angles.";
         }
      }

      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: assistantMsgContent, 
        timestamp: Date.now() 
      };

      updateRoom(room.id, { 
        ...updates,
        chatHistory: [...updatedHistory, assistantMsg]
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveRoom = () => {
    if (!project.currentRoomId) return;
    const roomIndex = project.rooms.findIndex(r => r.id === project.currentRoomId);
    const room = project.rooms[roomIndex];
    
    const finalImg = room.generatedViews[ViewPerspective.EYE_LEVEL] || Object.values(room.generatedViews)[0];
    const updatedRooms = project.rooms.map(r => r.id === room.id ? { ...r, status: 'completed' as RoomStatus, finalImage: finalImg || null } : r);
    
    let newProjectStyleRef = project.projectStyleReference;
    if (!newProjectStyleRef && finalImg) {
      newProjectStyleRef = finalImg;
    }

    if (roomIndex < project.rooms.length - 1) {
      const nextRoom = project.rooms[roomIndex + 1];
      setProject(prev => ({
        ...prev,
        rooms: updatedRooms,
        currentRoomId: nextRoom.id,
        projectStyleReference: newProjectStyleRef
      }));
      setCurrentPrompt('');
      setCurrentStyleRef(null);
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
  const isFocusMode = activeRoom?.focusState?.isActive;
  
  if (!hasApiKey) {
     return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center p-4">
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
      
      {/* Hidden Canvas for Crop Ops */}
      <canvas ref={canvasRef} className="hidden" />

      <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 lg:p-6 flex flex-col">
        {/* Progress Stepper */}
        <div className="mb-8 flex items-center justify-center gap-4 text-sm font-medium text-zinc-500">
           {['UPLOAD', 'CONFIRM_ROOMS', 'DESIGN_LOOP', 'EXPORT'].map((s, i) => (
             <React.Fragment key={s}>
               <div className={`flex items-center gap-2 ${project.stage === s ? 'text-indigo-400 font-bold' : ''}`}>
                 <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${project.stage === s ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-700'}`}>
                   {i + 1}
                 </span>
                 {s.replace('_', ' ')}
               </div>
               {i < 3 && <div className="w-8 h-[1px] bg-zinc-800" />}
             </React.Fragment>
           ))}
        </div>

        {/* STAGE 1 & 2 */}
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

        {project.stage === 'CONFIRM_ROOMS' && (
          <div className="max-w-5xl mx-auto w-full mt-12 animate-in fade-in">
             <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white mb-2">Confirm & Edit Spaces</h2>
                <p className="text-zinc-400">Review the identified rooms. Add dimensions or details to ensure accuracy.</p>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {project.rooms.map((room) => (
                <div key={room.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl hover:border-zinc-700 transition-colors group">
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
                  <div>
                    <label className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1 block">Dimensions</label>
                    <input 
                      value={room.dimensions}
                      onChange={(e) => updateRoomData(room.id, 'dimensions', e.target.value)}
                      placeholder="e.g. 12' x 14'"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-amber-500 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                      <BrickWall size={12} /> Structural Constraints (Fixed)
                    </label>
                    <textarea 
                      value={room.structuralConstraints}
                      onChange={(e) => updateRoomData(room.id, 'structuralConstraints', e.target.value)}
                      placeholder="e.g. Booths on left wall, Bar in center..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none h-24 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1 block">General Details</label>
                    <textarea 
                      value={room.details}
                      onChange={(e) => updateRoomData(room.id, 'details', e.target.value)}
                      placeholder="e.g. Loose tables, plants..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none h-16 resize-none"
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
          </div>
        )}

        {/* STAGE 3: DESIGN LOOP */}
        {project.stage === 'DESIGN_LOOP' && (
          <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)] min-h-[600px] relative">
            
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
            <div className="flex-1 flex flex-col gap-6 h-full overflow-hidden relative">
               {activeRoom && (
                <div className="flex items-center justify-between bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50 shrink-0">
                  <div className="flex flex-col">
                     <h2 className="text-xl font-bold flex items-center gap-2">{activeRoom.name}</h2>
                     <p className="text-xs text-zinc-500 font-mono">{activeRoom.dimensions} • {activeRoom.details}</p>
                  </div>
                  
                  {/* Status Badges */}
                  <div className="flex items-center gap-3">
                     {activeRoom.status === 'pending' && <span className="text-xs bg-zinc-800 px-3 py-1 rounded-full text-zinc-400">Not Started</span>}
                     {(activeRoom.status === 'generating_sketch' || activeRoom.status === 'reviewing_sketch') && <span className="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full border border-amber-500/50 flex items-center gap-1"><Ruler size={12}/> Phase 1: Structure</span>}
                     {activeRoom.status === 'designing' && <span className="text-xs bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/50 flex items-center gap-1"><Palette size={12}/> Phase 2: Aesthetics</span>}

                     {(activeRoom.status === 'reviewing' || activeRoom.status === 'completed') && (
                      <div className="flex gap-2">
                        {!activeRoom.isHeroApproved && (
                           <button onClick={handleApproveHeroAndBuildSuite} disabled={isFocusMode || isLoading} className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20">
                             {isLoading ? <Loader2 className="animate-spin" size={16}/> : <Layers size={16} />} 
                             Lock Look & Build Suite
                           </button>
                        )}
                        {activeRoom.isHeroApproved && (
                           <button onClick={handleApproveRoom} className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 transition-colors flex items-center gap-2">
                             Finish Room <ArrowRight size={16} />
                           </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
                
                {/* 1. CONFIGURATION: PHASE 1 (STRUCTURE) */}
                {activeRoom?.status === 'pending' && (
                  <div className="flex items-center justify-center h-full">
                     <div className="max-w-xl w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl p-10 text-center">
                        <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-amber-500">
                          <Ruler size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Phase 1: Structural Verification</h2>
                        <p className="text-zinc-400 mb-8">
                          Before we design, we must verify the geometry. I will create a <span className="text-white font-bold">White Clay Model</span> of the room based on the floorplan.
                        </p>
                        
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8 text-left">
                           <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Confirm Constraints</label>
                           <p className="text-sm text-zinc-300 font-mono">{activeRoom.structuralConstraints}</p>
                           <textarea 
                              className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm resize-none focus:border-amber-500 outline-none"
                              placeholder="Add any specific structural notes before sketching..."
                              value={currentPrompt}
                              onChange={(e) => setCurrentPrompt(e.target.value)}
                           />
                        </div>

                        <button onClick={handleGenerateSketch} disabled={isLoading} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                           {isLoading ? <Loader2 className="animate-spin"/> : 'Generate Structural Sketch'}
                        </button>
                     </div>
                  </div>
                )}

                {/* 1.5 SKETCH LOADING */}
                {activeRoom?.status === 'generating_sketch' && (
                   <div className="h-full flex flex-col items-center justify-center text-center">
                      <Loader2 size={40} className="animate-spin text-amber-500 mb-4" />
                      <p className="text-zinc-400">Building 3D Clay Model from Floorplan...</p>
                   </div>
                )}

                {/* 1.6 SKETCH REVIEW (INTERACTIVE) */}
                {activeRoom?.status === 'reviewing_sketch' && activeRoom.sketchImage && (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                      <div className="flex flex-col gap-4">
                         <div className="bg-black border border-zinc-800 rounded-2xl overflow-hidden aspect-video relative group" onClick={() => setActiveStructuralSpot(null)}>
                            <img src={activeRoom.sketchImage} className="w-full h-full object-contain" />
                            <div className="absolute top-4 left-4 bg-amber-500 text-black px-3 py-1 rounded-full text-xs font-bold uppercase z-10">
                               Clay Model / Wireframe
                            </div>
                            
                            {/* Interactive Structural Hotspots */}
                            {activeRoom.structuralHotspots?.map((spot, idx) => (
                               <div 
                                 key={idx} 
                                 style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                                 className="absolute transform -translate-x-1/2 -translate-y-1/2"
                               >
                                  {/* Trigger Button */}
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setActiveStructuralSpot(spot); }}
                                    className="w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-amber-500 hover:bg-amber-500 hover:text-black transition-all shadow-lg hover:scale-110"
                                  >
                                    <MousePointer2 size={14} />
                                  </button>
                                  
                                  {/* Label Tooltip */}
                                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-[10px] text-white whitespace-nowrap opacity-0 hover:opacity-100 pointer-events-none transition-opacity">
                                    {spot.label}
                                  </div>

                                  {/* Context Menu */}
                                  {activeStructuralSpot?.label === spot.label && (
                                    <div 
                                      className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 w-32 animate-in zoom-in-95 duration-200"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                       <div className="text-[10px] font-bold text-zinc-500 uppercase px-2 py-1 mb-1 border-b border-zinc-800">{spot.label}</div>
                                       <button onClick={() => handleModifyStructure('move_left')} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800 rounded text-xs text-zinc-300 hover:text-white"><MoveLeft size={12}/> Move Left</button>
                                       <button onClick={() => handleModifyStructure('move_right')} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800 rounded text-xs text-zinc-300 hover:text-white"><MoveRight size={12}/> Move Right</button>
                                       <button onClick={() => handleModifyStructure('rotate_90')} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800 rounded text-xs text-zinc-300 hover:text-white"><RotateCw size={12}/> Rotate 90°</button>
                                       <div className="h-[1px] bg-zinc-800 my-1" />
                                       <button onClick={() => handleModifyStructure('delete')} className="flex items-center gap-2 px-2 py-1.5 hover:bg-red-900/30 rounded text-xs text-red-400 hover:text-red-300"><Trash2 size={12}/> Remove</button>
                                    </div>
                                  )}
                               </div>
                            ))}
                         </div>
                         <p className="text-center text-xs text-zinc-500">Click markers to adjust layout before approving.</p>
                         <button onClick={handleApproveSketch} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                            <CheckCircle2 size={20} /> Approve Structure & Continue
                         </button>
                      </div>

                      {/* Chat for Sketch Refinement */}
                      <div className="flex flex-col bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden h-full">
                         <div className="p-4 bg-zinc-900/60 border-b border-zinc-800 font-bold text-zinc-400 text-sm uppercase tracking-wider">
                            Refine Geometry
                         </div>
                         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {activeRoom.chatHistory.map((msg, idx) => (
                               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[90%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                                    {msg.content}
                                  </div>
                               </div>
                            ))}
                         </div>
                         <div className="p-3 bg-zinc-900/60 border-t border-zinc-800 flex gap-2">
                            <input 
                              value={chatInput} 
                              onChange={(e) => setChatInput(e.target.value)} 
                              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
                              placeholder="e.g. Move the booth to the left..."
                              className="flex-1 bg-black border border-zinc-700 rounded-xl px-3 py-3 text-sm outline-none focus:border-amber-500"
                            />
                            <button onClick={handleSendMessage} className="p-2 text-zinc-400 hover:text-white"><Send size={18} /></button>
                         </div>
                      </div>
                   </div>
                )}


                {/* 2. CONFIGURATION: PHASE 2 (AESTHETICS) */}
                {activeRoom?.status === 'designing' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                     <div className="space-y-6">
                        <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800">
                          <h3 className="text-lg font-medium text-white mb-6">Phase 2: Aesthetic Design</h3>
                          
                          {/* SHOW APPROVED SKETCH THUMBNAIL */}
                          {activeRoom.sketchImage && (
                            <div className="mb-6 p-4 bg-amber-950/20 border border-amber-500/20 rounded-xl flex gap-4 items-center">
                              <div className="w-24 h-16 bg-black rounded-lg overflow-hidden shrink-0 border border-zinc-700">
                                 <img src={activeRoom.sketchImage} className="w-full h-full object-cover" />
                              </div>
                              <div>
                                 <span className="text-amber-500 font-bold text-xs uppercase flex items-center gap-1"><Check size={12}/> Structure Approved</span>
                                 <p className="text-xs text-zinc-400 mt-1">This geometry will be preserved.</p>
                              </div>
                            </div>
                          )}

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
                                </p>
                              </div>
                            </div>
                          ) : (
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
                        </div>

                        <button onClick={handleGenerateRoom} disabled={isLoading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
                          {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 size={20} />} Render Photorealistic
                        </button>
                     </div>
                  </div>
                )}

                {/* 2. LOADING STATES */}
                {(activeRoom?.status === 'generating_hero' || activeRoom?.status === 'generating_secondary') && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
                    <div className="w-full max-w-2xl bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 relative aspect-video flex items-center justify-center">
                       {activeRoom.generatedViews[ViewPerspective.EYE_LEVEL] ? (
                          <>
                             <img src={activeRoom.generatedViews[ViewPerspective.EYE_LEVEL]} className="w-full h-full object-cover opacity-50 blur-sm" />
                             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                                <Loader2 size={40} className="animate-spin text-white mb-2" />
                                <p className="text-white font-bold">Building Full Room Suite based on Approved Hero Shot...</p>
                                <p className="text-zinc-400 text-sm mt-2">Memorizing style for future reference.</p>
                             </div>
                          </>
                       ) : (
                          <div className="flex flex-col items-center">
                             <Loader2 size={40} className="animate-spin text-indigo-500 mb-4" />
                             <p className="text-zinc-400">Applying materials to Approved Sketch...</p>
                          </div>
                       )}
                    </div>
                  </div>
                )}

                {/* 3. REVIEW */}
                {(activeRoom?.status === 'reviewing' || activeRoom?.status === 'completed') && (
                   <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-[600px]">
                      
                      {/* Sidebar Tabs */}
                      <div className="xl:col-span-3 flex flex-col gap-4">
                         {/* Design Audit */}
                         {activeRoom.designAudit && (
                          <div className="flex-1 flex flex-col bg-zinc-950/50 border border-zinc-800 rounded-2xl overflow-hidden min-h-[200px]">
                            <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 font-bold text-zinc-300 flex items-center gap-2">
                               <Lightbulb size={16} className="text-amber-400" /> Architect's Breakdown
                            </div>
                            <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
                               <div>
                                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Palette size={12}/> Material Palette</h4>
                                  <ul className="space-y-2">
                                    {activeRoom.designAudit.materialPalette.map((mat, i) => (
                                      <li key={i} className="text-sm text-zinc-300 bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800/50">{mat}</li>
                                    ))}
                                  </ul>
                               </div>
                            </div>
                          </div>
                        )}

                        {/* COMPLIANCE CHECK */}
                        <div className="flex-1 flex flex-col bg-zinc-950/50 border border-zinc-800 rounded-2xl overflow-hidden min-h-[200px]">
                            <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 font-bold text-zinc-300 flex items-center justify-between">
                               <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" /> Safety & Code</div>
                               <button onClick={handleRunCompliance} className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded">Run Audit</button>
                            </div>
                            <div className="p-4 overflow-y-auto custom-scrollbar">
                               {isAuditing ? (
                                 <div className="text-center py-4"><Loader2 className="animate-spin mx-auto text-emerald-500" /> <span className="text-xs text-zinc-500">Checking Compliance...</span></div>
                               ) : activeRoom.complianceReport ? (
                                  <div className="space-y-3">
                                     {activeRoom.complianceReport.items.map((item, idx) => (
                                       <div key={idx} className={`p-3 rounded-lg border text-xs ${item.status === 'PASS' ? 'bg-emerald-950/30 border-emerald-800' : 'bg-red-950/30 border-red-800'}`}>
                                          <div className="flex justify-between font-bold mb-1">
                                            <span>{item.category}</span>
                                            <span className={item.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'}>{item.status}</span>
                                          </div>
                                          <p className="text-zinc-400">{item.message}</p>
                                       </div>
                                     ))}
                                  </div>
                               ) : (
                                 <div className="text-center py-4 text-xs text-zinc-500">
                                   Run audit to check electrical, plumbing, and clearance codes.
                                 </div>
                               )}
                            </div>
                        </div>
                      </div>

                      {/* Chat Sidebar */}
                      <div className="xl:col-span-3 flex flex-col bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden h-full relative">
                         {/* Focus Mode Banner */}
                         {isFocusMode && (
                           <div className="bg-indigo-600 px-4 py-2 text-white text-xs font-bold flex items-center justify-between">
                             <div className="flex items-center gap-2"><ZoomIn size={14}/> EDITING ZOOMED REGION</div>
                             <button onClick={handleMergeFocusEdit} className="bg-white text-indigo-600 px-2 py-1 rounded hover:bg-zinc-200">Love It (Merge)</button>
                           </div>
                         )}

                         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {activeRoom.chatHistory.map((msg, idx) => (
                               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[90%] p-3 rounded-2xl text-sm space-y-2 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
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
                         
                         <div className="p-3 bg-zinc-900/60 border-t border-zinc-800 relative">
                             {/* ... existing input code ... */}
                             {chatAttachment && (
                              <div className="absolute bottom-full left-4 mb-2 p-2 bg-zinc-800 rounded-lg border border-zinc-700 shadow-lg flex items-center gap-2">
                                <img src={chatAttachment.previewUrl} className="w-10 h-10 object-cover rounded" />
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
                                placeholder={isFocusMode ? "How should we change this detail?" : "Refine..."}
                                className={`flex-1 bg-black border rounded-xl px-3 py-3 text-sm outline-none ${isFocusMode ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-zinc-700 focus:border-indigo-500'}`}
                              />
                              <button onClick={handleSendMessage} className="p-2 text-zinc-400 hover:text-white"><Send size={18} /></button>
                            </div>
                         </div>
                      </div>

                      {/* Images Grid / Focus View */}
                      <div className="xl:col-span-6 overflow-y-auto custom-scrollbar relative flex flex-col gap-4">
                         
                         {/* FOCUS MODE OVERLAY */}
                         {isFocusMode && activeRoom.focusState && (
                            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8">
                               <div className="relative max-w-full max-h-full border-2 border-indigo-500 rounded-xl overflow-hidden shadow-2xl shadow-indigo-500/50">
                                  <img src={activeRoom.focusState.currentCrop} className="max-w-full max-h-[500px] object-contain" />
                                  <div className="absolute top-4 right-4 flex gap-2">
                                    <button onClick={exitFocusMode} className="bg-black/50 hover:bg-red-500 text-white p-2 rounded-full backdrop-blur-md"><X size={20}/></button>
                                  </div>
                                  <div className="absolute bottom-4 left-0 w-full text-center pointer-events-none">
                                     <span className="bg-black/60 text-white px-3 py-1 rounded-full text-sm font-bold backdrop-blur-md">Editing: {activeRoom.focusState.label || 'Detail'}</span>
                                  </div>
                               </div>
                            </div>
                         )}

                         {/* MAIN VIEWPORT */}
                         <div className="relative group rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950/50 aspect-video flex items-center justify-center">
                            {activeRoom.generatedViews[activeRoom.activePerspective] ? (
                               <>
                                 <img 
                                    id="main-view-image"
                                    src={activeRoom.generatedViews[activeRoom.activePerspective]} 
                                    className="w-full h-full object-contain cursor-crosshair" 
                                    onClick={handleImageClick}
                                 />
                                 
                                 {/* HOTSPOT OVERLAY */}
                                 {!isFocusMode && activeRoom.hotspots?.map((spot, idx) => (
                                    <button
                                      key={idx}
                                      onClick={(e) => { e.stopPropagation(); handleHotspotClick(spot); }}
                                      style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                                      className="absolute transform -translate-x-1/2 -translate-y-1/2 group/spot z-10"
                                    >
                                       <div className="w-6 h-6 bg-white/20 backdrop-blur-md border border-white rounded-full flex items-center justify-center shadow-lg hover:scale-125 hover:bg-indigo-500 transition-all">
                                          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                       </div>
                                       <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/spot:opacity-100 whitespace-nowrap pointer-events-none">
                                          Edit {spot.label}
                                       </div>
                                    </button>
                                 ))}

                                 <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-bold text-white flex items-center gap-2">
                                   <Eye size={12} className="text-indigo-400" />
                                   {activeRoom.activePerspective}
                                 </div>
                                 
                                 {isSyncing && (
                                     <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white z-20">
                                         <Loader2 size={32} className="animate-spin mb-2" />
                                         <p className="font-bold">Syncing changes to all views...</p>
                                     </div>
                                 )}
                               </>
                            ) : (
                               <div className="flex flex-col items-center text-zinc-500">
                                  <Loader2 className="animate-spin mb-2" />
                                  <span className="text-xs">Loading Perspective...</span>
                               </div>
                            )}
                         </div>
                            
                         {/* THUMBNAIL GRID (VIEW SWITCHER) */}
                         {!activeRoom.isHeroApproved ? (
                            <div className="p-4 bg-zinc-900/40 rounded-xl border border-dashed border-zinc-700 text-center text-zinc-500">
                                <Lock size={20} className="mx-auto mb-2 text-zinc-600" />
                                <p className="text-sm font-bold">Secondary Views Locked</p>
                                <p className="text-xs mt-1">Refine the Hero Shot first. Once approved, we will build the rest of the room to match.</p>
                            </div>
                         ) : (
                             <div className="grid grid-cols-4 gap-3">
                               {[ViewPerspective.EYE_LEVEL, ViewPerspective.WIDE_ANGLE, ViewPerspective.OVERHEAD, ViewPerspective.DETAIL].map(p => (
                                 <button 
                                   key={p} 
                                   onClick={() => handleSwitchView(p)}
                                   className={`
                                     relative rounded-xl overflow-hidden border bg-zinc-900 transition-all h-20 group
                                     ${activeRoom.activePerspective === p ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-zinc-800 hover:border-zinc-600'}
                                   `}
                                 >
                                     {activeRoom.generatedViews[p] ? (
                                       <img src={activeRoom.generatedViews[p]} className="w-full h-full object-cover" />
                                     ) : <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin" size={14} /></div>}
                                     
                                     <div className={`absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${activeRoom.activePerspective === p ? 'bg-indigo-900/20' : ''}`}>
                                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">{p.split(' ')[0]}</span>
                                     </div>
                                 </button>
                               ))}
                             </div>
                         )}

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
