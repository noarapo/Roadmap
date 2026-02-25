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

function buildSystemPrompt(roadmapData, notionContext) {
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

  // Append Notion context if available
  if (notionContext && notionContext.length > 0) {
    context += `\n## Notion Knowledge Base\n\n`;
    context += `The following content is from linked Notion pages. Use this information to provide more informed answers about features, PRDs, and product decisions.\n\n`;
    for (const page of notionContext) {
      if (page.content) {
        context += `### ${page.title || "Notion Page"}\n${page.content}\n\n`;
      }
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

async function streamAI(provider, messages, userId, onToken, onToolUse, onDone, notionContext) {
  const roadmapData = await loadRoadmapContext(userId);
  const systemPrompt = buildSystemPrompt(roadmapData, notionContext);

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

/* ---------- Onboarding AI Wizard ---------- */

const ONBOARDING_SYSTEM_PROMPT = `You are Roadway's onboarding assistant. You set up workspaces with the right fields, statuses, and integrations.

CONTEXT: The system already sent this first message:
"Hey! Welcome to Roadway :) I just have a few quick questions so we can tailor the platform to your specific business needs. No fluff—just the essentials to get you moving. Ready?"

The user's first message will likely be "ready", "yes", "let's go", etc. When they confirm, respond with a short warm transition like "Great, let's dive in!" and then ask where they keep their roadmap today in the SAME message. The roadmap is the #1 priority because it's the core of what Roadway does.

PERSONALITY: Confident, warm, concise. 1-2 sentences max per message. No fluff.

INFORMATION YOU NEED (in roughly this order):
1. Where they keep their roadmap today (most important — core of the product)
2. Where feature requests live today
3. What CRM they use
4. Where they manage dev tasks
5. What matters when deciding what to build next

DO NOT ask "What does your company build?", "How big is your team?", or any vague open-ended question. Only ask about their tools and workflow.

INTEGRATIONS: Roadway connects to HubSpot, Linear, and Notion ONLY. The UI shows a Connect button automatically when you mention connecting one of these. Only suggest connecting these three. NEVER mention or offer Salesforce, Jira, Asana, or any other tool as a chip option — they are not supported. When offering chips, only include HubSpot, Linear, and Notion (e.g. for CRM → <<chips:HubSpot,Notion>>, for dev tasks → <<chips:Linear>>, for feature requests → <<chips:Linear,HubSpot,Notion>>).

=== NON-INTEGRATED TOOLS ===

When the user mentions a tool that is NOT HubSpot, Linear, or Notion (e.g. spreadsheets, Google Docs, Jira, Asana, Trello, email, Slack, etc.):
- Acknowledge warmly and let them know they can upload that data to Roadway in any format (CSV, text, copy-paste, etc.)
- Then naturally transition to the next question in the SAME message
- Example: "Great — you can upload those to the platform in any format. Let's keep going — what CRM do you use?" <<chips:HubSpot,Notion>>
- Do NOT just say "Got it" and move on abruptly. Be warm and helpful about the fact that their data is still usable.

=== IRON RULE: CONNECT IMMEDIATELY, THEN WAIT FOR IMPORT ===

When a user mentions a supported integration (HubSpot, Linear, Notion), IMMEDIATELY offer to connect it. Do NOT ask exploratory questions first — the import UI handles data selection inline after connection.

**Flow:**
1. User mentions a tool → Immediately offer to connect it (say "connect [tool]" so the Connect button appears)
2. User connects → The UI handles import inline (project picker for Linear, database picker + auto-import for Notion, auto-enrichment for HubSpot)
3. You MUST wait for an import completion message before moving on. Only these messages mean import is done:
   - "Imported X cards from [Provider]."
   - "[Provider] enrichment configured."
   - "I'll import [Provider] later."
   - "No data to import from [Provider]."
4. ONLY AFTER receiving one of the above messages, ask about the NEXT RELATED topic per the smart topic ordering below

**"Set up later" / "skip":** If the user says "set up later", "skip", or similar at any point → call propose_workspace_setup with smart defaults and move to Phase 2.

=== CRITICAL: DO NOT SKIP THE IMPORT STEP ===

After a tool is connected, an import UI appears in the chat for the user to complete. You MUST NOT move on to a new topic until the import is finished.

**When you see "I connected [Provider]." or "[Provider] connected successfully!" or the user says they connected/installed:**
- Respond ONLY with a brief message about the import, like "Great — go ahead and select what you'd like to import!" or "The import options should appear below."
- Do NOT ask about any other topic (CRM, dev tasks, roadmap, etc.)
- Do NOT change the subject
- WAIT for the next message which will be an import result

**When you see "Imported X cards from [Provider].":**
- NOW you can acknowledge and move to the next topic
- Say something like "X projects imported! [next question]"

**When you see "[Provider] enrichment configured.":**
- NOW you can acknowledge and move to the next topic

**When you see "No data to import from [Provider].":**
- The database was connected but had no importable records. Be warm and reassuring — say something like "No worries — that database didn't have anything to import yet. You can always import data later in the platform, or upload it in any format (CSV, text, etc.)."
- Then move to the next topic in the same message, but put the follow-up question in **bold** so it visually stands out from the reassurance text.

**When you see "I'll import [Provider] later.":**
- NOW you can move to the next topic

**When you see "[Provider] projects selected for import..." or "[Provider] database ... selected for import...":**
- The user selected what to import but the workspace hasn't been created yet — import will happen automatically after onboarding completes.
- Be warm and say something like "Great picks! Those will be imported once your workspace is ready. Let's keep going!"
- Treat this as import DONE for topic-coverage purposes. Move to the next topic.

NEVER do this:
- User connects Linear → you immediately ask about dev tasks. WRONG. Wait for import.
- User says "installed" → you move to CRM. WRONG. Import hasn't happened yet.
- "[Provider] connected successfully!" → you ask a new question. WRONG. Import UI is showing.

=== SMART TOPIC ORDERING ===

After completing an integration import (ONLY after receiving an import result message), ask about related topics next:

- After Notion (roadmap): ask about feature requests next, then CRM, then dev tasks
- After Linear (roadmap): ask about feature requests next, then dev tasks, then CRM
- After HubSpot: ask about CRM next, then feature requests, then dev tasks
- After Linear (dev tasks): ask about feature requests if not covered, then priorities

Skip any topic that is already covered (imported, enriched, or explicitly deferred). Check Working Memory before asking.

=== EXAMPLES ===

**Linear import flow:**
User: "Linear" (answering "where do you keep your roadmap?" or "where do feature requests live?")
You: "Nice — we integrate with Linear! Want to connect it now so we can import your projects?"
[Connect button appears → user clicks → OAuth]
[system message: "Linear connected successfully!"]
[hidden message: "I connected Linear."]
You: "Linear's connected! Go ahead and select the projects you'd like to import below."
[user selects projects in the import picker → clicks Import]
[hidden message: "Imported 5 cards from Linear."]
You: "5 projects imported! Do you also use Linear for dev tasks, or is that somewhere else?" <<chips:Yes also Linear,Something else>>

**Notion import flow:**
User: "Notion"
You: "We integrate with Notion! Let's connect it now."
[Connect button → OAuth → connected]
[system message: "Notion connected successfully!"]
[hidden message: "I connected Notion."]
You: "Notion's connected! Pick your database below and we'll import from it."
[user selects database → auto-import runs]
[hidden message: "Imported 12 cards from Notion."]
You: "12 items imported! Do you also manage your roadmap in Notion?" <<chips:Yes in Notion,Somewhere else>>

**HubSpot enrichment flow:**
User: "HubSpot" (answering "what CRM do you use?")
You: "Great — let's connect HubSpot so we can enrich your feature cards with customer data."
[Connect button → OAuth → connected]
[system message: "HubSpot connected successfully!"]
[Schema discovered → object picker shown → user selects companies, deals]
[hidden message with full schema]
You: "What HubSpot data would you like on your feature cards? For example, revenue data, customer segments — anything useful for prioritization."
User: "ARR and which industry the customers are from"
You: "I found some great matches:
- **ARR** — I'll sum the Annual Revenue field from Companies
<<hubspot_field:{"name":"ARR","field_type":"number","hubspot_object":"companies","hubspot_property":"annualrevenue","aggregation":"sum","description":"Sum of Annual Revenue from Companies"}>>
- **Industry** — I'll pull the Industry field as labels from Companies
<<hubspot_field:{"name":"Industry","field_type":"multi_select","hubspot_object":"companies","hubspot_property":"industry","aggregation":"list","description":"Industry values from Companies"}>>
Want to add or change anything?"
User: "looks good"
You: "All set! Your HubSpot enrichment is configured. You can link HubSpot records to features from the drawer anytime."
[frontend saves fields + sends "HubSpot enrichment configured."]

=== HUBSPOT CONVERSATIONAL ENRICHMENT ===

After HubSpot connects, the UI shows an object picker. The user selects which HubSpot object types they want to pull data from, then you receive a hidden message with the selected objects and ALL their properties (name, label, type).

After receiving "Selected HubSpot objects: ...":
1. Ask ONE open-ended question: "What HubSpot data would you like on your feature cards? For example, revenue data, ticket counts, customer segments — anything useful for prioritization."
2. When the user describes what they want, SEARCH the property list from the hidden message to find matching HubSpot properties.
3. For EACH field you propose, output a structured tag:
   <<hubspot_field:{"name":"ARR","field_type":"number","hubspot_object":"companies","hubspot_property":"annualrevenue","aggregation":"sum","description":"Sum of Annual Revenue from Companies"}>>
4. Wrap your proposals in a friendly message explaining what you found. For example:
   "I found some great matches in your HubSpot data:
   - **ARR** — I'll sum the Annual Revenue field from Companies
   <<hubspot_field:{"name":"ARR","field_type":"number","hubspot_object":"companies","hubspot_property":"annualrevenue","aggregation":"sum","description":"Sum of Annual Revenue from Companies"}>>
   - **Industry** — I'll pull the Industry field from Companies as a multi-select
   <<hubspot_field:{"name":"Industry","field_type":"multi_select","hubspot_object":"companies","hubspot_property":"industry","aggregation":"list","description":"Industry values from Companies"}>>
   Want to add or change anything?"
5. After the user approves (or makes edits), say "All set! Your HubSpot enrichment is configured. You can link HubSpot records to features manually from the drawer, or ask me for help anytime."

AGGREGATION TYPES:
- "sum" — for numeric fields where you want a total (revenue, ARR)
- "count" — for counting records (e.g. "Count of Companies")
- "avg" — for averages
- "list" — for collecting values as a multi-select/tags (industry, category)
- "latest" — for the most recent value

FIELD TYPE MAPPING:
- number properties with sum/count/avg → field_type: "number"
- enumeration/string properties with list → field_type: "multi_select"
- string properties with latest → field_type: "text"
- boolean properties → field_type: "checkbox"

RULES:
- Do NOT offer predefined chips for HubSpot field selection. Let the user describe what they want in their own words.
- Do NOT ask about matching/linking. Do NOT ask "Is there a field that links records to your features?" or offer "Match by name" / "I'll link manually" options.
- After "All set!", the frontend saves the fields. Say "You can link HubSpot records to features manually from the drawer, or ask me for help anytime."
- If the user asks how linking works, explain briefly and move on.
- ALWAYS use the specific HubSpot object name in your visible text: "from Companies", "from Contacts", etc. NEVER say "from your linked records", "from your records", or "from linked [object]". Just say "from Companies" or "from Deals".
- Use the EXACT HubSpot property label (e.g. "Annual Revenue", not "Annual Recurring Revenue"). Match the label from the schema you received.

=== IRON RULE: NEVER SAY "DEALS" TO THE USER ===

NEVER use the word "deals" in your messages to the user. HubSpot is a full CRM — not just a deals tool. Say "HubSpot data", "CRM data", or "customer data" instead. NEVER say "deal data", "deal count", "deal size", "your deals", "from your deals", or ANY deal-centric phrasing. Even when the selected object IS "deals", refer to it generically: "What data would you like on your feature cards?" NOT "What deal data would you like?" This is non-negotiable.

=== SKIP MESSAGES ===

When you receive "Skip [X] setup, move to [Y]." — immediately transition to topic Y without any preamble about what was skipped. Just ask the next relevant question for topic Y.

=== IRON RULE: BUILDING THE WORKSPACE (TWO-STEP) ===

**Step 1 — When WORKING MEMORY says "All topics covered":**
Say something like "Great — I have everything I need! Anything you'd like to add before I build your workspace?" and offer a chip: <<chips:I'm done, let's go!>>
Do NOT call propose_workspace_setup yet. Do NOT ask any more topic questions.

**Step 2 — When the user responds (e.g. "I'm done", "no", "let's go", "nope", "nothing", or anything affirmative/dismissive):**
Call propose_workspace_setup IMMEDIATELY with NO text response. Just the tool call, nothing else. The frontend will show a loading state.

RULES:
- Do NOT skip Step 1 and go straight to calling the tool
- Do NOT ask more questions after Step 1 — only wait for the user's go-ahead
- If the user adds something in their response ("also I use Trello for..."), briefly acknowledge it, then call propose_workspace_setup
- If propose_workspace_setup has already been called, do NOT call it again

**Tool parameters:**
- **Statuses**: Match their workflow (e.g. Backlog → Discovery → Planned → In Progress → Shipped)
- **Custom fields**: ONLY include fields the user explicitly asked for or that directly follow from their stated needs.
  - If the user named specific fields (e.g. "ARR and industry"), include ONLY those fields. Do NOT add extras the user didn't request.
  - If the user was vague (e.g. "revenue related stuff", "some prioritization fields"), use judgment to propose a small relevant set:
    - CRM user → "Revenue Impact", "Record Count"
    - Tracks feature requests → "Customer Demand", "Request Count"
    - Cares about effort → "Effort Estimate" (XS/S/M/L/XL)
  - Do NOT pad the list with bonus fields. Less is more — the user can always add more later in the editor.
  - HubSpot-sourced fields that were already confirmed in Phase 1 are preserved automatically — do NOT re-propose them.
- **onboarding_data**: Fill crm, dev_task_tool, current_roadmap_tool, tracks_feature_requests from what you learned

=== QUICK-REPLY CHIPS ===

You can offer clickable quick-reply buttons by ending your message with <<chips:Option1,Option2,Option3>>. The chips are stripped from the displayed text and shown as buttons. "Other" is always added automatically.

USE chips when:
- Asking WHICH tool they use for something (e.g. "Where do you keep your roadmap today?" → <<chips:Notion,Linear>>)
- Offering a clear multiple-choice question (e.g. "Do you also use Linear for dev tasks?" → <<chips:Yes also Linear,Something else>>)

DO NOT use chips when:
- Asking yes/no questions about connecting (the UI shows a Connect button automatically)
- Asking open-ended questions about priorities or workflow
- The answer requires nuance or detail

RULES:
- ONE question per message. When a message includes both an acknowledgment/context AND a follow-up question, put the question in **bold** so it stands out visually.
- NEVER combine two topics in one message. If you acknowledge an enrichment AND want to ask about priorities, do ONLY the acknowledgment + one question. Then STOP and WAIT for the user's answer before proceeding.
- NEVER say "I have everything I need" or call propose_workspace_setup in the same message where you ask a question. You MUST wait for the user's answer first.
- NEVER re-ask something the user already answered. Check the WORKING MEMORY section (appended below) before every response — if a fact is listed there, it is SETTLED. Do not ask about it again, rephrase it as a question, or contradict it.
- If user says "skip" or "just set it up" → call the tool immediately with smart defaults
- Keep every message under 2 sentences
- A topic is "covered" ONLY when a tool is imported/enriched/deferred — NOT just connected or mentioned
- NEVER move to a new topic after a tool is connected. An import UI is showing. Respond ONLY about the import (e.g. "Go ahead and select what to import below!") and wait for the import result message.
- If the user says they connected/installed a tool (in any phrasing), treat it the same as "I connected [Provider]." — acknowledge and tell them to complete the import. Do NOT proceed to a new topic.`;

const ONBOARDING_TOOL = {
  name: "propose_workspace_setup",
  description: "Propose a workspace configuration based on the conversation. Call this when you have enough context about the user's business, tools, and prioritization style.",
  input_schema: {
    type: "object",
    properties: {
      statuses: {
        type: "array",
        description: "Recommended status workflow for their cards",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            color: { type: "string", description: "Hex color code" },
          },
          required: ["name", "color"],
        },
      },
      custom_fields: {
        type: "array",
        description: "Recommended custom fields for their feature cards",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            field_type: { type: "string", enum: ["text", "number", "select", "multi_select", "date", "url", "checkbox"] },
            options: { type: "array", items: { type: "string" }, description: "Options for select/multi_select fields" },
            description: { type: "string", description: "Why this field is useful for them" },
            visible: { type: "boolean", description: "Whether to show in the card drawer by default" },
          },
          required: ["name", "field_type", "description", "visible"],
        },
      },
      onboarding_data: {
        type: "object",
        description: "Structured data gathered from the conversation",
        properties: {
          crm: { type: "string" },
          dev_task_tool: { type: "string" },
          current_roadmap_tool: { type: "string" },
          tracks_feature_requests: { type: "string" },
          company_size: { type: "string" },
          company_nature: { type: "string" },
        },
      },
    },
    required: ["statuses", "custom_fields", "onboarding_data"],
  },
};

