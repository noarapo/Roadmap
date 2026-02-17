const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require("../models/db");
const { v4: uuidv4 } = require("uuid");

/* ============================================================
   AI Service — Roadway AI
   Supports Claude (Anthropic) and Gemini (Google) providers.
   Streams responses via a callback. Handles tool use for
   card actions (create, edit, move, delete).
   ============================================================ */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/* ---------- Tool Definitions ---------- */

const CARD_TOOLS = [
  {
    name: "create_card",
    description: "Create a new feature card on the roadmap. Use this when the user asks to add a new card, feature, or task.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name/title of the card" },
        roadmap_id: { type: "string", description: "The roadmap ID to create the card in" },
        row_id: { type: "string", description: "The row ID to place the card in (optional)" },
        sprint_id: { type: "string", description: "The sprint ID to place the card in (optional)" },
        description: { type: "string", description: "Description of the feature (optional)" },
        status: { type: "string", enum: ["placeholder", "planned", "in-progress", "done"], description: "Card status (optional, defaults to placeholder)" },
      },
      required: ["name", "roadmap_id"],
    },
  },
  {
    name: "edit_card",
    description: "Edit an existing card's properties. Use this when the user asks to update, rename, or change a card.",
    input_schema: {
      type: "object",
      properties: {
        card_id: { type: "string", description: "The ID of the card to edit" },
        name: { type: "string", description: "New name (optional)" },
        description: { type: "string", description: "New description (optional)" },
        status: { type: "string", enum: ["placeholder", "planned", "in-progress", "done"], description: "New status (optional)" },
        effort: { type: "number", description: "New effort estimate (optional)" },
        headcount: { type: "integer", description: "New headcount (optional)" },
      },
      required: ["card_id"],
    },
  },
  {
    name: "move_card",
    description: "Move a card to a different row and/or sprint. Use this when the user asks to move, reschedule, or reassign a card.",
    input_schema: {
      type: "object",
      properties: {
        card_id: { type: "string", description: "The ID of the card to move" },
        row_id: { type: "string", description: "The target row ID (optional)" },
        start_sprint_id: { type: "string", description: "The target start sprint ID (optional)" },
        end_sprint_id: { type: "string", description: "The target end sprint ID (optional)" },
      },
      required: ["card_id"],
    },
  },
  {
    name: "delete_card",
    description: "Delete a card from the roadmap. Use this when the user asks to remove or delete a card.",
    input_schema: {
      type: "object",
      properties: {
        card_id: { type: "string", description: "The ID of the card to delete" },
      },
      required: ["card_id"],
    },
  },
  {
    name: "create_row",
    description: "Create a new row on the roadmap. Use this when the user asks to add a new row, team row, category, or group.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name of the row (e.g. 'Backend', 'Platform', 'Design')" },
        roadmap_id: { type: "string", description: "The roadmap ID to create the row in" },
        color: { type: "string", description: "Optional hex color for the row (e.g. '#4F87C5')" },
      },
      required: ["name", "roadmap_id"],
    },
  },
];

/* ---------- Build System Prompt with Roadmap Context ---------- */

