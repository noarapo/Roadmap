import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUp,
  Sparkles,
  Loader,
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Info,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Pencil,
  X,
} from "lucide-react";
import {
  submitOnboarding,
  getHubSpotAuthUrl, getLinearAuthUrl, getNotionAuthUrl,
  getIntegrations,
  getNotionDatabases, previewNotionDatabase, importNotionDatabase,
  getLinearProjects, importLinearProjects,
  discoverHubSpotSchema, saveHubSpotMappings,
  disconnectIntegration,
} from "../services/api";
import { useStore } from "../hooks/useStore";
import WorkspaceEditor from "../components/WorkspaceEditor";
import DrawerPreview from "../components/DrawerPreview";

/* ============================================================
   OnboardingPage — AI Wizard Onboarding
   Phase 0: Welcome
   Phase 1: AI Chat (conversational setup)
   Phase 2: Configure (AI-populated editor)
   Phase 3: Landing (success)
   ============================================================ */

/* ---------- Simple markdown renderer (reused from ChatPanel) ---------- */
function renderMarkdown(text) {
  if (!text) return null;
  // Strip internal tags before rendering (hubspot_field proposals, chips)
  const cleaned = text.replace(/\s*<<hubspot_field:\{.+?\}>>\s*/g, "\n").replace(/\s*<<chips:.+?>>\s*/g, "");
  const lines = cleaned.split("\n");
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    if (h3) { elements.push(<h4 key={i} style={{ margin: "12px 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>{inlineMd(h3[1])}</h4>); i++; continue; }
    if (h2) { elements.push(<h3 key={i} style={{ margin: "14px 0 4px", fontSize: "0.9rem", fontWeight: 600 }}>{inlineMd(h2[1])}</h3>); i++; continue; }
    if (h1) { elements.push(<h2 key={i} style={{ margin: "16px 0 6px", fontSize: "0.95rem", fontWeight: 700 }}>{inlineMd(h1[1])}</h2>); i++; continue; }
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, "")); i++; }
      elements.push(<ol key={`ol-${i}`} style={{ margin: "6px 0", paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 2 }}>{inlineMd(it)}</li>)}</ol>);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, "")); i++; }
      elements.push(<ul key={`ul-${i}`} style={{ margin: "6px 0", paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 2 }}>{inlineMd(it)}</li>)}</ul>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    elements.push(<p key={i} style={{ margin: "4px 0" }}>{inlineMd(line)}</p>);
    i++;
  }
  return elements;
}

function inlineMd(text) {
  const parts = [];
  let remaining = text;
  let key = 0;
  while (remaining) {
    const bold = remaining.match(/\*\*(.+?)\*\*/);
    if (bold) {
      if (bold.index > 0) parts.push(remaining.slice(0, bold.index));
      parts.push(<strong key={key++}>{bold[1]}</strong>);
      remaining = remaining.slice(bold.index + bold[0].length);
      continue;
    }
    const code = remaining.match(/`(.+?)`/);
    if (code) {
      if (code.index > 0) parts.push(remaining.slice(0, code.index));
      parts.push(<code key={key++} style={{ background: "var(--bg-secondary)", padding: "1px 4px", borderRadius: 3, fontSize: "0.85em" }}>{code[1]}</code>);
      remaining = remaining.slice(code.index + code[0].length);
      continue;
    }
    parts.push(remaining);
    break;
  }
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}

/* ---------- Auth headers helper ---------- */
function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ---------- Default workspace config (used for skip) ---------- */
const DEFAULT_STATUSES = [
  { name: "Backlog", color: "#A0AEC0" },
  { name: "Planned", color: "#4299E1" },
  { name: "In Progress", color: "#ECC94B" },
  { name: "Done", color: "#48BB78" },
];

const DEFAULT_CUSTOM_FIELDS = [];

/* ---------- Built-in fields shown in drawer preview & editor ---------- */
const DEFAULT_BUILTIN_FIELDS = [
  { name: "Status", builtin: true, visible: true },
  { name: "Teams", builtin: true, visible: true },
  { name: "Sprint", builtin: true, visible: true },
  { name: "Duration", builtin: true, visible: true },
  { name: "Tags", builtin: true, visible: true },
];

/* ---------- Initial AI message ---------- */
const INITIAL_AI_MESSAGE = "Hey! Welcome to Roadway :)\n\nI just have a few quick questions so we can tailor the platform to your specific business needs. No fluff\u2014just the essentials to get you moving.\n\nReady?";