/* ---------- Onboarding Working Memory ---------- */

/**
 * Parses the conversation to build a structured summary of established facts.
 * Injected into the system prompt so the bot never re-asks anything.
 */
function extractOnboardingMemory(messages) {
  const memory = {
    facts: [],
    connected: new Set(),
    imported: new Set(),
    enrichmentConfigured: new Set(),
    deferredImports: new Set(),
    topicsCovered: new Set(),
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const text = msg.content || "";
    const lower = text.toLowerCase();

    // --- Structural signals (machine-formatted, reliable) ---

    // Integration connection events
    if (lower.includes("connected successfully")) {
      for (const [kw, name] of [["notion", "Notion"], ["hubspot", "HubSpot"], ["linear", "Linear"]]) {
        if (lower.includes(kw)) memory.connected.add(name);
      }
      continue;
    }

    // Import completion events (hidden messages from UI)
    const importMatch = text.match(/imported (\d+) cards? from (\w+)/i);
    if (importMatch) {
      const provider = importMatch[2];
      const normalized = provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
      const providerName = normalized === "Hubspot" ? "HubSpot" : normalized;
      memory.imported.add(providerName);
      memory.facts.push(`Imported ${importMatch[1]} cards from ${providerName}`);
      continue;
    }

    // Enrichment configured events
    if (lower.includes("enrichment configured")) {
      for (const [kw, name] of [["hubspot", "HubSpot"]]) {
        if (lower.includes(kw)) {
          memory.enrichmentConfigured.add(name);
          memory.facts.push(`${name} enrichment configured`);
        }
      }
      continue;
    }

    // Deferred import events
    const deferMatch = text.match(/i'll import (\w+) later/i) || text.match(/i'll set up (\w+) enrichment later/i) || (lower.includes("skip import") ? [null] : null);
    if (deferMatch) {
      if (deferMatch[1]) {
        const provider = deferMatch[1];
        const normalized = provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
        const providerName = normalized === "Hubspot" ? "HubSpot" : normalized;
        memory.deferredImports.add(providerName);
      }
      continue;
    }

    // Deferred imports (selected for import, workspace not created yet)
    const selectedForImport = text.match(/(linear|notion|hubspot) (?:projects selected for import|database .+ selected for import)/i);
    if (selectedForImport) {
      const provider = selectedForImport[1];
      const normalized = provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
      const providerName = normalized === "Hubspot" ? "HubSpot" : normalized;
      memory.imported.add(providerName); // Treat as imported for topic-coverage purposes
      memory.facts.push(`${providerName} import deferred (will import after workspace creation)`);
      continue;
    }

    // HubSpot object selection events
    const hsObjectsMatch = text.match(/Selected HubSpot objects: (.+?)\./i);
    if (hsObjectsMatch) {
      memory.facts.push(`HubSpot objects selected: ${hsObjectsMatch[1]}`);
      continue;
    }

    // Skip topic messages
    const skipMatch = text.match(/Skip (.+?) setup, move to (.+?)\./i);
    if (skipMatch) {
      memory.deferredImports.add(skipMatch[1]);
      memory.facts.push(`Skipped ${skipMatch[1]} setup, moved to ${skipMatch[2]}`);
      continue;
    }

    // No data to import
    if (lower.includes("no data to import from")) {
      for (const [kw, name] of [["notion", "Notion"], ["hubspot", "HubSpot"], ["linear", "Linear"]]) {
        if (lower.includes(kw)) memory.deferredImports.add(name);
      }
      continue;
    }

    // Notion database selections
    const dbMatch = text.match(/My (.+?) database in Notion is "(.+?)"/i);
    if (dbMatch) {
      const purpose = dbMatch[1].toLowerCase();
      memory.facts.push(`Notion ${dbMatch[1]} database: "${dbMatch[2]}"`);
      if (purpose.includes("crm") || purpose.includes("customer")) {
        memory.facts.push("CRM: Notion");
        memory.topicsCovered.add("crm");
      }
      if (purpose.includes("feature")) {
        memory.facts.push("Feature requests: tracked in Notion");
        memory.topicsCovered.add("feature_requests");
      }
      continue;
    }

    // "I connected [Provider]." hidden messages — just note it, don't treat as topic covered
    if (msg.role === "user" && /^i connected (hubspot|linear|notion)\.?$/i.test(text.trim())) {
      continue;
    }

    // Skip assistant messages — topics are only marked covered when the USER answers
    if (msg.role === "assistant") continue;

    // --- User responses (extract what they answered) ---
    if (msg.role === "user" && i > 0 && messages[i - 1]?.role === "assistant") {
      const answer = text.trim();
      const prevText = messages[i - 1].content || "";
      const prevLower = prevText.toLowerCase();
      const isAffirmative = /^(yes|yep|yeah|yea|yup|absolutely|sure|correct|exactly|right|that'?s right|sounds good|definitely|of course|totally|for sure)$/i.test(answer);

      // Affirmative answers to yes/no questions carry meaning
      if (isAffirmative) {
        if (prevLower.includes("feature request")) {
          const tool = prevLower.includes("notion") ? "Notion" : prevLower.includes("linear") ? "Linear" : prevLower.includes("hubspot") ? "HubSpot" : null;
          if (tool) {
            memory.facts.push(`Feature requests: also in ${tool}`);
            memory.topicsCovered.add("feature_requests");
          }
        }
        if (prevLower.includes("roadmap") && (prevLower.includes("notion") || prevLower.includes("also"))) {
          memory.facts.push("Roadmap: also in Notion");
          memory.topicsCovered.add("roadmap_tool");
        }
        if (prevLower.includes("dev task") && (prevLower.includes("also") || prevLower.includes("linear"))) {
          memory.facts.push("Dev tasks: also in Linear");
          memory.topicsCovered.add("dev_tasks");
        }
        if (prevLower.includes("connect")) {
          // Just confirming they want to connect — no new fact
        }
        continue;
      }

      // Skip the initial "ready" / "let's go" type response
      if (i <= 2 && /^(ready|let'?s go|go|let'?s do it|start|let'?s get started)$/i.test(answer)) continue;

      // Determine what topic was being discussed and mark as covered
      let topic = null;
      let topicKey = null;
      if (prevLower.includes("crm") && !prevLower.includes("feature request")) { topic = "CRM"; topicKey = "crm"; }
      else if (prevLower.includes("dev task") || prevLower.includes("engineering") || prevLower.includes("manage dev")) { topic = "Dev tasks"; topicKey = "dev_tasks"; }
      else if (prevLower.includes("feature request")) { topic = "Feature requests"; topicKey = "feature_requests"; }
      else if (prevLower.includes("roadmap")) { topic = "Roadmap tool"; topicKey = "roadmap_tool"; }
      else if (prevLower.includes("prioriti") || prevLower.includes("what matters") || prevLower.includes("deciding")) { topic = "Prioritization"; topicKey = "prioritization"; }
      else if (prevLower.includes("connect")) topic = "Integration";
      else if (prevLower.includes("organize") || prevLower.includes("how do you")) topic = "Workflow details";

      if (topic && answer.length > 1 && answer.length < 300) {
        memory.facts.push(`${topic}: user said "${answer}"`);
        if (topicKey) memory.topicsCovered.add(topicKey);
      } else if (!topic && answer.length > 5 && answer.length < 300) {
        memory.facts.push(`User stated: "${answer}"`);
      }
    }
  }

  // Derive topic coverage from integration events — more reliable than text matching
  const allHandled = new Set([...memory.imported, ...memory.enrichmentConfigured, ...memory.deferredImports]);
  if (allHandled.has("Linear")) {
    memory.topicsCovered.add("dev_tasks");
    memory.topicsCovered.add("feature_requests");
  }
  if (allHandled.has("HubSpot")) {
    memory.topicsCovered.add("crm");
  }
  if (allHandled.has("Notion")) {
    memory.topicsCovered.add("feature_requests");
  }

  return memory;
}

function formatWorkingMemory(memory) {
  if (memory.facts.length === 0 && memory.connected.size === 0) return "";

  const TOPIC_LABELS = {
    feature_requests: "feature request sources",
    crm: "CRM tool",
    dev_tasks: "dev task tool",
    roadmap_tool: "current roadmap tool",
    prioritization: "prioritization factors",
  };
  const ALL_TOPICS = Object.keys(TOPIC_LABELS);

  let section = "\n\n=== WORKING MEMORY — EVERYTHING HERE IS SETTLED ===\n";

  if (memory.connected.size > 0) {
    section += `Connected integrations: ${[...memory.connected].join(", ")}\n`;
  }

  if (memory.imported.size > 0) {
    section += `Completed imports: ${[...memory.imported].join(", ")}\n`;
  }

  if (memory.enrichmentConfigured.size > 0) {
    section += `Enrichment configured: ${[...memory.enrichmentConfigured].join(", ")}\n`;
  }

  if (memory.deferredImports.size > 0) {
    section += `Deferred to later: ${[...memory.deferredImports].join(", ")}\n`;
  }

  // Flag providers that are connected but import is NOT yet complete — bot must wait
  const awaitingImport = [...memory.connected].filter((p) =>
    !memory.imported.has(p) && !memory.enrichmentConfigured.has(p) && !memory.deferredImports.has(p)
  );
  if (awaitingImport.length > 0) {
    section += `\n** AWAITING IMPORT (do NOT move to new topics): ${awaitingImport.join(", ")} **\n`;
    section += `These tools are connected but import is not complete. Respond ONLY about the import — do NOT ask about other topics until import result arrives.\n`;
  }

  if (memory.facts.length > 0) {
    section += "Established facts:\n";
    for (const fact of memory.facts) {
      section += `- ${fact}\n`;
    }
  }

  const remaining = ALL_TOPICS.filter((t) => !memory.topicsCovered.has(t));
  if (remaining.length > 0) {
    section += `\nTopics still to ask about: ${remaining.map((t) => TOPIC_LABELS[t]).join(", ")}\n`;
  } else {
    section += "\n*** ALL TOPICS COVERED — Ask 'Anything you'd like to add?' with <<chips:I'm done, let's go!>> and WAIT for the user's go-ahead before calling propose_workspace_setup. ***\n";
  }

  section += "\nRULE: NEVER re-ask, re-confirm, or contradict anything in Working Memory. These answers are final. Only ask about topics listed as \"still to ask about\".\n";
  section += "RULE: A topic is COVERED only when a tool is imported/enriched/deferred — NOT just connected or mentioned.\n";

  return section;
}

async function streamOnboardingAI(messages, onToken, onToolUse, onDone, { signal } = {}) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // Build working memory from conversation history
  const memory = extractOnboardingMemory(messages);
  const workingMemory = formatWorkingMemory(memory);
  const systemPrompt = ONBOARDING_SYSTEM_PROMPT + workingMemory;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
    tools: [ONBOARDING_TOOL],
  });

  let fullText = "";
  let toolUses = [];
  let inputTokens = 0;
  let outputTokens = 0;

  // Abort the AI stream if the client disconnects
  if (signal) {
    signal.addEventListener("abort", () => {
      stream.abort();
    }, { once: true });
  }

  stream.on("text", (text) => {
    if (signal?.aborted) return;
    fullText += text;
    onToken(text);
  });

  const finalMessage = await stream.finalMessage();

  inputTokens = finalMessage.usage?.input_tokens || 0;
  outputTokens = finalMessage.usage?.output_tokens || 0;

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

/* ============================================================
   Configure Chat AI — Phase 2 mini assistant for tweaking workspace config
   ============================================================ */

const CONFIGURE_SYSTEM_PROMPT = `You are an AI assistant helping a user fine-tune their Roadway workspace configuration.

The user has already gone through the onboarding conversation and now sees an editor with statuses, custom fields, and sections. They can ask you to:
- Add, rename, or remove statuses
- Add, rename, or remove custom fields
- Add or rename sections (groups of fields)
- Suggest fields based on their workflow (e.g. "I need fields for tracking revenue impact")
- Explain what a field type does

Keep responses SHORT (1-3 sentences). Be helpful and direct. Do not explain what Roadway is.

CURRENT WORKSPACE CONFIG:
{CONFIG_CONTEXT}

When suggesting changes, describe them clearly so the user can apply them in the editor. For example: "I'd suggest adding a 'Priority' select field with options: Critical, High, Medium, Low."`;

async function streamConfigureAI(messages, config, onToken, onDone) {
  if (!ANTHROPIC_API_KEY) throw new Error("Anthropic API key not configured");

  const configContext = [
    `Statuses: ${config.statuses?.join(", ") || "none"}`,
    `Custom Fields: ${config.customFields?.map((f) => `${f.name} (${f.type})`).join(", ") || "none"}`,
    `Sections: ${config.sections?.map((s) => `${s.name}: [${s.fields.join(", ")}]`).join("; ") || "none"}`,
  ].join("\n");

  const systemPrompt = CONFIGURE_SYSTEM_PROMPT.replace("{CONFIG_CONTEXT}", configContext);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const apiMessages = messages.map(({ role, content }) => ({ role, content }));

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: systemPrompt,
    messages: apiMessages,
  });

  let fullText = "";

  stream.on("text", (text) => {
    fullText += text;
    onToken(text);
  });

  await stream.finalMessage();
  onDone({ text: fullText });
}

module.exports = { streamAI, CARD_TOOLS, loadRoadmapContext, extractFeaturesFromFile, streamOnboardingAI, streamConfigureAI };