function buildSystemPrompt(roadmapData) {
  let context = `You are Roadway AI, a friendly and helpful AI assistant for the Roadway roadmap planning tool. You help users manage their roadmap by answering questions about features and executing card actions.

Your personality: Warm, concise, and proactive. You explain what you did and why. Use a casual but professional tone.

CRITICAL RULES — YOU MUST FOLLOW THESE:
1. When the user asks you to create, edit, move, or delete cards or rows, you MUST use the provided tools. Do NOT just describe what you would do — actually call the tool function.
2. Before calling a tool, write a brief explanation of what you're about to do so the user understands.
3. If a reference is ambiguous (e.g., multiple cards with similar names), list the options with their IDs and ask the user to pick.
4. You can call multiple tools in a single response for batch operations.
5. Always reference cards, rows, and sprints by their actual names, not IDs, when speaking to the user.
6. Use the exact IDs from the roadmap context below when calling tools — never make up IDs.
7. When asked to move a card to a sprint, use the move_card tool with the sprint's ID as both start_sprint_id and end_sprint_id.
`;

  if (roadmapData) {
    context += `\n## Current Roadmap Context\n\n`;

    if (roadmapData.roadmap) {
      context += `**Roadmap:** ${roadmapData.roadmap.name} (ID: ${roadmapData.roadmap.id}, Status: ${roadmapData.roadmap.status || "draft"})\n\n`;
    }

    if (roadmapData.sprints && roadmapData.sprints.length > 0) {
      context += `**Sprints (${roadmapData.sprints.length}):**\n`;
      for (const s of roadmapData.sprints) {
        context += `- ${s.name} (ID: ${s.id}) — ${s.start_date} to ${s.end_date}\n`;
      }
      context += "\n";
    }

    if (roadmapData.rows && roadmapData.rows.length > 0) {
      context += `**Rows (${roadmapData.rows.length}):**\n`;
      for (const r of roadmapData.rows) {
        context += `- ${r.name} (ID: ${r.id})\n`;
      }
      context += "\n";
    }

    if (roadmapData.cards && roadmapData.cards.length > 0) {
      context += `**Cards (${roadmapData.cards.length}):**\n`;
      for (const c of roadmapData.cards) {
        const row = roadmapData.rows?.find((r) => r.id === c.row_id);
        const startSprint = roadmapData.sprints?.find((s) => s.id === c.start_sprint_id);
        const endSprint = roadmapData.sprints?.find((s) => s.id === c.end_sprint_id);
        context += `- "${c.name}" (ID: ${c.id})`;
        if (row) context += ` — Row: ${row.name}`;
        if (startSprint) context += ` — Sprint: ${startSprint.name}`;
        if (endSprint && endSprint.id !== startSprint?.id) context += ` to ${endSprint.name}`;
        if (c.status) context += ` — Status: ${c.status}`;
        if (c.description) context += ` — Desc: ${c.description}`;
        context += "\n";
      }
      context += "\n";
    }

    if (roadmapData.tags && roadmapData.tags.length > 0) {
      context += `**Tags:** ${roadmapData.tags.map((t) => t.name).join(", ")}\n\n`;
    }
  }

  return context;
}

/* ---------- Load Roadmap Context from DB ---------- */

async function loadRoadmapContext(userId) {
  // Get user's last roadmap
  const { rows: userRows } = await db.query("SELECT last_roadmap_id, workspace_id FROM users WHERE id = $1", [userId]);
  const user = userRows[0];
  if (!user || !user.last_roadmap_id) return null;

  const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [user.last_roadmap_id]);
  const roadmap = roadmapRows[0];
  if (!roadmap) return null;

  const { rows } = await db.query("SELECT * FROM roadmap_rows WHERE roadmap_id = $1 ORDER BY sort_order", [roadmap.id]);
  const { rows: cards } = await db.query("SELECT * FROM cards WHERE roadmap_id = $1 ORDER BY sort_order", [roadmap.id]);
  const { rows: sprints } = await db.query("SELECT * FROM sprints WHERE roadmap_id = $1 ORDER BY sort_order", [roadmap.id]);

  // Get tags for the workspace
  let tags = [];
  if (user.workspace_id) {
    const { rows: tagRows } = await db.query("SELECT * FROM tags WHERE workspace_id = $1", [user.workspace_id]);
    tags = tagRows;
  }

  return { roadmap, rows, cards, sprints, tags };
}

/* ---------- Stream with Claude (Anthropic) ---------- */

async function streamClaude(messages, systemPrompt, onToken, onToolUse, onDone) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Convert tool definitions to Anthropic format
  const tools = CARD_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
    tools,
  });

  let fullText = "";
  let toolUses = [];
  let inputTokens = 0;
  let outputTokens = 0;

  stream.on("text", (text) => {
    fullText += text;
    onToken(text);
  });

  const finalMessage = await stream.finalMessage();

  inputTokens = finalMessage.usage?.input_tokens || 0;
  outputTokens = finalMessage.usage?.output_tokens || 0;

  // Check for tool use blocks
  for (const block of finalMessage.content) {
    if (block.type === "tool_use") {
      toolUses.push({
        id: block.id,
        name: block.name,
        input: block.input,
      });
      onToolUse(block);
    }
  }

  onDone({ text: fullText, toolUses, inputTokens, outputTokens });
}

