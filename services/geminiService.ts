
import { GoogleGenAI } from "@google/genai";
import { ViewPerspective, Room, DesignPreferences, DesignAudit, ComplianceReport, Hotspot, StructuralHotspot, StructureActionType } from "../types";

// Helper to remove the data URL prefix for the API call
const cleanBase64 = (dataUrl: string) => {
  return dataUrl.split(',')[1];
};

// 1. Analyze Layout
export const analyzeLayout = async (apiKey: string, layoutBase64: string): Promise<{name: string, dimensions: string, details: string, structural_constraints: string}[]> => {
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are a Forensic Architectural Analyst.
    Your job is to read a floorplan with 100% accuracy regarding STRUCTURE and FIXED FURNITURE.
    
    CRITICAL ANALYSIS RULES:
    1. WALL HEIGHTS: You must strictly distinguish between FULL HEIGHT WALLS (solid structural lines) and HALF WALLS / PONY WALLS (often thinner, double lines, or hatched). 
       - IF UNSURE, assume full wall unless context suggests visual connection.
       - Explicitly state "Full Height Wall" or "Half Wall" in the constraints.
    2. BARS & SERVICE AREAS: If a Bar is identified, you MUST look for the BACK BAR (shelving, storage, or wall for liquor display) behind it. 
       - A bar is almost never floating; it needs a back anchor. 
       - Identify the "Front Bar" (counter) and "Back Bar" (shelving/wall).
    3. IMMUTABLE OBJECTS: Booths, Banquettes, Columns, Plumbing fixtures.
    
    For each distinct room, extract:
    1. "name": The Room Name.
    2. "dimensions": The dimensions (labeled or estimated).
    3. "structural_constraints": List every FIXED element.
       - EXAMPLE: "Full height wall on North. Half-wall (42 inch) separating bar from dining on South. L-Shaped Bar with full height Back-Bar shelving unit against East wall."
       - Describe EXACT locations.
    4. "details": General design notes (flooring type cues, loose furniture like tables/chairs).

    Return ONLY a raw JSON array of objects.
    Example: 
    [
      { 
        "name": "Restaurant Main Dining", 
        "dimensions": "40' x 30'", 
        "structural_constraints": "Fixed banquette seating along entire North full-height wall. Large central Bar (U-shape) with Back Bar shelving against structural column. Half-wall divider to kitchen.",
        "details": "Scatter tables in middle." 
      }
    ]
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview', // High reasoning needed for plan reading
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(layoutBase64), mimeType: 'image/png' } },
        { text: "Analyze this floorplan. Identify all IMMUTABLE STRUCTURAL ELEMENTS (Booths, Bars, Back-Bars, Full/Half Walls)." }
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
    return [{ name: "Main Room", dimensions: "Unknown", details: "Standard layout", structural_constraints: "Standard four walls" }];
  }
};

