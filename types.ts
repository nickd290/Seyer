
export interface FileData {
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

export enum ViewPerspective {
  EYE_LEVEL = 'Eye-Level (Hero)',
  WIDE_ANGLE = 'Wide Angle (Full Room)',
  OVERHEAD = 'Isometric / Overhead',
  DETAIL = 'Close-up Detail',
  FOCUS_CROP = 'Focus Region (Zoom)'
}

export interface RenderSettings {
  perspective: ViewPerspective;
  prompt: string;
}

// New Types for Multi-Stage Workflow

export type ProjectStage = 'UPLOAD' | 'CONFIRM_ROOMS' | 'DESIGN_LOOP' | 'EXPORT';

// Updated Status Flow: pending -> generating_sketch -> reviewing_sketch -> designing -> generating_hero -> generating_secondary -> reviewing -> completed
export type RoomStatus = 'pending' | 'generating_sketch' | 'reviewing_sketch' | 'designing' | 'generating_hero' | 'generating_secondary' | 'reviewing' | 'completed';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachment?: FileData; // Image attached by user for reference
}

export interface DesignPreferences {
  mood: string;       // e.g. "Cozy & Intimate" vs "Bright & Airy"
  materials: string;  // e.g. "Natural (Wood & Stone)"
  colors: string;     // e.g. "Warm Earth Tones"
  lighting: string;   // e.g. "Natural Daylight"
}

export interface DesignAudit {
  materialPalette: string[];
  lightingStrategy: string;
  proTip: string;
}

// --- Compliance & Safety Types ---
export type ComplianceCategory = 'Clearance' | 'Electrical' | 'Plumbing' | 'Safety';
export type ComplianceStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface ComplianceItem {
  category: ComplianceCategory;
  status: ComplianceStatus;
  message: string;
}

export interface ComplianceReport {
  overallStatus: ComplianceStatus;
  items: ComplianceItem[];
}

// --- Interactive Types ---
export interface Hotspot {
  label: string; // e.g. "Kitchen Island", "Pendant Light"
  x: number;     // Percentage 0-100
  y: number;     // Percentage 0-100
}

export interface StructuralHotspot {
  label: string; // e.g. "Booth", "Bar"
  x: number;
  y: number;
}

export type StructureActionType = 'move_left' | 'move_right' | 'rotate_90' | 'delete';

export interface FocusState {
  isActive: boolean;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  label?: string; // What are we focusing on?
  originalCrop: string; // Base64 of the crop before editing
  currentCrop: string; // Base64 of the crop being edited
}

export interface Room {
  id: string;
  name: string;
  dimensions: string; // Extracted or user-edited dimensions
  details: string;    // General design notes
  structuralConstraints: string; // CRITICAL: Immutable facts (e.g. "Booths on left wall")
  status: RoomStatus;
  
  // Phase 1: Structural Verification
  sketchImage: string | null; // The Clay Model / Wireframe
  structuralHotspots?: StructuralHotspot[]; // Interactive items in the sketch

  // The specific style reference for this room (optional, otherwise uses previous room)
  styleReference: FileData | null;
  
  // Structured User Preferences
  preferences?: DesignPreferences;
  
  // The 4 generated images
  generatedViews: {
    [key in ViewPerspective]?: string; // base64
  };

  // State for which view is currently main
  activePerspective: ViewPerspective;
  
  // Progressive Generation State
  isHeroApproved: boolean; // Has the user finalized the Hero shot?

  // Detected interactive bubbles for final render
  hotspots?: Hotspot[];

  // Automated Architectural Analysis of the result
  designAudit?: DesignAudit;
  complianceReport?: ComplianceReport; // Structural safety check

  // Chat history for refinement
  chatHistory: ChatMessage[];
  
  // Focus Mode State
  focusState?: FocusState;

  // The final "Approved" image used for the next room's context
  finalImage: string | null; 
}

export interface ProjectState {
  stage: ProjectStage;
  layoutFile: FileData | null;
  rooms: Room[];
  currentRoomId: string | null;
  globalStyle: FileData | null; // Optional user-uploaded global style
  
  // The master generated image that dictates the project style (from the first room)
  projectStyleReference: string | null; 
}
