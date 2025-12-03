
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
  DETAIL = 'Close-up Detail'
}

export interface RenderSettings {
  perspective: ViewPerspective;
  prompt: string;
}

// New Types for Multi-Stage Workflow

export type ProjectStage = 'UPLOAD' | 'CONFIRM_ROOMS' | 'DESIGN_LOOP' | 'EXPORT';

export type RoomStatus = 'pending' | 'generating_hero' | 'generating_secondary' | 'reviewing' | 'completed';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachment?: FileData; // Image attached by user for reference
}

export interface DesignPreferences {
  style: string;
  palette: string;
  lighting: string;
  flooring: string;
}

export interface Room {
  id: string;
  name: string;
  dimensions: string; // Extracted or user-edited dimensions
  details: string;    // Extracted or user-edited structural details
  status: RoomStatus;
  
  // The specific style reference for this room (optional, otherwise uses previous room)
  styleReference: FileData | null;
  
  // Structured User Preferences
  preferences?: DesignPreferences;
  
  // The 4 generated images
  generatedViews: {
    [key in ViewPerspective]?: string; // base64
  };
  
  // Chat history for refinement
  chatHistory: ChatMessage[];
  
  // The final "Approved" image used for the next room's context
  finalImage: string | null; 
}

export interface ProjectState {
  stage: ProjectStage;
  layoutFile: FileData | null;
  rooms: Room[];
  currentRoomId: string | null;
  globalStyle?: FileData | null; // Optional user-uploaded global style
  
  // The master generated image that dictates the project style (from the first room)
  projectStyleReference: string | null; 
}