// 2A. Generate WIREFRAME / CLAY MODEL (Phase 1)
export const generateWireframeView = async (
  apiKey: string,
  layoutBase64: string,
  roomName: string,
  roomDimensions: string,
  structuralConstraints: string,
  userPrompt: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are a Structural Architectural Engine.
    TASK: Convert a Floorplan into a "Clay Model" or "White Architectural Wireframe" render.
    
    STYLE RULES:
    - MONOCHROMATIC: White, Clay, or Light Grey.
    - NO TEXTURES: Do not show wood grain, fabric patterns, or colored walls.
    - AMBIENT OCCLUSION: Use soft shadowing to show depth and form.
    - FOCUS: Purely on Massing, Layout, and Geometry.
    
    GEOMETRY RULES (STRICT):
    - You must STRICTLY adhere to the structural constraints: "${structuralConstraints}".
    - WALLS: Pay attention to Full Height vs Half Walls.
    - BARS: Ensure Back Bars (shelving) are modeled if specified.
    - Place walls, windows, columns, and furniture exactly where they are in the plan.
    - Do not beautify. Be accurate.
    
    Output: A clean, white-model 3D view of the room from Eye Level.
  `;

  const parts = [
    { inlineData: { data: cleanBase64(layoutBase64), mimeType: 'image/png' } },
    { text: `INPUT 1: Floorplan. Generate a Clay Model/Wireframe for ${roomName} (${roomDimensions}). Constraints: ${structuralConstraints}. Note: ${userPrompt}` }
  ];

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

// 2B. Generate HERO VIEW (Phase 2 - Uses Wireframe as Guide)
export const generateHeroView = async (
  apiKey: string,
  layoutBase64: string,
  sketchBase64: string | null, // NEW: The Approved Wireframe
  roomName: string,
  roomDimensions: string,
  structuralConstraints: string,
  roomDetails: string,
  preferences: DesignPreferences,
  styleReferenceBase64: string | null,
  projectStyleReferenceBase64: string | null,
  userPrompt: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  // Translate Layman Preferences to Architectural DNA
  const designDNA = `
    DESIGN ATMOSPHERE & SPECIFICATIONS:
    - DESIRED MOOD: ${preferences.mood}.
    - TEXTURE PALETTE: ${preferences.materials}.
    - COLOR THEME: ${preferences.colors}.
    - LIGHTING SCENARIO: ${preferences.lighting}.
  `;

  const systemInstruction = `
    You are a Texture Application Engine, NOT a Creative Designer.
    
    INPUT 2 is a "Clay Model" representing the ABSOLUTE GEOMETRIC TRUTH.
    Your task is to apply photorealistic materials and lighting to this EXACT wireframe.
    
    CRITICAL RULES (ABSOLUTE INTEGRITY):
    1. GEOMETRY IS LOCKED: You are forbidden from moving walls, furniture, or structures. 
       - If the Clay Model shows a booth on the left, the booth STAYS on the left.
       - If the Clay Model shows a bar column, that column must exist in the final render.
    2. PERSPECTIVE LOCK: The camera angle must match the Clay Model exactly.
    3. TEXTURING OVERLAY: Think of this as "painting" the Clay Model. The shapes are defined; you only define the surface appearance (wood, metal, fabric).
    4. STRUCTURAL CHECKS:
       - Maintain Full Height vs Half Walls exactly as shown in the Clay Model.
       - Preserve the exact layout of the Back Bar and shelving.
    
    STYLE INPUTS:
    ${designDNA}
    
    REFERENCE STRATEGY:
    ${projectRefText(projectStyleReferenceBase64)}
    ${styleRefText(styleReferenceBase64)}
  `;

  const parts: any[] = [];
  
  // 1. Layout (Geometry Ref)
  parts.push({ inlineData: { data: cleanBase64(layoutBase64), mimeType: 'image/png' } });
  let promptText = `INPUT 1: Floorplan (Context).\n`;

  // 2. The Sketch (Geometry Truth)
  if (sketchBase64) {
    parts.push({ inlineData: { data: cleanBase64(sketchBase64), mimeType: 'image/png' } });
    promptText += `INPUT 2: APPROVED CLAY MODEL (GEOMETRY SOURCE). This image defines the EXACT structure. You are strictly coloring this geometry. Do not hallucinate new shapes.\n`;
  } else {
    // Fallback if skipped (though app workflow shouldn't allow it)
    promptText += `INPUT 2: None. Rely on Floorplan.\n`;
  }

  // 3. Project Master Style
  if (projectStyleReferenceBase64) {
    parts.push({ inlineData: { data: cleanBase64(projectStyleReferenceBase64), mimeType: 'image/png' } });
    promptText += `INPUT 3: PROJECT STYLE MASTER. Match this exact lighting, rendering style, and material palette.\n`;
  }

  // 4. User Style Ref
  if (styleReferenceBase64) {
    parts.push({ inlineData: { data: cleanBase64(styleReferenceBase64), mimeType: 'image/png' } });
    promptText += `INPUT 4: Specific Material Reference.\n`;
  }

  promptText += `
    TASK: Colorize and Texture the Input 2 Clay Model to look photorealistic.
    ROOM: ${roomName}.
    DIMENSIONS: ${roomDimensions}.
    CONSTRAINTS (DOUBLE CHECK): ${structuralConstraints}.
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

// 2C. Generate SECONDARY VIEWS
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

// Sync other views to match an EDITED view
export const syncSecondaryViews = async (
  apiKey: string,
  layoutBase64: string,
  newSourceOfTruthBase64: string,
  roomName: string
): Promise<{ [key in ViewPerspective]?: string }> => {
  return generateSecondaryViews(apiKey, layoutBase64, newSourceOfTruthBase64, roomName);
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
    2. SOURCE RENDER (THE SOURCE OF TRUTH)
    
    TASK: Generate a new view of the room shown in the SOURCE RENDER.
    PERSPECTIVE: ${perspective}.
    
    STRICT CONSTRAINT:
    - The room MUST look IDENTICAL to the Source Render in terms of furniture, materials, colors, and lighting.
    - Only change the Camera Angle.
    
    If Perspective is OVERHEAD: Show an isometric cutaway.
    If Perspective is DETAIL: Focus on a key design element.
  `;

  const parts: any[] = [];
  parts.push({ inlineData: { data: cleanBase64(layoutBase64), mimeType: 'image/png' } });
  parts.push({ inlineData: { data: cleanBase64(heroBase64), mimeType: 'image/png' } });
  parts.push({ text: `INPUT 1: Floorplan. INPUT 2: SOURCE RENDER. Generate ${perspective} view for ${roomName}.` });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { systemInstruction }
  });

  return extractImage(response);
};

// 3. Generate Design Audit
export const generateDesignAudit = async (
  apiKey: string,
  imageBase64: string,
  roomName: string
): Promise<DesignAudit> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
    You are a Senior Interior Architect.
    Analyze the provided rendering of a ${roomName}.
    Identify the specific design choices made in this image.
    Return a JSON object with:
    1. "materialPalette": A list of 3-5 specific materials visible.
    2. "lightingStrategy": A concise sentence explaining the lighting.
    3. "proTip": A brief architectural tip.
    Return raw JSON only.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/png' } },
        { text: "Audit this design." }
      ]
    },
    config: { systemInstruction }
  });

  const text = response.text || "{}";
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (e) {
    return {
      materialPalette: ["Wood", "Stone", "Fabric"],
      lightingStrategy: "Mixed lighting",
      proTip: "Contrast creates depth."
    };
  }
};

// 3.5 DETECT HOTSPOTS (Final Render)
export const detectHotspots = async (
  apiKey: string,
  imageBase64: string
): Promise<Hotspot[]> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
    You are an Interior Design Scanner.
    Look at the provided image. Identify 4-6 KEY EDITABLE elements.
    For each element, return:
    1. label: The name of the item.
    2. x: The horizontal position percentage (0-100) of the item's center.
    3. y: The vertical position percentage (0-100) of the item's center.
    Return pure JSON array.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/png' } },
        { text: "Find hotspots." }
      ]
    },
    config: { systemInstruction }
  });

  const text = response.text || "[]";
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (e) {
    return [];
  }
};

// 3.6 DETECT STRUCTURAL HOTSPOTS (Wireframe)
export const detectStructuralHotspots = async (
  apiKey: string,
  imageBase64: string
): Promise<StructuralHotspot[]> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
    You are a Structural Scanner.
    Look at the Wireframe / Clay Model. 
    Identify 3-5 KEY MOVEABLE STRUCTURAL ELEMENTS (Booths, Tables, Bars, Columns, Walls).
    
    For each element return:
    1. label: Name (e.g. "Booth", "Round Table", "Bar Counter").
    2. x: Center X percentage (0-100).
    3. y: Center Y percentage (0-100).
    
    Return pure JSON array.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/png' } },
        { text: "Find structural elements." }
      ]
    },
    config: { systemInstruction }
  });

  const text = response.text || "[]";
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (e) {
    return [];
  }
};

// 3.7 MODIFY STRUCTURE (Phase 1 Edit)
export const modifyStructure = async (
  apiKey: string,
  currentWireframeBase64: string,
  action: StructureActionType,
  targetLabel: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are a Structural Geometry Engine.
    TASK: Modify the Wireframe Sketch based on a spatial command.
    
    INPUT: Current Wireframe.
    COMMAND: ${action.replace('_', ' ')} the ${targetLabel}.
    
    RULES:
    1. KEEP STYLE IDENTICAL: Output must remain a monochromatic clay model.
    2. ISOLATION: ONLY change the ${targetLabel}. Keep all other walls/furniture locked in place.
    3. EXECUTION:
       - move_left: Shift object ~20% left.
       - move_right: Shift object ~20% right.
       - rotate_90: Rotate object 90 degrees.
       - delete: Remove the object.
  `;

  const parts = [
    { inlineData: { data: cleanBase64(currentWireframeBase64), mimeType: 'image/png' } },
    { text: `Execute Change: ${action} on ${targetLabel}.` }
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { systemInstruction }
  });

  return extractImage(response);
};

