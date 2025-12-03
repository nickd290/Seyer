
import { GoogleGenAI } from "@google/genai";
import { ViewPerspective, Room, DesignPreferences } from "../types";

// Helper to remove the data URL prefix for the API call
const cleanBase64 = (dataUrl: string) => {
  return dataUrl.split(',')[1];
};

// 1. Analyze Layout to identify rooms with details
export const analyzeLayout = async (apiKey: string, layoutBase64: string): Promise<{name: string, dimensions: string, details: string}[]> => {
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are an Expert Architectural Plan Reader.
    Analyze the provided floorplan image.
    Identify all distinct rooms and spaces.
    
    For each room, extract:
    1. "name": The Room Name (e.g., Living Room, Master Bath).
    2. "dimensions": The dimensions if labeled (e.g., "12' x 14'"). If not labeled, estimate the relative size (e.g., "Large", "Compact", "approx 150 sqft").
    3. "details": Key architectural features or furniture layout visible (e.g., "Large bay window", "L-shaped kitchen island", "Double vanity", "Sliding glass doors to patio").

    Return ONLY a raw JSON array of objects. Do not add markdown blocks.
    Example: 
    [
      { "name": "Living Room", "dimensions": "14' x 18'", "details": "Fireplace on north wall, open concept" }, 
      { "name": "Kitchen", "dimensions": "12' x 12'", "details": "Center island, large pantry" }
    ]
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview', // High reasoning needed for plan reading
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(layoutBase64), mimeType: 'image/png' } },
        { text: "Analyze this floorplan and list rooms with dimensions and details as JSON." }
      ]
    },
    config: { systemInstruction }
  });

  const text = response.text || "[]";
  try {
    // Clean potential markdown code blocks
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("Failed to parse room list", e);
    // Fallback
    return [{ name: "Main Room", dimensions: "Unknown", details: "Standard layout" }];
  }
};

// 2A. Generate HERO VIEW (Source of Truth)
export const generateHeroView = async (
  apiKey: string,
  layoutBase64: string,
  roomName: string,
  roomDimensions: string,
  roomDetails: string,
  preferences: DesignPreferences,
  styleReferenceBase64: string | null, // User uploaded specific ref
  projectStyleReferenceBase64: string | null, // The "Master" Project Style (from Room 1)
  userPrompt: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  // Construct detailed design prompt from chips
  const designDNA = `
    DESIGN SPECIFICATIONS:
    - ARCHITECTURAL STYLE: ${preferences.style}
    - COLOR PALETTE: ${preferences.palette}
    - LIGHTING MOOD: ${preferences.lighting}
    - FLOORING MATERIAL: ${preferences.flooring}
  `;

  const systemInstruction = `
    You are an Architectural Visualization Engine.
    TASK: Render the specific room: "${roomName}" from the provided FLOORPLAN.
    PERSPECTIVE: ${ViewPerspective.EYE_LEVEL}.
    
    STRUCTURAL CONTEXT:
    - Dimensions: ${roomDimensions}
    - Key Features: ${roomDetails}
    
    STRICT GEOMETRY LOCK:
    - INPUT 1 (Floorplan) is the ABSOLUTE TRUTH for geometry and layout.
    - Locate "${roomName}" in the floorplan.
    - YOU MUST RENDER THE WALLS, WINDOWS, AND FURNITURE EXACTLY WHERE THEY ARE IN THE PLAN.
    - Do not copy furniture shapes from the Style References. Only copy their materials/colors.
    
    STYLE & AESTHETICS:
    ${designDNA}
    
    REFERENCE STRATEGY:
    ${projectRefText(projectStyleReferenceBase64)}
    ${styleRefText(styleReferenceBase64)}
    
    OUTPUT: A high-fidelity, photorealistic render.
  `;

  const parts: any[] = [];
  
  // 1. Layout (Geometry Truth)
  parts.push({ inlineData: { data: cleanBase64(layoutBase64), mimeType: 'image/png' } });
  let promptText = `INPUT 1: GEOMETRY SOURCE (Floorplan). Focus ONLY on the ${roomName}.\n`;

  // 2. Project Master Style (Priority 1)
  if (projectStyleReferenceBase64) {
    parts.push({ inlineData: { data: cleanBase64(projectStyleReferenceBase64), mimeType: 'image/png' } });
    promptText += `INPUT 2: PROJECT STYLE MASTER. Match this exact lighting, rendering style, and material palette. Apply it to the geometry of Input 1.\n`;
  }

  // 3. User Style Ref (Priority 2 - optional specific override)
  if (styleReferenceBase64) {
    parts.push({ inlineData: { data: cleanBase64(styleReferenceBase64), mimeType: 'image/png' } });
    promptText += `INPUT 3: Specific Material Reference. Use specific textures from here if not defined in Input 2.\n`;
  }

  promptText += `
    GENERATE: Eye-Level view of ${roomName}.
    DIMENSIONS: ${roomDimensions}.
    STRUCTURAL DETAILS: ${roomDetails}.
    USER NOTES: ${userPrompt}
  `;

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: {
      systemInstruction,
      imageConfig: { aspectRatio: "16:9", imageSize: "1K" }
    }
  });

  return extractImage(response);
};