/* ---------- BroadcastChannel name for OAuth communication ---------- */
const OAUTH_CHANNEL = "roadway-onboarding-oauth";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setCurrentUser } = useStore();

  // Detect OAuth return — if this tab was opened by OAuth callback
  const connectedProvider = searchParams.get("notion") === "connected" ? "Notion"
    : searchParams.get("hubspot") === "connected" ? "HubSpot"
    : searchParams.get("linear") === "connected" ? "Linear"
    : null;

  // Phase: 0=welcome, 1=chat, 2=configure, 3=landing
  const [phase, setPhase] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([
    { role: "assistant", content: INITIAL_AI_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [buildingWorkspace, setBuildingWorkspace] = useState(false);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Quick-reply chips state
  const [quickReplies, setQuickReplies] = useState({ type: "hero", options: ["Let's go"] });
  const [repliesFadingOut, setRepliesFadingOut] = useState(false);

  // Configure state (populated by AI or defaults)
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [builtinFields, setBuiltinFields] = useState(DEFAULT_BUILTIN_FIELDS);
  const [customFields, setCustomFields] = useState(DEFAULT_CUSTOM_FIELDS);
  const [onboardingData, setOnboardingData] = useState({});

  // Sections state (groups of fields in the drawer)
  const [sections, setSections] = useState([]);
  // Each: { name: string, fields: [{ name, field_type, options, description, visible }] }

  // Collapsible editor sections
  const [collapsedSections, setCollapsedSections] = useState(new Set());

  // Phase 2: Configure AI chat + sections
  const [configMessages, setConfigMessages] = useState([
    { role: "assistant", content: "Need help? Tell me what you'd like to change — add fields, rename statuses, or adjust anything above." },
  ]);
  const [configInput, setConfigInput] = useState("");
  const [configStreaming, setConfigStreaming] = useState(false);
  const [configStreamingText, setConfigStreamingText] = useState("");
  const [editorChatSplit, setEditorChatSplit] = useState(65); // percentage for editors
  const configEndRef = useRef(null);
  const configInputRef = useRef(null);
  const dragRef = useRef(null);

  // Integration state
  const [connectingIntegration, setConnectingIntegration] = useState(null);
  const [connectedIntegrations, setConnectedIntegrations] = useState(new Set());

  // Notion database picker state (separate from messages — renders below last message)
  const [activeDbPicker, setActiveDbPicker] = useState(null); // { purpose, databases } or null
  const [notionIntegrationId, setNotionIntegrationId] = useState(null);

  // Linear inline import state
  const [activeLinearImport, setActiveLinearImport] = useState(null);
  // { integrationId, projects: [], selectedProjects: Set, loading, importing, result, error }

  // Notion auto-import state
  const [activeNotionImport, setActiveNotionImport] = useState(null);
  // { integrationId, databaseId, dbTitle, step: 'importing'|'done'|'error', result, error }

  // HubSpot conversational enrichment state
  const [activeHubSpotSetup, setActiveHubSpotSetup] = useState(null);
  // { integrationId, step: 'discovering'|'picking_objects'|'conversing'|'done'|'error', schema, availableObjects, selectedObjects: Set, error }

  // HubSpot proposed fields (from AI <<hubspot_field:...>> tags, before user confirms)
  const [hubspotProposedFields, setHubspotProposedFields] = useState([]);
  const hubspotProposedFieldsRef = useRef([]);
  hubspotProposedFieldsRef.current = hubspotProposedFields;

  // Integration summary cards state (Phase 2)
  const [expandedIntegrationCards, setExpandedIntegrationCards] = useState(new Set());
  const [hubspotSchema, setHubspotSchema] = useState(null); // { availableObjects: [...] }
  const [hubspotRecordMatching, setHubspotRecordMatching] = useState("manual");
  const [hubspotAutoMatchFields, setHubspotAutoMatchFields] = useState({ hubspotProperty: "", roadwayField: "" });
  const [hubspotRecordTypes, setHubspotRecordTypes] = useState(new Set(["companies", "deals"]));
  const [editingEnrichmentField, setEditingEnrichmentField] = useState(null); // index of field being inline-edited
  const [hubspotIntegrationId, setHubspotIntegrationId] = useState(null);
  const [showIntegrationPicker, setShowIntegrationPicker] = useState(false);

  // Auto-continue conversation after non-Notion tool connection
  const [autoContinueProvider, setAutoContinueProvider] = useState(null);
  const autoContinueFired = useRef(false); // StrictMode double-fire guard

  // Ref to prevent duplicate BroadcastChannel handling (React StrictMode fires effects twice)
  const oauthHandledProviders = useRef(new Set());

  // Ref to always have latest sendMessage in BroadcastChannel handler
  const sendMessageRef = useRef(null);

  // Refs to avoid stale closures in finalizeHubSpotEnrichment (Bug 1)
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const activeHubSpotSetupRef = useRef(activeHubSpotSetup);
  activeHubSpotSetupRef.current = activeHubSpotSetup;
  const customFieldsRef = useRef(customFields);
  customFieldsRef.current = customFields;

  /* ---------- If this is the OAuth callback tab, broadcast + close ---------- */
  useEffect(() => {
    if (connectedProvider) {
      try {
        const bc = new BroadcastChannel(OAUTH_CHANNEL);
        bc.postMessage({ type: "connected", provider: connectedProvider });
        bc.close();
      } catch { /* BroadcastChannel not supported, fall through */ }
      window.close();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If this is the callback tab and couldn't close, render a simple success screen
  if (connectedProvider) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-card ob-welcome">
          <div className="ob-welcome-icon"><Check size={32} /></div>
          <h1>{connectedProvider} connected!</h1>
          <p className="ob-welcome-subtitle">You can close this tab and return to the onboarding chat.</p>
        </div>
      </div>
    );
  }

  /* ---------- Listen for OAuth success from other tabs ---------- */
  useEffect(() => {
    let bc;
    try {
      bc = new BroadcastChannel(OAUTH_CHANNEL);
      bc.onmessage = async (e) => {
        if (e.data?.type === "connected" && e.data.provider) {
          const provider = e.data.provider;

          // Deduplicate — only handle each provider ONCE
          if (oauthHandledProviders.current.has(provider)) return;
          oauthHandledProviders.current.add(provider);

          setConnectedIntegrations((prev) => new Set([...prev, provider]));

          // Clear any stale quick-reply chips — the topic has been answered
          setQuickReplies(null);

          // Add single success message
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `${provider} connected successfully!` },
          ]);

          // Start provider-specific import flow (shared with handleConnectIntegration)
          startImportFlow(provider);
        }
      };
    } catch { /* BroadcastChannel not supported */ }
    return () => { if (bc) bc.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Auto-scroll chat ---------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  /* ---------- Auto-resize textarea ---------- */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  /* ---------- Quick-reply chip click ---------- */
  function handleChipClick(text) {
    if (streaming) return; // Bug 4: prevent lost selection while streaming
    if (text === "Other") {
      textareaRef.current?.focus();
      return;
    }
    setRepliesFadingOut(true);
    setTimeout(() => {
      setQuickReplies(null);
      setRepliesFadingOut(false);
      sendMessage(text);
    }, 200);
  }

  /* ---------- Notion database selected from picker → auto-import ---------- */
  async function handleDbSelected(db, purpose) {
    // Clear the picker immediately so it can't be clicked twice
    setActiveDbPicker(null);

    const purposeLabel = purpose === "crm" ? "CRM" : purpose === "feature_requests" ? "feature requests" : "roadmap";
    // Show user message acknowledging selection
    setMessages((prev) => [...prev, { role: "user", content: `My ${purposeLabel} database in Notion is "${db.title}"` }]);

    // Start auto-import
    if (notionIntegrationId) {
      // Bug 7: roadmapId may not exist yet during onboarding (created in Phase 2/3)
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const roadmapId = user.lastRoadmapId || user.last_roadmap_id;

      if (!roadmapId) {
        // No roadmap exists yet — defer import, user can import after workspace is created
        sendMessage(`Notion database "${db.title}" selected for import. Import will happen after workspace is created.`, { hidden: true });
      } else {
        setActiveNotionImport({ integrationId: notionIntegrationId, databaseId: db.id, dbTitle: db.title, step: "importing", result: null, error: null });
        try {
          // Preview to get schema for auto-mapping
          const preview = await previewNotionDatabase(notionIntegrationId, db.id);
          const properties = preview.properties || [];

          // Auto-detect title property
          const titleProp = properties.find((p) => p.type === "title");
          // Auto-detect status property
          const statusProp = properties.find((p) => p.type === "status" || p.name?.toLowerCase() === "status");

          // Build field mappings
          const field_mappings = {};
          if (titleProp) field_mappings.name = titleProp.name || titleProp.id;
          if (statusProp) field_mappings.status = statusProp.name || statusProp.id;

          const result = await importNotionDatabase(notionIntegrationId, {
            database_id: db.id,
            roadmap_id: roadmapId,
            field_mappings,
          });

          const count = result.created || result.imported_count || result.count || 0;
          if (count === 0) {
            // Clear panel — bot will handle the messaging
            setActiveNotionImport(null);
            setMessages((prev) => [...prev, { role: "user", type: "action", content: `Selected "${db.title}" from Notion`, hidden: false }]);
            sendMessage("No data to import from Notion.", { hidden: true });
          } else {
            setActiveNotionImport((prev) => ({ ...prev, step: "done", result: { count } }));
            setMessages((prev) => [...prev, { role: "user", type: "action", content: `Imported ${count} items from Notion`, hidden: false }]);
            sendMessage(`Imported ${count} cards from Notion.`, { hidden: true });
          }
        } catch (err) {
          console.error("Notion auto-import error:", err);
          setActiveNotionImport((prev) => ({ ...prev, step: "error", error: err.message }));
          // Still send the selection message so AI can continue
          sendMessage("I connected Notion.", { hidden: true });
        }
      }
    } else {
      // Fallback: no integration ID — just send the message like before
      sendMessage(`My ${purposeLabel} database in Notion is "${db.title}"`);
    }
  }

  /* ---------- Linear import handlers ---------- */
  function toggleLinearProject(projectId) {
    setActiveLinearImport((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedProjects);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return { ...prev, selectedProjects: next };
    });
  }

  function toggleLinearSelectAll() {
    setActiveLinearImport((prev) => {
      if (!prev) return prev;
      const allSelected = prev.selectedProjects.size === prev.projects.length;
      return { ...prev, selectedProjects: allSelected ? new Set() : new Set(prev.projects.map((p) => p.id)) };
    });
  }

  // Note (Bug 11): handleLinearImport reads activeLinearImport.selectedProjects from closure.
  // This is low-risk since React re-renders on state change before the click handler fires.
  async function handleLinearImport() {
    if (!activeLinearImport || activeLinearImport.selectedProjects.size === 0) return;

    // Bug 7: roadmapId may not exist yet during onboarding (created in Phase 2/3)
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const roadmapId = user.lastRoadmapId || user.last_roadmap_id;

    if (!roadmapId) {
      // No roadmap exists yet — save selection for after workspace creation, defer import
      const selectedNames = activeLinearImport.projects
        .filter((p) => activeLinearImport.selectedProjects.has(p.id))
        .map((p) => p.name);
      setActiveLinearImport(null);
      setMessages((prev) => [...prev, { role: "user", type: "action", content: `Selected ${selectedNames.length} Linear projects`, hidden: false }]);
      sendMessage(`Linear projects selected for import: ${selectedNames.join(", ")}. Import will happen after workspace is created.`, { hidden: true });
      return;
    }

    setActiveLinearImport((prev) => ({ ...prev, importing: true, error: null }));
    try {
      const selectedIds = [...activeLinearImport.selectedProjects];
      const result = await importLinearProjects(activeLinearImport.integrationId, {
        projects: selectedIds.map((id) => ({ project_id: id })),
        roadmap_id: roadmapId,
      });
      const count = result.imported || result.imported_count || result.cards_created || result.count || 0;
      if (count === 0) {
        setActiveLinearImport(null);
        setMessages((prev) => [...prev, { role: "user", type: "action", content: `Selected ${selectedIds.length} Linear projects`, hidden: false }]);
        sendMessage("No data to import from Linear.", { hidden: true });
      } else {
        setActiveLinearImport((prev) => ({ ...prev, importing: false, result: { count } }));
        setMessages((prev) => [...prev, { role: "user", type: "action", content: `Imported ${count} items from Linear`, hidden: false }]);
        sendMessage(`Imported ${count} cards from Linear.`, { hidden: true });
      }
    } catch (err) {
      console.error("Linear import error:", err);
      setActiveLinearImport((prev) => ({ ...prev, importing: false, error: err.message }));
    }
  }

  function handleLinearSkip() {
    setActiveLinearImport(null);
    setMessages((prev) => [...prev, { role: "user", type: "action", content: "Skipped Linear import", hidden: false }]);
    sendMessage("I'll import Linear later.", { hidden: true });
  }

  /* ---------- HubSpot object picker handlers ---------- */
  function toggleHubSpotObject(key) {
    setActiveHubSpotSetup((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedObjects);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, selectedObjects: next };
    });
  }

  function toggleHubSpotSelectAll() {
    setActiveHubSpotSetup((prev) => {
      if (!prev) return prev;
      const allSelected = prev.selectedObjects.size === prev.availableObjects.length;
      return { ...prev, selectedObjects: allSelected ? new Set() : new Set(prev.availableObjects.map((o) => o.key)) };
    });
  }

  function handleHubSpotObjectsSelected() {
    if (!activeHubSpotSetup || activeHubSpotSetup.selectedObjects.size === 0) return;
    const selected = activeHubSpotSetup.availableObjects.filter((o) => activeHubSpotSetup.selectedObjects.has(o.key));
    // Build hidden message with full property details per selected object so AI can search the schema
    const parts = selected.map((obj) => {
      const props = (obj.properties || []).map((p) => `${p.name} (${p.label}, ${p.type})`).join(", ");
      return `${obj.key}: [${props}]`;
    });
    const objectNames = selected.map((o) => o.label || o.key).join(", ");
    const hiddenMsg = `Selected HubSpot objects: ${selected.map((o) => o.key).join(", ")}. Properties: ${parts.join("; ")}`;
    setActiveHubSpotSetup((prev) => ({ ...prev, step: "conversing" }));
    setMessages((prev) => [...prev, { role: "user", type: "action", content: `Selected ${objectNames} from HubSpot`, hidden: false }]);
    sendMessage(hiddenMsg, { hidden: true });
  }

  function handleHubSpotSkip() {
    setActiveHubSpotSetup(null);
    setHubspotProposedFields([]);
    setMessages((prev) => [...prev, { role: "user", type: "action", content: "Skipped HubSpot setup", hidden: false }]);
    sendMessage("I'll set up HubSpot enrichment later.", { hidden: true });
  }

  function removeHubSpotProposedField(index) {
    setHubspotProposedFields((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmHubSpotProposedFields() {
    const fields = hubspotProposedFieldsRef.current;
    setCustomFields((prev) => [
      ...prev,
      ...fields.map((f) => ({
        name: f.name,
        field_type: f.field_type,
        options: f.options || [],
        description: f.description || "",
        visible: true,
        source: "hubspot",
        source_property: f.hubspot_property,
        hubspot_object: f.hubspot_object,
        aggregation: f.aggregation,
      })),
    ]);
    setHubspotProposedFields([]);
    sendMessage("Looks good");
  }

  /* ---------- Finalize HubSpot enrichment from conversational flow ---------- */
  async function finalizeHubSpotEnrichment() {
    const currentSetup = activeHubSpotSetupRef.current;
    if (!currentSetup || currentSetup.step !== "conversing") return;

    // If user hasn't confirmed proposed fields yet, skip — don't finalize prematurely
    if (hubspotProposedFieldsRef.current.length > 0) return;

    // Collect HubSpot-sourced fields from customFields state (confirmed via proposal UI)
    const hsFields = customFieldsRef.current.filter((f) => f.source === "hubspot");
    const fieldMappings = hsFields.map((f) => ({
      hubspot_property: f.source_property,
      hubspot_object: f.hubspot_object,
      aggregation: f.aggregation || "count",
      roadway_field_name: f.name,
      roadway_field_type: f.field_type,
    }));

    try {
      if (fieldMappings.length > 0) {
        await saveHubSpotMappings(currentSetup.integrationId, { field_mappings: fieldMappings });
      }
      // Persist schema and integration ID for Phase 2 integration cards
      if (currentSetup.availableObjects?.length > 0) {
        setHubspotSchema({ availableObjects: currentSetup.availableObjects });
      }
      setHubspotIntegrationId(currentSetup.integrationId);
      if (currentSetup.selectedObjects?.size > 0) {
        setHubspotRecordTypes(new Set(currentSetup.selectedObjects));
      }
      setActiveHubSpotSetup(null);
      setMessages((prev) => [...prev, { role: "user", type: "action", content: `HubSpot enrichment configured (${fieldMappings.length} fields)`, hidden: false }]);
      sendMessage("HubSpot enrichment configured.", { hidden: true });
    } catch (err) {
      console.error("HubSpot save error:", err);
      setActiveHubSpotSetup((prev) => ({ ...prev, step: "error", error: err.message }));
    }
  }

  /* ---------- Start import flow for a provider (shared by BroadcastChannel + Connect button) ---------- */
  async function startImportFlow(provider) {
    if (provider === "Linear") {
      try {
        const integrations = await getIntegrations();
        const linearInt = integrations.find((i) => i.type === "linear" && i.status === "active");
        if (linearInt) {
          setActiveLinearImport({ integrationId: linearInt.id, projects: [], selectedProjects: new Set(), loading: true, importing: false, result: null, error: null });
          const projData = await getLinearProjects(linearInt.id);
          const projects = projData.projects || [];
          if (projects.length > 0) {
            setActiveLinearImport((prev) => ({ ...prev, projects, loading: false }));
          } else {
            setActiveLinearImport(null);
            sendMessageRef.current?.("No data to import from Linear.", { hidden: true });
          }
        } else {
          setAutoContinueProvider("Linear");
        }
      } catch (err) {
        console.error("Failed to fetch Linear projects:", err);
        setActiveLinearImport(null);
        setAutoContinueProvider("Linear");
      }
    } else if (provider === "HubSpot") {
      try {
        const integrations = await getIntegrations();
        const hsInt = integrations.find((i) => i.type === "hubspot" && i.status === "active");
        if (hsInt) {
          setActiveHubSpotSetup({ integrationId: hsInt.id, step: "discovering", schema: null, availableObjects: [], selectedObjects: new Set(), error: null });
          try {
            const schemaResult = await discoverHubSpotSchema(hsInt.id);
            const schema = schemaResult.schema || schemaResult;
            const rawObjects = schema.objects || {};
            // schema.objects may be a map { deals: {label, properties}, ... } or an array — normalize to array
            const objectsArray = Array.isArray(rawObjects)
              ? rawObjects
              : Object.entries(rawObjects).map(([key, val]) => ({ key, name: key, ...(typeof val === "object" ? val : {}) }));
            // Filter to objects that have properties, build available list
            const priorityOrder = ["deals", "tickets", "companies", "contacts"];
            const available = objectsArray
              .filter((obj) => obj.properties && obj.properties.length > 0)
              .map((obj) => ({ key: obj.key || obj.name, label: (obj.label || obj.key || obj.name || "").replace(/^./, (c) => c.toUpperCase()), propertyCount: obj.properties.length, properties: obj.properties }))
              .sort((a, b) => {
                const ai = priorityOrder.indexOf(a.key.toLowerCase());
                const bi = priorityOrder.indexOf(b.key.toLowerCase());
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
              });
            if (available.length > 0) {
              setActiveHubSpotSetup((prev) => ({ ...prev, step: "picking_objects", schema, availableObjects: available, selectedObjects: new Set(available.map((o) => o.key)) }));
              // Persist schema for Phase 2 integration card dropdowns
              setHubspotSchema({ availableObjects: available });
              setHubspotIntegrationId(hsInt.id);
            } else {
              // No objects with properties — skip enrichment
              setActiveHubSpotSetup(null);
              sendMessageRef.current?.("I connected HubSpot.", { hidden: true });
            }
          } catch (err) {
            console.error("HubSpot schema discovery error:", err);
            setActiveHubSpotSetup((prev) => ({ ...prev, step: "error", error: err.message }));
            sendMessageRef.current?.("I connected HubSpot.", { hidden: true });
          }
        } else {
          setAutoContinueProvider("HubSpot");
        }
      } catch (err) {
        console.error("Failed to set up HubSpot:", err);
        setAutoContinueProvider("HubSpot");
      }
    } else if (provider === "Notion") {
      try {
        const integrations = await getIntegrations();
        const notionInt = integrations.find((i) => i.type === "notion" && i.status === "active");
        if (notionInt) {
          setNotionIntegrationId(notionInt.id);
          // Bug 10: Show loading state while fetching databases
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Which Notion database has your feature requests?" },
          ]);
          setActiveDbPicker({ purpose: "feature_requests", databases: [], loading: true });
          const dbData = await getNotionDatabases(notionInt.id);
          const dbs = dbData.databases || [];
          if (dbs.length > 0) {
            setActiveDbPicker({ purpose: "feature_requests", databases: dbs, loading: false });
          } else {
            setActiveDbPicker(null);
            sendMessageRef.current?.("No data to import from Notion.", { hidden: true });
          }
        }
      } catch (err) {
        console.error("Failed to fetch Notion databases:", err);
        setActiveDbPicker(null);
        setAutoContinueProvider("Notion");
      }
    }
  }

  /* ---------- Connect integration from chat ---------- */
  async function handleConnectIntegration(tool) {
    // Bug 8: Allow re-handling this provider via BroadcastChannel if reconnecting
    oauthHandledProviders.current.delete(tool);
    setConnectingIntegration(tool);
    try {
      // Check if already connected — skip OAuth and go straight to import
      const integrations = await getIntegrations();
      const typeMap = { HubSpot: "hubspot", Linear: "linear", Notion: "notion" };
      const existing = integrations.find((i) => i.type === typeMap[tool] && i.status === "active");

      if (existing) {
        // Already connected — mark it, show success, and start import flow directly
        setConnectedIntegrations((prev) => new Set([...prev, tool]));
        setQuickReplies(null);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `${tool} connected successfully!` },
        ]);
        await startImportFlow(tool);
      } else {
        // Not connected — open OAuth
        let data;
        if (tool === "HubSpot") data = await getHubSpotAuthUrl({ from: "onboarding" });
        else if (tool === "Linear") data = await getLinearAuthUrl({ from: "onboarding" });
        else if (tool === "Notion") data = await getNotionAuthUrl({ from: "onboarding" });
        if (data?.url) window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Connect integration error:", err);
      // Bug 13: Show error feedback in chat instead of silently swallowing
      setMessages((prev) => [...prev, { role: "assistant", content: `Failed to connect ${tool}. Please try again.` }]);
    } finally {
      setConnectingIntegration(null);
    }
  }

  /* ---------- Send message (SSE streaming) ---------- */
  const sendMessage = useCallback(async (text, { hidden = false } = {}) => {
    if (!text.trim() || streaming) return;

    // Clear any visible quick replies
    if (quickReplies) {
      setQuickReplies(null);
      setRepliesFadingOut(false);
    }

    const userMsg = { role: "user", content: text.trim(), ...(hidden ? { hidden: true } : {}) };
    // Use functional update to avoid stale closure — ensures action messages and concurrent updates aren't lost
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamingText("");

    try {
      // Build API messages from ref (always current) + new user message
      const allMessages = [...messagesRef.current, userMsg];
      const apiMessages = allMessages.filter((m) => m.type !== "action").map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        console.error("Onboarding chat HTTP error:", res.status, errText);
        throw new Error(`Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let toolPayload = null;
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr.trim()) continue;

          try {
            const event = JSON.parse(jsonStr);
            switch (event.type) {
              case "token":
                fullText += event.text;
                setStreamingText(fullText);
                break;
              case "tool_use":
                if (event.tool?.name === "propose_workspace_setup") {
                  toolPayload = event.tool.input;
                }
                break;
              case "done":
                streamDone = true;
                break;
              case "error":
                fullText += `\n\nSorry, something went wrong. Please try again.`;
                setStreamingText(fullText);
                streamDone = true;
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Parse HubSpot field proposals from AI response (declared outside if-block so enrichment-completion check can access it)
      const proposedFields = [];

      // Add assistant message to history
      if (fullText) {
        // Parse bot-controlled chips: <<chips:Option1,Option2,Option3>>
        const chipsMatch = fullText.match(/<<chips:(.+?)>>/);

        const hubspotFieldRegex = /<<hubspot_field:(\{.+?\})>>/g;
        let hsMatch;
        while ((hsMatch = hubspotFieldRegex.exec(fullText)) !== null) {
          try {
            proposedFields.push(JSON.parse(hsMatch[1]));
          } catch {}
        }

        // Strip both chip and hubspot_field tags from display text
        const displayText = fullText
          .replace(/\s*<<chips:.+?>>\s*/g, "")
          .replace(/\s*<<hubspot_field:\{.+?\}>>\s*/g, "")
          .trim();

        // If we got proposed fields, store them for user review before confirming
        if (proposedFields.length > 0) {
          setHubspotProposedFields(proposedFields.map((f) => ({
            name: f.name,
            field_type: f.field_type || "number",
            options: f.options || [],
            description: f.description || "",
            hubspot_object: f.hubspot_object,
            hubspot_property: f.hubspot_property,
            aggregation: f.aggregation,
          })));
        }

        // Check if AI is suggesting to connect an integration
        const connectMatch = displayText.match(/connect.*(hubspot|linear|notion)/i) || displayText.match(/(hubspot|linear|notion).*connect/i);
        const suggestedConnect = connectMatch ? connectMatch[1].charAt(0).toUpperCase() + connectMatch[1].slice(1).toLowerCase() : null;
        let connectTool = suggestedConnect === "Hubspot" ? "HubSpot" : suggestedConnect;
        if (connectTool && connectedIntegrations.has(connectTool)) connectTool = null;

        setMessages((prev) => [...prev, {
          role: "assistant",
          content: displayText,
          ...(connectTool ? { connectIntegration: connectTool } : {}),
        }]);

        // Show chips only if the bot explicitly requested them
        if (!toolPayload && chipsMatch) {
          const chipOptions = chipsMatch[1].split(",").map((c) => c.trim()).filter(Boolean);
          // Don't filter out connected integrations — user may use the same tool for multiple purposes
          // (e.g. Notion for feature requests AND as a CRM)
          if (chipOptions.length > 0) {
            setQuickReplies({ type: "standard", options: [...chipOptions, "Other"] });
          } else {
            setQuickReplies(null);
          }
        } else if (!toolPayload) {
          setQuickReplies(null);
        }
      }

      // Detect HubSpot enrichment completion from bot's conversational response (Bug 2: expanded detection phrases)
      // Skip if the AI just proposed fields in this same response — user hasn't confirmed yet
      if (fullText && activeHubSpotSetup?.step === "conversing" && proposedFields.length === 0) {
        const lowerFull = fullText.toLowerCase();
        if (
          lowerFull.includes("all set") ||
          lowerFull.includes("all done") ||
          lowerFull.includes("configured") ||
          lowerFull.includes("enrichment is ready") ||
          lowerFull.includes("enrichment is set") ||
          lowerFull.includes("you're good") ||
          lowerFull.includes("complete") ||
          lowerFull.includes("set up") ||
          lowerFull.includes("good to go") ||
          lowerFull.includes("ready to go") ||
          lowerFull.includes("finished") ||
          lowerFull.includes("that's everything") ||
          lowerFull.includes("we're done")
        ) {
          // Delay slightly to let messages state update
          setTimeout(() => finalizeHubSpotEnrichment(), 300);
        }
      }

      // If AI proposed a setup, show loading state then transition to configure phase
      if (toolPayload) {
        setBuildingWorkspace(true);
        setQuickReplies(null);
        if (toolPayload.statuses?.length > 0) {
          setStatuses(toolPayload.statuses);
        }
        setCustomFields((prev) => {
          // Preserve HubSpot-sourced fields that were already confirmed
          const hsFields = prev.filter((f) => f.source === "hubspot");
          const hsNames = new Set(hsFields.map((f) => f.name.toLowerCase()));
          // Add AI-proposed fields, skipping any that duplicate a HubSpot field name
          const aiFields = (toolPayload.custom_fields || [])
            .filter((f) => !hsNames.has(f.name.toLowerCase()))
            .map((f) => ({ ...f, options: f.options || [] }));
          return [...hsFields, ...aiFields];
        });
        if (toolPayload.onboarding_data) {
          setOnboardingData(toolPayload.onboarding_data);
        }
        // Pre-populate integration tabs from connected integrations
        const tabs = [];
        if (connectedIntegrations.has("Linear")) {
          tabs.push({ key: "linear", label: "Linear", provider: "linear" });
        }
        if (connectedIntegrations.has("Notion")) {
          tabs.push({ key: "notion", label: "Notion", provider: "notion" });
        }
        if (connectedIntegrations.has("HubSpot")) {
          tabs.push({ key: "hubspot", label: "HubSpot", provider: "hubspot" });
        }
        setIntegrationTabs(tabs);
        // Show loading for 2s so user sees progress, then transition
        setTimeout(() => {
          setBuildingWorkspace(false);
          setPhase(2);
        }, 2000);
      }
    } catch (err) {
      console.error("Onboarding chat error:", err?.message || err, err?.stack);
      const debugInfo = ` (${err?.message || "unknown error"})`;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry, something went wrong. Please try again or skip to manual setup.${debugInfo}` },
      ]);
    } finally {
      setStreaming(false);
      setStreamingText("");
    }
  }, [streaming, connectedIntegrations]);

  // Keep ref updated so BroadcastChannel handler can call latest sendMessage
  sendMessageRef.current = sendMessage;

  /* ---------- Auto-continue after non-Notion tool connection ---------- */
  useEffect(() => {
    if (autoContinueProvider && !streaming && !autoContinueFired.current) {
      autoContinueFired.current = true; // StrictMode guard
      const provider = autoContinueProvider;
      setAutoContinueProvider(null);
      sendMessage(`I connected ${provider}.`, { hidden: true });
    }
    // Reset the guard when provider is consumed
    if (!autoContinueProvider) {
      autoContinueFired.current = false;
    }
  }, [autoContinueProvider, streaming, sendMessage]);

  /* ---------- Skip link — compute next topic to skip to ---------- */
  function getSkipTarget() {
    const TOPICS = [
      { key: "roadmap_tool", topicLabel: "a roadmap tool", donePatterns: ["roadmap tool:", "roadmap:", "imported", "no data to import"], skipLabel: "feature requests" },
      { key: "feature_requests", topicLabel: "feature requests", donePatterns: ["imported", "i'll import", "no data to import", "feature request"], skipLabel: "CRM" },
      { key: "crm", topicLabel: "CRM", donePatterns: ["enrichment configured", "i'll set up hubspot", "hubspot enrichment", "crm:"], skipLabel: "dev tools" },
      { key: "dev_tasks", topicLabel: "dev tools", donePatterns: ["imported", "i'll import linear", "dev tasks:"], skipLabel: "priorities" },
      { key: "prioritization", topicLabel: "priorities", donePatterns: ["prioriti"], skipLabel: null },
    ];
    const allText = messages.map((m) => (m.content || "").toLowerCase()).join(" ");
    for (const topic of TOPICS) {
      const covered = topic.donePatterns.some((p) => allText.includes(p));
      if (!covered && topic.skipLabel) return { currentTopic: topic.topicLabel, skipLabel: topic.skipLabel };
    }
    return null;
  }

  // Bug 6: Memoize skipTarget to avoid calling getSkipTarget() on every keystroke
  const skipTarget = useMemo(() => getSkipTarget(), [messages]);

  function handleSkipToTopic() {
    if (!skipTarget) return;
    // Clear any active inline UIs
    setActiveHubSpotSetup(null);
    setActiveLinearImport(null);
    setActiveDbPicker(null);
    setActiveNotionImport(null);
    // Bug 5: Use current topic label instead of hardcoded "CRM"
    sendMessage(`Skip ${skipTarget.currentTopic} setup, move to ${skipTarget.skipLabel}.`, { hidden: true });
  }

  /* ---------- Input handlers ---------- */
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  /* ---------- Skip to configure with defaults ---------- */
  function handleSkipToSetup() {
    setStatuses(DEFAULT_STATUSES);
    setCustomFields(DEFAULT_CUSTOM_FIELDS);
    setOnboardingData({});
    setPhase(2);
  }

  /* ---------- Configure phase handlers ---------- */
  function updateStatus(index, field, value) {
    setStatuses((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function removeStatus(index) {
    setStatuses((prev) => prev.filter((_, i) => i !== index));
  }

  function addStatus() {
    setStatuses((prev) => [...prev, { name: "", color: "#A0AEC0" }]);
  }

  function toggleBuiltinFieldVisible(index) {
    setBuiltinFields((prev) => prev.map((f, i) => (i === index ? { ...f, visible: !f.visible } : f)));
  }

  function toggleFieldVisible(index) {
    setCustomFields((prev) => prev.map((f, i) => (i === index ? { ...f, visible: !f.visible } : f)));
  }

  function removeField(index) {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }

  function addField() {
    setCustomFields((prev) => [
      ...prev,
      { name: "", field_type: "text", options: [], description: "", visible: true },
    ]);
  }

  function updateField(index, field, value) {
    setCustomFields((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  /* ---------- Section handlers ---------- */
  function addSection() {
    setSections((prev) => [...prev, { name: "", fields: [] }]);
  }

  function updateSectionName(sectionIdx, name) {
    setSections((prev) => prev.map((s, i) => (i === sectionIdx ? { ...s, name } : s)));
  }

  function removeSection(sectionIdx) {
    setSections((prev) => prev.filter((_, i) => i !== sectionIdx));
  }

  function addSectionField(sectionIdx) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? { ...s, fields: [...s.fields, { name: "", field_type: "text", options: [], description: "", visible: true }] }
          : s
      )
    );
  }

  function updateSectionField(sectionIdx, fieldIdx, field, value) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? { ...s, fields: s.fields.map((f, j) => (j === fieldIdx ? { ...f, [field]: value } : f)) }
          : s
      )
    );
  }

  function removeSectionField(sectionIdx, fieldIdx) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx ? { ...s, fields: s.fields.filter((_, j) => j !== fieldIdx) } : s
      )
    );
  }

  function toggleSectionFieldVisible(sectionIdx, fieldIdx) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? { ...s, fields: s.fields.map((f, j) => (j === fieldIdx ? { ...f, visible: !f.visible } : f)) }
          : s
      )
    );
  }

  /* ---------- Collapsible sections ---------- */
  function toggleCollapse(sectionKey) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }

  /* ---------- Integration tab handlers ---------- */
  const HUBSPOT_OBJECT_TYPES = [
    { key: "deals", label: "Deals" },
    { key: "tickets", label: "Tickets" },
    { key: "companies", label: "Companies" },
    { key: "contacts", label: "Contacts" },
  ];

  /* ---------- Integration summary card handlers (Phase 2) ---------- */
  function toggleIntegrationCard(provider) {
    setExpandedIntegrationCards((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  function toggleHubSpotRecordType(key) {
    setHubspotRecordTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addEnrichmentField() {
    setCustomFields((prev) => [
      ...prev,
      { name: "", field_type: "number", options: [], description: "", visible: true, source: "hubspot", source_property: "", hubspot_object: "", aggregation: "sum" },
    ]);
    // Open edit mode on the new field (it will be the last hubspot field)
    const hsCount = customFields.filter((f) => f.source === "hubspot").length;
    setEditingEnrichmentField(hsCount);
  }

  function removeEnrichmentField(globalIndex) {
    setCustomFields((prev) => prev.filter((_, i) => i !== globalIndex));
    setEditingEnrichmentField(null);
  }

  function updateEnrichmentField(globalIndex, updates) {
    setCustomFields((prev) => prev.map((f, i) => (i === globalIndex ? { ...f, ...updates } : f)));
  }

  function startEditEnrichmentField(hsIndex) {
    setEditingEnrichmentField(editingEnrichmentField === hsIndex ? null : hsIndex);
  }

  async function handleDisconnectHubSpot() {
    if (!hubspotIntegrationId) return;
    try {
      await disconnectIntegration(hubspotIntegrationId);
      // Clean up all HubSpot state
      setConnectedIntegrations((prev) => {
        const next = new Set(prev);
        next.delete("HubSpot");
        return next;
      });
      setCustomFields((prev) => prev.filter((f) => f.source !== "hubspot"));
      setHubspotSchema(null);
      setHubspotIntegrationId(null);
      setHubspotRecordTypes(new Set(["companies", "deals"]));
      setHubspotRecordMatching("manual");
      setHubspotAutoMatchFields({ hubspotProperty: "", roadwayField: "" });
      setExpandedIntegrationCards((prev) => {
        const next = new Set(prev);
        next.delete("HubSpot");
        return next;
      });
      setEditingEnrichmentField(null);
    } catch (err) {
      console.error("Disconnect HubSpot error:", err);
    }
  }


  /* ---------- Phase 2: Resizable divider drag ---------- */
  function handleEditorChatDrag(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startSplit = editorChatSplit;

    function onMove(ev) {
      const container = document.querySelector(".ob-editors-with-chat");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const delta = ev.clientY - startY;
      const deltaPercent = (delta / rect.height) * 100;
      setEditorChatSplit(Math.min(85, Math.max(25, startSplit + deltaPercent)));
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  /* ---------- Phase 2: Config AI chat ---------- */
  async function sendConfigMessage(text) {
    if (!text?.trim() || configStreaming) return;
    const userMsg = { role: "user", content: text.trim() };
    setConfigMessages((prev) => [...prev, userMsg]);
    setConfigInput("");
    setConfigStreaming(true);
    setConfigStreamingText("");

    try {
      const allMsgs = [...configMessages, userMsg];
      const configContext = {
        statuses: statuses.map((s) => s.name),
        customFields: customFields.map((f) => ({ name: f.name, type: f.field_type })),
        sections: sections.map((s) => ({ name: s.name, fields: s.fields.map((f) => f.name) })),
      };

      const response = await fetch("/api/onboarding/configure-chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          messages: allMsgs.map(({ role, content }) => ({ role, content })),
          config: configContext,
        }),
      });

      if (!response.ok) throw new Error("Config chat failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token") {
              fullText += data.text;
              setConfigStreamingText(fullText);
            } else if (data.type === "error") {
              fullText = "Sorry, I ran into an issue. Try again?";
            }
          } catch {}
        }
      }

      setConfigMessages((prev) => [...prev, { role: "assistant", content: fullText || "Done!" }]);
    } catch (err) {
      console.error("Config chat error:", err);
      setConfigMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Try again?" }]);
    } finally {
      setConfigStreaming(false);
      setConfigStreamingText("");
    }
  }

  // Auto-scroll config chat
  useEffect(() => {
    configEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [configMessages, configStreamingText]);

  /* ---------- Submit onboarding ---------- */
  async function handleFinishSetup() {
    if (submitting) return;
    setSubmitting(true);
    setPhase(3);

    try {
      // Build status arrays for workspace_settings
      const statusNames = statuses.filter((s) => s.name.trim()).map((s) => s.name.trim());
      const statusColorMap = {};
      statuses.forEach((s) => { if (s.name.trim()) statusColorMap[s.name.trim()] = s.color; });

      // Build custom fields for persistence (exclude hubspot fields with no name)
      const fieldsToSave = customFields
        .filter((f) => f.name && f.name.trim())
        .map((f) => ({
          name: f.name.trim(),
          field_type: f.field_type,
          options: f.options || [],
          source: f.source || "manual",
          source_property: f.source_property || null,
        }));

      // Build drawer_field_order from current field arrangement
      const fieldOrder = [
        ...builtinFields.map((f) => f.name),
        ...customFields.filter((f) => f.name?.trim()).map((f) => f.name.trim()),
      ];

      // Build drawer_hidden_fields from visibility toggles
      const hiddenFields = [
        ...builtinFields.filter((f) => !f.visible).map((f) => f.name),
        ...customFields.filter((f) => !f.visible && f.name?.trim()).map((f) => f.name.trim()),
      ];

      const payload = {
        current_roadmap_tool: onboardingData.current_roadmap_tool || null,
        tracks_feature_requests: onboardingData.tracks_feature_requests || null,
        crm: onboardingData.crm || null,
        dev_task_tool: onboardingData.dev_task_tool || null,
        // Workspace config
        custom_statuses: statusNames,
        status_colors: statusColorMap,
        custom_fields: fieldsToSave,
        drawer_field_order: fieldOrder,
        drawer_hidden_fields: hiddenFields,
        onboarding_data: onboardingData,
      };

      const data = await submitOnboarding(payload);

      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const updatedUser = {
        ...user,
        ...data.user,
        onboarding_completed: true,
        lastRoadmapId: data.user.last_roadmap_id || user.lastRoadmapId,
      };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
    } catch (err) {
      console.error("Onboarding submit error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoToRoadmap() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const roadmapId = user.lastRoadmapId || user.last_roadmap_id;
    navigate(roadmapId ? `/roadmap/${roadmapId}` : "/roadmaps", { replace: true });
  }

  /* ---------- Progress bar ---------- */
  const phases = ["Welcome", "Chat", "Configure", "Ready"];
  function dotClass(dotPhase) {
    if (dotPhase < phase) return "onboarding-step-dot completed";
    if (dotPhase === phase) return "onboarding-step-dot active";
    return "onboarding-step-dot upcoming";
  }
  function lineClass(lineAfter) {
    return lineAfter < phase ? "onboarding-step-line completed" : "onboarding-step-line";
  }

  /* ============================================================
     Render
     ============================================================ */
  return (
    <div className="onboarding-page">
      {/* Progress dots */}
      <div className="onboarding-progress">
        {phases.map((_, i) => (
          <React.Fragment key={i}>
            <div className={dotClass(i)}>
              {i < phase ? <Check size={16} /> : i + 1}
            </div>
            {i < phases.length - 1 && <div className={lineClass(i)} />}
          </React.Fragment>
        ))}
      </div>

      {/* ---- Phase 0: Welcome ---- */}
      {phase === 0 && (
        <div className="onboarding-card ob-welcome">
          <div className="ob-welcome-icon">
            <Sparkles size={32} />
          </div>
          <h1>Welcome to Roadway</h1>
          <p className="ob-welcome-subtitle">
            A quick chat to personalize your workspace
          </p>
          <button className="btn btn-primary btn-full" onClick={() => setPhase(1)}>
            Let's get started
          </button>
          <button className="onboarding-skip" onClick={handleSkipToSetup}>
            Set up manually
          </button>
        </div>
      )}

      {/* ---- Phase 1: AI Chat ---- */}
      {phase === 1 && (<>
        <div className="onboarding-card ob-container-medium">
          <div className="ob-chat-header-row">
            <button className="onboarding-back-btn" onClick={() => setPhase(0)}>
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="ob-time-badge">
              <Sparkles size={12} />
              <span>~3 min</span>
            </div>
            {!streaming && !buildingWorkspace && skipTarget && messages.length > 2 && (
              <button className="ob-next-question-btn" onClick={handleSkipToTopic}>
                Next question &rarr;
              </button>
            )}
          </div>

          <div className="ob-chat">
            <div className="ob-chat-messages">
              {messages.map((msg, i) => {
                // Hide action messages once the AI has responded after them
                if (msg.type === "action" && !msg.hidden) {
                  const hasFollowingAssistant = messages.slice(i + 1).some((m) => m.role === "assistant" && !m.hidden);
                  if (hasFollowingAssistant) return null;
                }
                return msg.hidden ? null : (
                <React.Fragment key={i}>
                  <div className={`ob-chat-message ${msg.type === "action" ? "user-action" : msg.role}`}>
                    {msg.role === "assistant" && msg.type !== "action" && (
                      <div className="ob-chat-avatar">
                        <Sparkles size={12} />
                      </div>
                    )}
                    <div className="ob-chat-bubble">
                      {msg.type === "action" && <Check size={14} />}
                      {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                    </div>
                  </div>
                  {/* Connect integration button */}
                  {msg.connectIntegration && !connectedIntegrations.has(msg.connectIntegration) && (
                    <div className="ob-chat-connect">
                      <button
                        className="ob-chat-connect-btn"
                        onClick={() => handleConnectIntegration(msg.connectIntegration)}
                        disabled={connectingIntegration === msg.connectIntegration}
                      >
                        {connectingIntegration === msg.connectIntegration
                          ? "Connecting..."
                          : `Connect ${msg.connectIntegration}`}
                      </button>
                    </div>
                  )}
                </React.Fragment>
                );
              })}

              {/* Database picker — standalone, not in messages */}
              {activeDbPicker && !streaming && (
                <div className="ob-chat-db-picker">
                  <div className="ob-db-picker-label">
                    <Database size={14} />
                    Select a database
                  </div>
                  {activeDbPicker.loading ? (
                    <div className="ob-chat-import-status">
                      <Loader size={14} className="cd-spinning" />
                      Loading Notion databases...
                    </div>
                  ) : (
                    <div className="ob-db-picker-list">
                      {activeDbPicker.databases.map((db) => (
                        <button
                          key={db.id}
                          className="ob-db-picker-item"
                          onClick={() => handleDbSelected(db, activeDbPicker.purpose)}
                        >
                          {db.icon && <span className="ob-db-icon">{db.icon}</span>}
                          <span className="ob-db-title">{db.title}</span>
                          <ChevronDown size={14} className="ob-db-arrow" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Notion auto-import progress */}
              {activeNotionImport && (
                <div className="ob-chat-import-panel">
                  {activeNotionImport.step === "importing" && (
                    <div className="ob-chat-import-status">
                      <Loader size={14} className="cd-spinning" />
                      Importing from Notion...
                    </div>
                  )}
                  {activeNotionImport.step === "done" && (
                    <div className="ob-chat-import-result">
                      <Check size={14} />
                      {activeNotionImport.result?.count > 0
                        ? `Imported ${activeNotionImport.result.count} cards from Notion`
                        : "No items found in this database"}
                    </div>
                  )}
                  {activeNotionImport.step === "error" && (
                    <div className="ob-chat-import-error">
                      Import failed: {activeNotionImport.error}
                    </div>
                  )}
                </div>
              )}

              {/* Linear inline import picker */}
              {activeLinearImport && !activeLinearImport.result && !streaming && (
                <div className="ob-chat-import-panel">
                  {activeLinearImport.loading ? (
                    <div className="ob-chat-import-status">
                      <Loader size={14} className="cd-spinning" />
                      Loading Linear projects...
                    </div>
                  ) : activeLinearImport.error && !activeLinearImport.importing ? (
                    <div className="ob-chat-import-error">
                      {activeLinearImport.error}
                      <div className="ob-import-actions">
                        <button className="ob-import-skip" onClick={handleLinearSkip}>Skip for now</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="ob-import-select-all">
                        <label className="ob-import-project-item">
                          <input
                            type="checkbox"
                            ref={(el) => { if (el) el.indeterminate = activeLinearImport.selectedProjects.size > 0 && activeLinearImport.selectedProjects.size < activeLinearImport.projects.length; }}
                            checked={activeLinearImport.selectedProjects.size === activeLinearImport.projects.length && activeLinearImport.projects.length > 0}
                            onChange={toggleLinearSelectAll}
                          />
                          <span className="ob-import-project-name">Select all</span>
                          <span className="ob-import-project-meta">{activeLinearImport.projects.length} projects</span>
                        </label>
                      </div>
                      <div className="ob-import-project-list">
                        {activeLinearImport.projects.map((proj) => (
                          <label key={proj.id} className={`ob-import-project-item${activeLinearImport.selectedProjects.has(proj.id) ? " selected" : ""}`}>
                            <input
                              type="checkbox"
                              checked={activeLinearImport.selectedProjects.has(proj.id)}
                              onChange={() => toggleLinearProject(proj.id)}
                            />
                            <span className="ob-import-project-name">{proj.name}</span>
                            {proj.issue_count != null && <span className="ob-import-project-meta">{proj.issue_count} issues</span>}
                          </label>
                        ))}
                      </div>
                      <div className="ob-import-actions">
                        <button
                          className="ob-import-btn"
                          onClick={handleLinearImport}
                          disabled={activeLinearImport.selectedProjects.size === 0 || activeLinearImport.importing}
                        >
                          {activeLinearImport.importing
                            ? "Importing..."
                            : `Import ${activeLinearImport.selectedProjects.size} project${activeLinearImport.selectedProjects.size !== 1 ? "s" : ""}`}
                        </button>
                        <button className="ob-import-skip" onClick={handleLinearSkip}>I'll do it later</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Linear import result */}
              {activeLinearImport?.result && (
                <div className="ob-chat-import-panel">
                  <div className="ob-chat-import-result">
                    <Check size={14} />
                    {activeLinearImport.result.count > 0
                      ? `Imported ${activeLinearImport.result.count} cards from Linear`
                      : "No items found in selected projects"}
                  </div>
                </div>
              )}

              {/* HubSpot enrichment — schema discovery, object picker, done (Bug 9: skip "conversing" step) */}
              {activeHubSpotSetup && activeHubSpotSetup.step !== "conversing" && (
                <div className="ob-chat-import-panel">
                  {activeHubSpotSetup.step === "discovering" && (
                    <div className="ob-chat-import-status">
                      <Loader size={14} className="cd-spinning" />
                      Analyzing your HubSpot account...
                    </div>
                  )}
                  {activeHubSpotSetup.step === "picking_objects" && !streaming && (
                    <>
                      <div className="ob-import-select-all">
                        <label className="ob-import-project-item">
                          <input
                            type="checkbox"
                            ref={(el) => { if (el) el.indeterminate = activeHubSpotSetup.selectedObjects.size > 0 && activeHubSpotSetup.selectedObjects.size < activeHubSpotSetup.availableObjects.length; }}
                            checked={activeHubSpotSetup.selectedObjects.size === activeHubSpotSetup.availableObjects.length && activeHubSpotSetup.availableObjects.length > 0}
                            onChange={toggleHubSpotSelectAll}
                          />
                          <span className="ob-import-project-name">Select all</span>
                          <span className="ob-import-project-meta">{activeHubSpotSetup.availableObjects.length} object types</span>
                        </label>
                      </div>
                      <div className="ob-import-project-list">
                        {activeHubSpotSetup.availableObjects.map((obj) => (
                          <label key={obj.key} className={`ob-import-project-item${activeHubSpotSetup.selectedObjects.has(obj.key) ? " selected" : ""}`}>
                            <input
                              type="checkbox"
                              checked={activeHubSpotSetup.selectedObjects.has(obj.key)}
                              onChange={() => toggleHubSpotObject(obj.key)}
                            />
                            <span className="ob-import-project-name">{obj.label}</span>
                            <span className="ob-import-project-meta">{obj.propertyCount} properties</span>
                          </label>
                        ))}
                      </div>
                      <div className="ob-import-actions">
                        <button
                          className="ob-import-btn"
                          onClick={handleHubSpotObjectsSelected}
                          disabled={activeHubSpotSetup.selectedObjects.size === 0}
                        >
                          Continue with {activeHubSpotSetup.selectedObjects.size} object{activeHubSpotSetup.selectedObjects.size !== 1 ? "s" : ""}
                        </button>
                        <button className="ob-import-skip" onClick={handleHubSpotSkip}>I'll set this up later</button>
                      </div>
                    </>
                  )}
                  {activeHubSpotSetup.step === "error" && (
                    <div className="ob-chat-import-error">
                      Enrichment setup failed: {activeHubSpotSetup.error}
                    </div>
                  )}
                </div>
              )}

              {/* HubSpot proposed fields — inline review card */}
              {hubspotProposedFields.length > 0 && !streaming && (
                <div className="ob-chat-import-panel">
                  <div className="ob-hs-proposal-list">
                    {hubspotProposedFields.map((f, i) => (
                      <div key={i} className="ob-hs-proposal-row">
                        <div className="ob-hs-proposal-name">{f.name}</div>
                        <div className="ob-hs-proposal-detail">
                          <span className="ob-hs-proposal-object">
                            {f.hubspot_object.charAt(0).toUpperCase() + f.hubspot_object.slice(1)}
                          </span>
                          <span className="ob-hs-proposal-sep">&rsaquo;</span>
                          <span className="ob-hs-proposal-prop">{f.hubspot_property}</span>
                          <span className="ob-hs-proposal-agg">{f.aggregation}</span>
                        </div>
                        <button
                          className="ob-hs-proposal-remove"
                          onClick={() => removeHubSpotProposedField(i)}
                          title="Remove"
                        >&times;</button>
                      </div>
                    ))}
                  </div>
                  <div className="ob-import-actions">
                    <button className="ob-import-btn" onClick={confirmHubSpotProposedFields}>
                      Looks good
                    </button>
                    <button className="ob-import-skip" onClick={handleHubSpotSkip}>
                      Skip for now
                    </button>
                  </div>
                </div>
              )}

              {/* Streaming indicator */}
              {streaming && !buildingWorkspace && (
                <div className="ob-chat-message assistant">
                  <div className="ob-chat-avatar">
                    <Sparkles size={12} />
                  </div>
                  <div className="ob-chat-bubble">
                    {streamingText ? renderMarkdown(streamingText) : (
                      <span className="ob-chat-typing">
                        <Loader size={14} className="cd-spinning" />
                        Thinking...
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Building workspace loader */}
              {buildingWorkspace && (
                <div className="ob-building-workspace">
                  <Loader size={20} className="cd-spinning" />
                  <span>Building the best configuration for you...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {!buildingWorkspace && (
            <div className="ob-chat-input-area">
              {/* Quick-reply chips — above input */}
              {quickReplies && !streaming && (
                <div className={`ob-chat-replies${quickReplies.type === "hero" ? " hero" : ""}${repliesFadingOut ? " fading-out" : ""}`}>
                  {quickReplies.options.map((opt) => (
                    <button
                      key={opt}
                      className={`ob-chat-reply-chip${quickReplies.type === "hero" ? " hero" : ""}`}
                      onClick={() => handleChipClick(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <div className="ob-chat-input-wrap">
                <textarea
                  ref={textareaRef}
                  className="ob-chat-input"
                  placeholder="Type your response..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={streaming}
                />
                <button
                  className="ob-chat-send"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || streaming}
                >
                  <ArrowUp size={16} />
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
        <div className="ob-manual-setup-row">
          <button className="onboarding-skip" onClick={handleSkipToSetup}>
            Set up manually
          </button>
        </div>
      </>)}

      {/* ---- Phase 2: Configure ---- */}
      {phase === 2 && (
        <div className="onboarding-card ob-container-wide">
          <button className="onboarding-back-btn" onClick={() => setPhase(1)}>
            <ArrowLeft size={16} />
            Back to chat
          </button>

          <h2 className="ob-section-title">Configure your workspace</h2>
          <p className="ob-section-subtitle">Review and customize your setup, then finish when you're ready.</p>

          <div className="ob-configure-layout">
            {/* Left: Editors + AI Chat */}
            <div className="ob-editors-with-chat">
              {/* Top: Editors (resizable) */}
              <div className="ob-editors-area" style={{ height: `${editorChatSplit}%` }}>
                <WorkspaceEditor
                  statuses={statuses}
                  onStatusesChange={setStatuses}
                  customFields={customFields}
                  onCustomFieldsChange={setCustomFields}
                  builtinFields={builtinFields}
                  onBuiltinFieldsChange={setBuiltinFields}
                  connectedIntegrations={connectedIntegrations}
                  onIntegrationsChange={setConnectedIntegrations}
                  hubspotSchema={hubspotSchema}
                  hubspotIntegrationId={hubspotIntegrationId}
                  mode="onboarding"
                />
              </div>

              {/* Drag divider */}
              <div className="ob-editor-divider" onMouseDown={handleEditorChatDrag}>
                <div className="ob-divider-grip" />
              </div>

              {/* Bottom: AI Chat */}
              <div className="ob-config-chat" style={{ height: `${100 - editorChatSplit}%` }}>
                <div className="ob-config-chat-header">
                  <Sparkles size={14} />
                  <span>AI Assistant</span>
                </div>
                <div className="ob-config-chat-messages">
                  {configMessages.map((msg, i) => (
                    <div key={i} className={`ob-config-msg ${msg.role}`}>
                      {msg.role === "assistant" && renderMarkdown(msg.content)}
                      {msg.role === "user" && msg.content}
                    </div>
                  ))}
                  {configStreaming && configStreamingText && (
                    <div className="ob-config-msg assistant">{renderMarkdown(configStreamingText)}</div>
                  )}
                  <div ref={configEndRef} />
                </div>
                <div className="ob-config-chat-input-area">
                  <input
                    ref={configInputRef}
                    type="text"
                    className="ob-config-chat-input"
                    value={configInput}
                    onChange={(e) => setConfigInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendConfigMessage(configInput)}
                    placeholder="Ask AI to modify your setup..."
                    disabled={configStreaming}
                  />
                  <button
                    className="ob-config-chat-send"
                    onClick={() => sendConfigMessage(configInput)}
                    disabled={!configInput.trim() || configStreaming}
                  >
                    <ArrowUp size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Mock Drawer Preview */}
            <DrawerPreview
              statuses={statuses}
              customFields={customFields}
              builtinFields={builtinFields}
              connectedIntegrations={connectedIntegrations}
              hubspotRecordTypes={hubspotRecordTypes}
              sections={sections}
            />
          </div>

          <div className="ob-forward-actions">
            <button
              className="btn btn-primary"
              onClick={handleFinishSetup}
              disabled={submitting}
            >
              {submitting ? "Setting up..." : "Finish setup"}
            </button>
          </div>
        </div>
      )}

      {/* ---- Phase 3: Landing ---- */}
      {phase === 3 && (
        <div className="onboarding-card ob-landing">
          <div className="ob-landing-icon">
            <Check size={32} />
          </div>
          <h1>You're all set!</h1>
          <p className="ob-landing-subtitle">
            Your workspace is ready. Start building your roadmap.
          </p>
          <button className="btn btn-primary btn-full" onClick={handleGoToRoadmap} disabled={submitting}>
            Go to my roadmap
          </button>
        </div>
      )}
    </div>
  );
}