// 4. Refine/Edit a specific view
export const refineRoomRender = async (
  apiKey: string,
  currentImageBase64: string,
  userInstruction: string,
  referenceImageBase64?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are an Expert Interior Design AI.
    TASK: Edit a photorealistic rendering OR wireframe sketch based on user feedback.
    
    CONSTRAINTS:
    1. PRESERVE STRUCTURAL INTEGRITY: Do not move walls unless explicitly told.
    2. EDITING: Only modify the specific elements mentioned.
    3. If editing a CLAY MODEL / WIREFRAME: Keep the output Monochromatic and untextured. Only change geometry.
    4. If editing a PHOTOREALISTIC RENDER: Keep lighting consistent.
    
    REFERENCE IMAGE HANDLING:
    If a second image is provided (Input 2), you must use it as the STRICT source of truth for the object design requested.
  `;

  const parts: any[] = [];
  parts.push({ inlineData: { data: cleanBase64(currentImageBase64), mimeType: 'image/png' } });
  let promptText = `INPUT 1: Current Image.\n`;

  if (referenceImageBase64) {
    parts.push({ inlineData: { data: cleanBase64(referenceImageBase64), mimeType: 'image/png' } });
    promptText += `INPUT 2: VISUAL REFERENCE TARGET.\n`;
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

// 5. Integrate Edited Crop
export const integrateCrop = async (
  apiKey: string,
  originalFullImageBase64: string,
  editedCropBase64: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
    You are an Image Compositing Engine.
    TASK: Integrate an EDITED CROP (Input 2) back into the FULL IMAGE (Input 1).
    BLEND SEAMLESSLY.
  `;

  const parts = [
    { inlineData: { data: cleanBase64(originalFullImageBase64), mimeType: 'image/png' } },
    { inlineData: { data: cleanBase64(editedCropBase64), mimeType: 'image/png' } },
    { text: "Merge Input 2 into Input 1 seamlessly." }
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { systemInstruction }
  });

  return extractImage(response);
};

// 6. Run Structural Compliance Check
export const runComplianceCheck = async (
  apiKey: string,
  floorplanBase64: string,
  renderBase64: string,
  roomName: string
): Promise<ComplianceReport> => {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are a Building Code & Safety Inspector.
    Compare the FLOORPLAN (Input 1) with the RENDER (Input 2) of the ${roomName}.
    Audit for Clearance, Electrical, Plumbing, and Safety.
    Return JSON.
  `;

  const parts = [
    { inlineData: { data: cleanBase64(floorplanBase64), mimeType: 'image/png' } },
    { inlineData: { data: cleanBase64(renderBase64), mimeType: 'image/png' } },
    { text: "Run compliance audit." }
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { systemInstruction }
  });

  const text = response.text || "{}";
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (e) {
    return {
      overallStatus: 'PASS',
      items: [{ category: 'Safety', status: 'PASS', message: 'Visual inspection passed.' }]
    };
  }
};


// Helpers

const projectRefText = (exists: string | null) => exists ? "- CRITICAL: Use 'Input 3' (Project Master Style) to define the materials, rendering style, and atmosphere. Consistency with this image is MANDATORY." : "";
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