// 2B. Generate SECONDARY VIEWS (Derived from Hero)
export const generateSecondaryViews = async (
  apiKey: string,
  layoutBase64: string,
  heroImageBase64: string, // STRICT SOURCE OF TRUTH
  roomName: string
): Promise<{ [key in ViewPerspective]?: string }> => {
  
  const perspectives = [
    ViewPerspective.WIDE_ANGLE,
    ViewPerspective.OVERHEAD,
    ViewPerspective.DETAIL
  ];

  const results: any = {};

  const promises = perspectives.map(async (p) => {
    try {
      const img = await generateDependentView(apiKey, layoutBase64, heroImageBase64, roomName, p);
      return { perspective: p, image: img };
    } catch (e) {
      console.error(`Failed to generate ${p}`, e);
      return { perspective: p, image: null };
    }
  });

  const generated = await Promise.all(promises);
  generated.forEach(g => {
    if (g.image) results[g.perspective] = g.image;
  });

  return results;
};

const generateDependentView = async (
  apiKey: string,
  layoutBase64: string,
  heroBase64: string,
  roomName: string,
  perspective: ViewPerspective
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are a 3D Camera Engine.
    
    INPUTS:
    1. Floorplan (for spatial logic)
    2. HERO RENDER (THE SOURCE OF TRUTH)
    
    TASK: Generate a new view of the room shown in the HERO RENDER.
    PERSPECTIVE: ${perspective}.
    
    STRICT CONSTRAINT:
    - The room MUST look IDENTICAL to the Hero Render in terms of furniture, materials, colors, and lighting.
    - Do not invent new objects.
    - Do not change the style.
    - Only change the Camera Angle.
    
    If Perspective is OVERHEAD: Show an isometric cutaway.
    If Perspective is DETAIL: Focus on a key design element (table setting, fabric texture).
  `;

  const parts: any[] = [];
  
  // 1. Layout
  parts.push({ inlineData: { data: cleanBase64(layoutBase64), mimeType: 'image/png' } });
  
  // 2. Hero Image (The Anchor)
  parts.push({ inlineData: { data: cleanBase64(heroBase64), mimeType: 'image/png' } });

  parts.push({ text: `INPUT 1: Floorplan. INPUT 2: HERO RENDER (Source of Truth). Generate ${perspective} view for ${roomName}.` });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { systemInstruction }
  });

  return extractImage(response);
};

// 3. Refine/Edit a specific view
export const refineRoomRender = async (
  apiKey: string,
  currentImageBase64: string,
  userInstruction: string,
  referenceImageBase64?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are an Expert Interior Design AI.
    TASK: Edit a photorealistic rendering based on user feedback.
    
    CONSTRAINTS:
    1. PRESERVE STRUCTURAL INTEGRITY: Do not move walls, windows, or change the camera angle.
    2. PRESERVE LIGHTING: Keep the global illumination consistent unless asked otherwise.
    3. EDITING: Only modify the specific elements mentioned in the USER INSTRUCTION.
    
    REFERENCE IMAGE HANDLING:
    If a second image is provided (Input 2), you must use it as the STRICT source of truth for the materials, furniture style, or object design requested.
    - Example: If user says "change chair" and uploads an image of a chair, look at Input 2 and replace the current chair with that EXACT design.
  `;

  const parts: any[] = [];
  
  // 1. Current Render
  parts.push({ inlineData: { data: cleanBase64(currentImageBase64), mimeType: 'image/png' } });
  let promptText = `INPUT 1: Current Render.\n`;

  // 2. Reference Image
  if (referenceImageBase64) {
    parts.push({ inlineData: { data: cleanBase64(referenceImageBase64), mimeType: 'image/png' } });
    promptText += `INPUT 2: VISUAL REFERENCE TARGET. Use the style/object shown here for the edit.\n`;
  }

  promptText += `EDIT INSTRUCTION: ${userInstruction}`;

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { systemInstruction }
  });

  return extractImage(response);
};

// Helpers

const projectRefText = (exists: string | null) => exists ? "- CRITICAL: Use 'Input 2' (Project Master Style) to define the materials, rendering style, and atmosphere. Consistency with this image is MANDATORY." : "";
const styleRefText = (exists: string | null) => exists ? "- REFERENCE: Use the 'Style Reference' image for specific material details." : "";

const extractImage = (response: any): string => {
  const candidates = response.candidates;
  if (candidates?.[0]?.content?.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
  }
  throw new Error("Failed to generate image");
};