/* ---------- Stream with Gemini (Google) ---------- */

async function streamGemini(messages, systemPrompt, onToken, onToolUse, onDone) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  // Convert tool definitions to Gemini format
  const tools = [{
    functionDeclarations: CARD_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    tools,
  });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];
  const chat = model.startChat({ history });

  const result = await chat.sendMessageStream(lastMessage.content);

  let fullText = "";
  let toolUses = [];

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      fullText += text;
      onToken(text);
    }

    // Check for function calls
    const candidates = chunk.candidates || [];
    for (const candidate of candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.functionCall) {
          const toolUse = {
            id: uuidv4(),
            name: part.functionCall.name,
            input: part.functionCall.args,
          };
          toolUses.push(toolUse);
          onToolUse(toolUse);
        }
      }
    }
  }

  // Gemini doesn't provide token counts in streaming easily — estimate
  const inputTokens = Math.ceil(messages.reduce((acc, m) => acc + (m.content?.length || 0), 0) / 4);
  const outputTokens = Math.ceil(fullText.length / 4);

  onDone({ text: fullText, toolUses, inputTokens, outputTokens });
}

/* ---------- Main Stream Function ---------- */

async function streamAI(provider, messages, userId, onToken, onToolUse, onDone) {
  const roadmapData = await loadRoadmapContext(userId);
  const systemPrompt = buildSystemPrompt(roadmapData);

  if (provider === "gemini") {
    return streamGemini(messages, systemPrompt, onToken, onToolUse, onDone);
  }
  // Default to Claude
  return streamClaude(messages, systemPrompt, onToken, onToolUse, onDone);
}

/* ---------- Extract Feature Requests from File Content ---------- */

async function extractFeaturesFromFile(fileContent, fileName, provider, userId) {
  const roadmapData = await loadRoadmapContext(userId);

  let roadmapContext = "";
  if (roadmapData && roadmapData.roadmap) {
    roadmapContext += `\nThe target roadmap is: "${roadmapData.roadmap.name}" (ID: ${roadmapData.roadmap.id})\n`;
    if (roadmapData.rows && roadmapData.rows.length > 0) {
      roadmapContext += `Available rows: ${roadmapData.rows.map((r) => `"${r.name}" (ID: ${r.id})`).join(", ")}\n`;
    }
    if (roadmapData.sprints && roadmapData.sprints.length > 0) {
      roadmapContext += `Available sprints: ${roadmapData.sprints.map((s) => `"${s.name}" (ID: ${s.id})`).join(", ")}\n`;
    }
  }

  const systemPrompt = `You are a feature request extraction assistant. Your job is to analyze uploaded files and extract feature requests/cards from them.

Given the contents of a file, identify all feature requests, tasks, or items that could become roadmap cards.

${roadmapContext}

You MUST respond with valid JSON only — no markdown, no explanation, no wrapping. The response must be a JSON object with this exact structure:
{
  "summary": "A brief human-readable summary of what you found",
  "cards": [
    {
      "name": "Feature name (short, clear title)",
      "description": "Feature description (1-2 sentences)",
      "status": "placeholder",
      "roadmap_id": "the roadmap ID from context above, or null if unknown"
    }
  ]
}

Rules:
- Extract every distinct feature, task, or request you can identify
- Keep card names concise (under 60 characters)
- Include a meaningful description for each card
- Set status to "placeholder" for all extracted cards
- If a roadmap ID is available from context, include it for every card
- If no features can be found, return an empty cards array with an explanatory summary
- Do NOT invent features that aren't in the file
- Parse any format: CSV, tables, bullet lists, prose, etc.`;

  const userMessage = `File: "${fileName}"\n\nContents:\n${fileContent}`;

  if (provider === "gemini" && GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent(userMessage);
    const text = result.response.text();
    return parseExtractedFeatures(text);
  }

  // Default to Claude
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseExtractedFeatures(text);
}

function parseExtractedFeatures(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || "Features extracted from file",
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    };
  } catch {
    return {
      summary: "Could not parse the AI response. The file may not contain recognizable feature requests.",
      cards: [],
    };
  }
}

module.exports = { streamAI, CARD_TOOLS, loadRoadmapContext, extractFeaturesFromFile };
