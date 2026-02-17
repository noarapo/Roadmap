import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  Plus,
  Clock,
  MoreHorizontal,
  GripVertical,
  User,
  X,
  Pencil,
  MessageCircle,
  MessageCircleOff,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Inbox,
} from "lucide-react";
import SidePanel from "../components/SidePanel";
import VersionHistoryPanel from "../components/VersionHistoryPanel";
import CommentLayer from "../components/CommentLayer";
import {
  getRoadmap,
  updateProfile,
  mapRoadmapFromApi,
  mapCardFromApi,
  mapCardToApi,
  mapRowFromApi,
  mapSprintFromApi,
  createCard as apiCreateCard,
  updateCard as apiUpdateCard,
  moveCard as apiMoveCard,
  createRoadmapRow as apiCreateRow,
  deleteRoadmapRow as apiDeleteRow,
  updateRoadmapRow as apiUpdateRow,
  updateRoadmap as apiUpdateRoadmap,
  updateSprint as apiUpdateSprint,
  createSprint as apiCreateSprint,
  deleteSprint as apiDeleteSprint,
  deleteCard as apiDeleteCard,
  reorderRoadmapRows as apiReorderRows,
} from "../services/api";

/* ==================================================================
   HELPERS
   ================================================================== */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MIN_COL_WIDTH = 100;
const PIXELS_PER_DAY = 8;

const TAG_COLORS = {
  MVP: { bg: "var(--teal-bg)", color: "var(--teal)" },
  API: { bg: "var(--blue-bg)", color: "var(--blue)" },
  UX: { bg: "var(--purple-bg)", color: "var(--purple)" },
  Infra: { bg: "var(--orange-bg)", color: "var(--orange)" },
  Security: { bg: "var(--red-bg)", color: "var(--red)" },
  Analytics: { bg: "var(--yellow-bg)", color: "var(--yellow)" },
  Beta: { bg: "var(--green-bg)", color: "var(--green)" },
  Mobile: { bg: "var(--purple-bg)", color: "var(--purple)" },
};

function tagStyle(tag) {
  const c = TAG_COLORS[tag];
  return c
    ? { background: c.bg, color: c.color }
    : { background: "var(--bg-secondary)", color: "var(--text-secondary)" };
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/** Compute month headers from sprint date ranges */
function buildMonthHeaders(sprints) {
  if (sprints.length === 0) return { months: [], quarters: [] };

  const monthMap = new Map(); // "2026-01" => { label, year, startIdx, endIdx }

  sprints.forEach((s, idx) => {
    const startD = new Date(s.startDate);
    const key = `${startD.getFullYear()}-${String(startD.getMonth()).padStart(2, "0")}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, {
        key,
        label: MONTH_NAMES[startD.getMonth()],
        year: startD.getFullYear(),
        month: startD.getMonth(),
        startIdx: idx,
        endIdx: idx,
      });
    } else {
      monthMap.get(key).endIdx = idx;
    }
  });

  const months = Array.from(monthMap.values());

  // Build quarters from months
  const quarterMap = new Map();
  months.forEach((m) => {
    const qNum = Math.floor(m.month / 3) + 1;
    const qKey = `Q${qNum} ${m.year}`;
    if (!quarterMap.has(qKey)) {
      quarterMap.set(qKey, { label: qKey, startIdx: m.startIdx, endIdx: m.endIdx });
    } else {
      quarterMap.get(qKey).endIdx = m.endIdx;
    }
  });

  return { months, quarters: Array.from(quarterMap.values()) };
}

/* ==================================================================
   COMPONENT
   ================================================================== */

export default function RoadmapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toggleChat, chatOpen } = useOutletContext() || {};
  const canvasRef = useRef(null);
  const gridRef = useRef(null);

  /* --- Core state --- */
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [roadmapName, setRoadmapName] = useState("");
  const [roadmapStatus, setRoadmapStatus] = useState("draft");
  const [rows, setRows] = useState([]);
  const [cards, setCards] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  /* --- Column widths (user-resizable, keyed by sprint ID) --- */
  const [colWidths, setColWidths] = useState({});
  const [rowHeaderWidth, setRowHeaderWidth] = useState(160);

  /* --- Row heights --- */
  const [rowHeights, setRowHeights] = useState({});

  /* --- Top bar inline editing --- */
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(roadmapName);
  const titleInputRef = useRef(null);

  /* --- Row more-menu --- */
  const [rowMenuId, setRowMenuId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [rowNameDraft, setRowNameDraft] = useState("");
  const rowNameInputRef = useRef(null);
  const [rowMenuPos, setRowMenuPos] = useState(null); // { top, left } for fixed dropdown
  const [rowDrag, setRowDrag] = useState(null); // { rowId, startY, currentIdx }

  /* --- Comment mode --- */
  const [commentMode, setCommentMode] = useState(false);
  const [commentsHidden, setCommentsHidden] = useState(false);

  /* --- Triage drawer --- */
  const [triageOpen, setTriageOpen] = useState(false);

  /* --- Sprint header popover --- */
  const [sprintPopoverId, setSprintPopoverId] = useState(null);
  const [sprintEditDraft, setSprintEditDraft] = useState({});


  /* --- Inline card creation --- */
  const [inlineCreate, setInlineCreate] = useState(null);
  const [inlineCreateName, setInlineCreateName] = useState("");
  const inlineInputRef = useRef(null);

  /* --- Drag & Drop state --- */
  const [dragCard, setDragCard] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragSize, setDragSize] = useState({ w: 0, h: 0 });
  const [dropTarget, setDropTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  /* --- Resize state --- */
  const [resizeCard, setResizeCard] = useState(null);
  const [resizePreview, setResizePreview] = useState(null);

  /* --- Column resize state --- */
  const [colResize, setColResize] = useState(null);

  /* --- Row resize state --- */
  const [rowResize, setRowResize] = useState(null);

  /* --- Reorder within cell --- */
  const [reorderState, setReorderState] = useState(null);


  /* ================================================================
     DERIVED DATA
     ================================================================ */

  const sprintIndex = useMemo(() => {
    const map = {};
    sprints.forEach((s, i) => { map[s.id] = i; });
    return map;
  }, [sprints]);

  const { months: MONTHS, quarters: QUARTERS } = useMemo(() => buildMonthHeaders(sprints), [sprints]);

  /** Cards with no row assigned — shown in the triage drawer */
  const triageCards = useMemo(() => cards.filter((c) => c.rowId == null), [cards]);

  /** Get the pixel width of a sprint column by index */
  const getColWidth = useCallback((colIdx) => {
    const s = sprints[colIdx];
    if (!s) return MIN_COL_WIDTH;
    if (colWidths[s.id] != null) return colWidths[s.id];
    return Math.max(MIN_COL_WIDTH, s.days * PIXELS_PER_DAY);
  }, [sprints, colWidths]);

  /** Get column left offset in pixels */
  const getColLeft = useCallback((colIdx) => {
    let left = 0;
    for (let i = 0; i < colIdx; i++) left += getColWidth(i);
    return left;
  }, [getColWidth]);

  /** Get sprint index from x position */
  const getSprintIdxFromX = useCallback((x) => {
    let acc = 0;
    for (let i = 0; i < sprints.length; i++) {
      const w = getColWidth(i);
      if (x < acc + w) return i;
      acc += w;
    }
    return sprints.length - 1;
  }, [sprints, getColWidth]);

  /** Find which sprint index a card starts in */
  const cardStartIdx = useCallback((card) => {
    if (card.startSprintId && sprintIndex[card.startSprintId] !== undefined) {
      return sprintIndex[card.startSprintId];
    }
    return card.sprintStart ?? 0;
  }, [sprintIndex]);

  /** Find which sprint index a card ends in */
  const cardEndIdx = useCallback((card) => {
    if (card.endSprintId && sprintIndex[card.endSprintId] !== undefined) {
      return sprintIndex[card.endSprintId];
    }
    const start = cardStartIdx(card);
    return start + (card.duration || 1) - 1;
  }, [sprintIndex, cardStartIdx]);

  /** Card duration in sprints */
  const cardSpan = useCallback((card) => cardEndIdx(card) - cardStartIdx(card) + 1, [cardStartIdx, cardEndIdx]);

  /* ================================================================
     LOAD DATA FROM API
     ================================================================ */

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    getRoadmap(id)
      .then((data) => {
        const mapped = mapRoadmapFromApi(data);
        setRoadmapName(mapped.name);
        setRoadmapStatus(mapped.status);
        setRows(mapped.rows.map((r) => ({ id: r.id, name: r.name, color: r.color })));
        const allCards = [];
        mapped.rows.forEach((r) => r.cards.forEach((c) => allCards.push(c)));
        mapped.unassignedCards.forEach((c) => allCards.push(c));
        setCards(allCards);
        setSprints(mapped.sprints);

        const h = {};
        mapped.rows.forEach((r) => { h[r.id] = null; });
        setRowHeights(h);

        updateProfile({ last_roadmap_id: id }).catch(() => {});
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem("user", JSON.stringify({ ...user, lastRoadmapId: id, last_roadmap_id: id }));
      })
      .catch((err) => {
        console.error("Failed to load roadmap:", err);
        setLoadError(err.status === 404 ? "not_found" : "error");
      })
      .finally(() => setLoading(false));
  }, [id]);

  /* --- Refresh roadmap data when AI actions are confirmed --- */
  useEffect(() => {
    function handleAIAction() {
      if (!id) return;
      getRoadmap(id).then((data) => {
        const mapped = mapRoadmapFromApi(data);
        setRoadmapName(mapped.name);
        setRoadmapStatus(mapped.status);
        setRows(mapped.rows.map((r) => ({ id: r.id, name: r.name, color: r.color })));
        const allCards = [];
        mapped.rows.forEach((r) => r.cards.forEach((c) => allCards.push(c)));
        mapped.unassignedCards.forEach((c) => allCards.push(c));
        setCards(allCards);
        setSprints(mapped.sprints);
      }).catch(console.error);
    }
    window.addEventListener("roadway-ai-action", handleAIAction);
    return () => window.removeEventListener("roadway-ai-action", handleAIAction);
  }, [id]);

  useEffect(() => { setTitleDraft(roadmapName); }, [roadmapName]);
  useEffect(() => { if (editingTitle && titleInputRef.current) { titleInputRef.current.focus(); titleInputRef.current.select(); } }, [editingTitle]);
  useEffect(() => { if (inlineCreate && inlineInputRef.current) inlineInputRef.current.focus(); }, [inlineCreate]);
  useEffect(() => { if (editingRowId && rowNameInputRef.current) { rowNameInputRef.current.focus(); rowNameInputRef.current.select(); } }, [editingRowId]);
  useEffect(() => {
    function handleClick(e) {
      if (!e.target.closest(".sprint-popover") && !e.target.closest(".sprint-header")) {
        setSprintPopoverId(null);
      }
      // Row menu is handled by its own backdrop overlay
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  /* --- C key to toggle comment mode --- */
  useEffect(() => {
    function handleKeyDown(e) {
      // Don't trigger when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "c" || e.key === "C") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          setCommentMode((prev) => !prev);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* --- Handlers --- */

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== roadmapName) {
      setRoadmapName(trimmed);
      apiUpdateRoadmap(id, { name: trimmed }).catch(console.error);
    } else {
      setTitleDraft(roadmapName);
    }
  }, [titleDraft, roadmapName, id]);

  const handleTitleKeyDown = useCallback((e) => {
    if (e.key === "Enter") commitTitle();
    if (e.key === "Escape") { setTitleDraft(roadmapName); setEditingTitle(false); }
  }, [commitTitle, roadmapName]);

  const toggleStatus = useCallback(() => {
    setRoadmapStatus((prev) => {
      const next = prev === "live" ? "draft" : "live";
      apiUpdateRoadmap(id, { status: next }).catch(console.error);
      return next;
    });
  }, [id]);

  const handleCardClick = useCallback((card) => {
    const startIdx = cardStartIdx(card);
    const endIdx = cardEndIdx(card);
    const startSprint = sprints[startIdx];
    const endSprint = sprints[endIdx];
    const span = endIdx - startIdx + 1;
    const sprintLabel = startSprint
      ? span > 1 && endSprint
        ? `${startSprint.name} → ${endSprint.name}`
        : `${startSprint.name} (${formatDateShort(startSprint.startDate)})`
      : "";
    setSelectedCard({ ...card, sprintLabel, computedSpan: span });
  }, [sprints, cardStartIdx, cardEndIdx]);

  const handleCardUpdate = useCallback((updated) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    setSelectedCard((prev) => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
    const apiData = mapCardToApi(updated);
    apiUpdateCard(updated.id, apiData).catch(console.error);
  }, []);

  const handleDeleteCard = useCallback((cardId) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setSelectedCard(null);
    apiDeleteCard(cardId).catch(console.error);
  }, []);

  const handleAddRow = useCallback(() => {
    const tempId = `row-${Date.now()}`;
    const colors = ["var(--teal)", "var(--blue)", "var(--purple)", "var(--orange)", "var(--red)", "var(--green)"];
    const newRow = { id: tempId, name: "New Row", color: colors[rows.length % colors.length] };
    setRows((prev) => [...prev, newRow]);
    setRowHeights((prev) => ({ ...prev, [tempId]: null }));
    apiCreateRow(id, { name: newRow.name, color: newRow.color })
      .then((serverRow) => {
        const mapped = mapRowFromApi(serverRow);
        setRows((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: mapped.id } : r)));
        setRowHeights((prev) => { const h = { ...prev, [mapped.id]: prev[tempId] }; delete h[tempId]; return h; });
        setCards((prev) => prev.map((c) => (c.rowId === tempId ? { ...c, rowId: mapped.id } : c)));
      })
      .catch(console.error);
  }, [id, rows.length]);

  const handleDeleteRow = useCallback((rowId) => {
    setCards((prev) => prev.map((c) => (c.rowId === rowId ? { ...c, rowId: null } : c)));
    setRows((prev) => prev.filter((r) => r.id !== rowId));
    setRowMenuId(null);
    setRowMenuPos(null);
    apiDeleteRow(id, rowId).catch(console.error);
  }, [id]);

  const startRowRename = useCallback((rowId) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    setEditingRowId(rowId);
    setRowNameDraft(row.name);
    setRowMenuId(null);
  }, [rows]);

  const commitRowRename = useCallback(() => {
    if (!editingRowId) return;
    const trimmed = rowNameDraft.trim();
    if (trimmed && trimmed !== rows.find((r) => r.id === editingRowId)?.name) {
      setRows((prev) => prev.map((r) => (r.id === editingRowId ? { ...r, name: trimmed } : r)));
      apiUpdateRow(id, editingRowId, { name: trimmed }).catch(console.error);
    }
    setEditingRowId(null);
  }, [editingRowId, rowNameDraft, rows, id]);

  /* --- Row drag reorder --- */
  const handleRowDragStart = useCallback((e, rowId, rowIdx) => {
    e.preventDefault();
    setRowDrag({ rowId, startY: e.clientY, originIdx: rowIdx, currentIdx: rowIdx });
  }, []);

  useEffect(() => {
    if (!rowDrag) return;
    const handleMouseMove = (e) => {
      const rowEls = document.querySelectorAll(".row-header");
      let newIdx = rowDrag.originIdx;
      for (let i = 0; i < rowEls.length; i++) {
        const rect = rowEls[i].getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          newIdx = i;
          break;
        }
      }
      if (newIdx !== rowDrag.currentIdx) {
        setRowDrag((prev) => ({ ...prev, currentIdx: newIdx }));
        setRows((prev) => {
          const arr = [...prev];
          const fromIdx = arr.findIndex((r) => r.id === rowDrag.rowId);
          if (fromIdx < 0 || fromIdx === newIdx) return prev;
          const [moved] = arr.splice(fromIdx, 1);
          arr.splice(newIdx, 0, moved);
          return arr;
        });
      }
    };
    const handleMouseUp = () => {
      apiReorderRows(id, rows.map((r) => r.id)).catch(console.error);
      setRowDrag(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [rowDrag, id, rows]);

  const handleCellAddClick = useCallback((rowId, sprintId) => {
    setInlineCreate({ rowId, sprintId });
    setInlineCreateName("");
  }, []);

  const commitInlineCreate = useCallback(() => {
    if (!inlineCreate) return;
    const trimmed = inlineCreateName.trim();
    if (trimmed) {
      const tempId = `card-${Date.now()}`;
      const newCard = {
        id: tempId, name: trimmed, rowId: inlineCreate.rowId,
        startSprintId: inlineCreate.sprintId, endSprintId: inlineCreate.sprintId,
        sprintStart: sprintIndex[inlineCreate.sprintId] ?? 0, duration: 1,
        tags: [], headcount: 1, lenses: [], status: "Placeholder",
        team: "", effort: 0, description: "", order: 0,
      };
      setCards((prev) => [...prev, newCard]);
      apiCreateCard(id, {
        name: trimmed, row_id: inlineCreate.rowId,
        start_sprint_id: inlineCreate.sprintId, end_sprint_id: inlineCreate.sprintId,
        status: "placeholder",
      })
        .then((serverCard) => {
          const mapped = mapCardFromApi(serverCard);
          setCards((prev) => prev.map((c) => (c.id === tempId ? { ...mapped, rowId: mapped.rowId || inlineCreate.rowId } : c)));
        })
        .catch(console.error);
    }
    setInlineCreate(null);
    setInlineCreateName("");
  }, [inlineCreate, inlineCreateName, id, sprintIndex]);

  const handleInlineKeyDown = useCallback((e) => {
    if (e.key === "Enter") commitInlineCreate();
    if (e.key === "Escape") { setInlineCreate(null); setInlineCreateName(""); }
  }, [commitInlineCreate]);

  /* ================================================================
     SPRINT MANAGEMENT
     ================================================================ */

  const handleSprintDaysChange = useCallback((sprintId, delta) => {
    const s = sprints.find((sp) => sp.id === sprintId);
    if (!s) return;
    const newDays = Math.max(1, s.days + delta);
    // Optimistic update
    setSprints((prev) => {
      const idx = prev.findIndex((sp) => sp.id === sprintId);
      if (idx < 0) return prev;
      const updated = [...prev];
      const newEnd = addDays(s.startDate, newDays - 1);
      const dayDelta = newDays - s.days;
      updated[idx] = { ...s, days: newDays, endDate: newEnd };
      // Cascade subsequent sprints
      for (let i = idx + 1; i < updated.length; i++) {
        const sp = updated[i];
        const spDays = sp.days;
        const newStart = addDays(sp.startDate, dayDelta);
        updated[i] = { ...sp, startDate: newStart, endDate: addDays(newStart, spDays - 1) };
      }
      return updated;
    });
    apiUpdateSprint(sprintId, { days: newDays })
      .then((allSprints) => {
        if (Array.isArray(allSprints)) {
          setSprints(allSprints.map(mapSprintFromApi));
        }
      })
      .catch(console.error);
  }, [sprints]);

  const handleSprintFieldUpdate = useCallback((sprintId, field, value) => {
    if (field === "startDate" || field === "endDate") {
      // For date changes, compute the new days count and use the days API to cascade
      setSprints((prev) => {
        const idx = prev.findIndex((s) => s.id === sprintId);
        if (idx < 0) return prev;
        const s = prev[idx];
        const newStart = field === "startDate" ? value : s.startDate;
        const newEnd = field === "endDate" ? value : s.endDate;
        const newDays = Math.round((new Date(newEnd) - new Date(newStart)) / 86400000) + 1;
        if (newDays < 1) return prev;

        const updated = [...prev];
        updated[idx] = { ...s, startDate: newStart, endDate: newEnd, days: newDays };

        // Cascade: each subsequent sprint keeps its duration, starts day after previous ends
        let prevEnd = newEnd;
        for (let i = idx + 1; i < updated.length; i++) {
          const sp = updated[i];
          const spDays = sp.days;
          const nextStart = addDays(prevEnd, 1);
          const nextEnd = addDays(nextStart, spDays - 1);
          updated[i] = { ...sp, startDate: nextStart, endDate: nextEnd };
          prevEnd = nextEnd;
        }
        return updated;
      });
      // Use the days endpoint for cascading on the backend
      const s = sprints.find((sp) => sp.id === sprintId);
      if (s) {
        const newStart = field === "startDate" ? value : s.startDate;
        const newEnd = field === "endDate" ? value : s.endDate;
        const newDays = Math.round((new Date(newEnd) - new Date(newStart)) / 86400000) + 1;
        if (newDays >= 1) {
          // Update start_date first if changed, then use days for cascading
          const updates = {};
          if (field === "startDate") updates.start_date = value;
          updates.days = newDays;
          apiUpdateSprint(sprintId, updates)
            .then((allSprints) => {
              if (Array.isArray(allSprints)) setSprints(allSprints.map(mapSprintFromApi));
            })
            .catch(console.error);
        }
      }
    } else {
      setSprints((prev) => prev.map((s) => (s.id === sprintId ? { ...s, [field]: value } : s)));
      const apiField = field === "startDate" ? "start_date" : field === "endDate" ? "end_date" : field;
      apiUpdateSprint(sprintId, { [apiField]: value }).catch(console.error);
    }
  }, [sprints]);

  const handleAddSprint = useCallback(() => {
    const lastSprint = sprints[sprints.length - 1];
    const startDate = lastSprint ? addDays(lastSprint.endDate, 1) : new Date().toISOString().split("T")[0];
    const endDate = addDays(startDate, 13);
    const name = `Sprint ${sprints.length + 1}`;

    const tempId = `sprint-${Date.now()}`;
    const newSprint = { id: tempId, name, startDate, endDate, sortOrder: sprints.length, goal: "", status: "planned", days: 14 };
    setSprints((prev) => [...prev, newSprint]);

    apiCreateSprint(id, { name, start_date: startDate, end_date: endDate })
      .then((serverSprint) => {
        const mapped = mapSprintFromApi(serverSprint);
        setSprints((prev) => prev.map((s) => (s.id === tempId ? mapped : s)));
      })
      .catch(console.error);
  }, [id, sprints]);

  const handleDeleteSprint = useCallback((sprintId) => {
    const idx = sprints.findIndex((s) => s.id === sprintId);
    const adjacent = sprints[idx + 1] || sprints[idx - 1];
    // Move cards from deleted sprint to adjacent
    if (adjacent) {
      setCards((prev) => prev.map((c) => {
        let updated = { ...c };
        if (c.startSprintId === sprintId) updated.startSprintId = adjacent.id;
        if (c.endSprintId === sprintId) updated.endSprintId = adjacent.id;
        return updated;
      }));
    }
    setSprints((prev) => prev.filter((s) => s.id !== sprintId));
    setSprintPopoverId(null);
    apiDeleteSprint(sprintId, adjacent?.id).then((remaining) => {
      if (Array.isArray(remaining)) setSprints(remaining.map(mapSprintFromApi));
    }).catch(console.error);
  }, [sprints]);


  /* ================================================================
     DRAG & DROP
     ================================================================ */

  const dragStartPos = useRef(null);
  const dragPendingRef = useRef(null);
  const [dragPending, setDragPending] = useState(false);
  const DRAG_THRESHOLD = 5; // px before drag activates

  const handleDragStart = useCallback((e, card) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragPendingRef.current = {
      card,
      offset: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      size: { w: rect.width, h: rect.height },
    };
    setDragPending(true);
  }, []);

  useEffect(() => {
    // Handle both pre-drag (pending) and active drag states
    if (!isDragging && !dragPending) return;

    const handleMouseMove = (e) => {
      // If drag hasn't activated yet, check threshold
      if (!isDragging && dragPendingRef.current) {
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        // Threshold exceeded — activate drag
        const pending = dragPendingRef.current;
        setDragCard(pending.card);
        setDragOffset(pending.offset);
        setDragSize(pending.size);
        setDragPos({ x: e.clientX, y: e.clientY });
        setIsDragging(true);
        setDragPending(false);
        dragPendingRef.current = null;
        return;
      }

      setDragPos({ x: e.clientX, y: e.clientY });
      if (!canvasRef.current) return;

      // Find the grid cell under the mouse using actual DOM positions
      const cells = canvasRef.current.querySelectorAll("[data-row-id][data-sprint-id]");
      let foundTarget = null;
      for (const cell of cells) {
        const r = cell.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const sprintIdx = sprints.findIndex((s) => s.id === cell.dataset.sprintId);
          if (sprintIdx >= 0) {
            foundTarget = { rowId: cell.dataset.rowId, sprintIdx, sprintId: cell.dataset.sprintId };
          }
          break;
        }
      }
      if (foundTarget) {
        setDropTarget(foundTarget);
      } else {
        setDropTarget(null);
      }
    };
    const handleMouseUp = () => {
      // If drag never activated (mouse didn't move past threshold), just clean up
      if (!isDragging) {
        setDragPending(false);
        dragPendingRef.current = null;
        dragStartPos.current = null;
        return;
      }
      if (dragCard && dropTarget) {
        // Preserve the card's original span (number of sprints)
        const origStartIdx = cardStartIdx(dragCard);
        const origEndIdx = cardEndIdx(dragCard);
        const span = origEndIdx - origStartIdx; // 0 for single-sprint
        const newStartIdx = dropTarget.sprintIdx;
        const newEndIdx = Math.min(newStartIdx + span, sprints.length - 1);
        const newStartSprintId = sprints[newStartIdx].id;
        const newEndSprintId = sprints[newEndIdx].id;

        setCards((prev) =>
          prev.map((c) =>
            c.id === dragCard.id
              ? { ...c, rowId: dropTarget.rowId, startSprintId: newStartSprintId, endSprintId: newEndSprintId }
              : c
          )
        );
        // Update selectedCard if the dragged card is currently selected
        if (selectedCard && selectedCard.id === dragCard.id) {
          setSelectedCard((prev) =>
            prev ? { ...prev, rowId: dropTarget.rowId, startSprintId: newStartSprintId, endSprintId: newEndSprintId } : prev
          );
        }
        apiMoveCard(dragCard.id, {
          row_id: dropTarget.rowId,
          start_sprint_id: newStartSprintId,
          end_sprint_id: newEndSprintId,
        }).catch(console.error);
      }
      setIsDragging(false);
      setDragCard(null);
      setDropTarget(null);
      setDragPending(false);
      dragPendingRef.current = null;
      dragStartPos.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [isDragging, dragPending, dragCard, dropTarget, sprints, selectedCard]);

  /* ================================================================
     CARD RESIZE (both edges)
     ================================================================ */

  const handleResizeStart = useCallback((e, card, edge) => {
    e.preventDefault();
    e.stopPropagation();
    setResizeCard({
      cardId: card.id, edge, startX: e.clientX,
      origStartIdx: cardStartIdx(card), origEndIdx: cardEndIdx(card),
    });
    setResizePreview({ startIdx: cardStartIdx(card), endIdx: cardEndIdx(card) });
  }, [cardStartIdx, cardEndIdx]);

  useEffect(() => {
    if (!resizeCard) return;
    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeCard.startX;
      const colW = getColWidth(resizeCard.origStartIdx);
      const deltaCols = Math.round(deltaX / colW);
      let newStart = resizeCard.origStartIdx;
      let newEnd = resizeCard.origEndIdx;
      if (resizeCard.edge === "right") {
        newEnd = Math.min(sprints.length - 1, Math.max(newStart, resizeCard.origEndIdx + deltaCols));
      } else {
        newStart = Math.max(0, Math.min(newEnd, resizeCard.origStartIdx + deltaCols));
      }
      setResizePreview({ startIdx: newStart, endIdx: newEnd });
    };
    const handleMouseUp = () => {
      if (resizePreview && sprints[resizePreview.startIdx] && sprints[resizePreview.endIdx]) {
        const startSprintId = sprints[resizePreview.startIdx].id;
        const endSprintId = sprints[resizePreview.endIdx].id;
        setCards((prev) =>
          prev.map((c) =>
            c.id === resizeCard.cardId ? { ...c, startSprintId, endSprintId } : c
          )
        );
        apiMoveCard(resizeCard.cardId, { start_sprint_id: startSprintId, end_sprint_id: endSprintId }).catch(console.error);
      }
      setResizeCard(null);
      setResizePreview(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [resizeCard, resizePreview, getColWidth, sprints]);

  /* ================================================================
     COLUMN RESIZE
     ================================================================ */

  const handleColResizeStart = useCallback((e, sprintId) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = sprintIndex[sprintId] ?? 0;
    setColResize({ sprintId, startX: e.clientX, startWidth: getColWidth(idx) });
  }, [getColWidth, sprintIndex]);

  useEffect(() => {
    if (!colResize || colResize.sprintId === "rowHeader") return;
    const handleMouseMove = (e) => {
      const delta = e.clientX - colResize.startX;
      const newWidth = Math.max(60, colResize.startWidth + delta);
      setColWidths((prev) => ({ ...prev, [colResize.sprintId]: newWidth }));
    };
    const handleMouseUp = () => setColResize(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [colResize]);

  /* --- Row header resize --- */
  const handleRowHeaderResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setColResize({ sprintId: "rowHeader", startX: e.clientX, startWidth: rowHeaderWidth });
  }, [rowHeaderWidth]);

  useEffect(() => {
    if (!colResize || colResize.sprintId !== "rowHeader") return;
    const handleMouseMove = (e) => {
      const delta = e.clientX - colResize.startX;
      setRowHeaderWidth(Math.max(100, colResize.startWidth + delta));
    };
    const handleMouseUp = () => setColResize(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [colResize]);

  /* ================================================================
     ROW HEIGHT RESIZE
     ================================================================ */

  const handleRowResizeStart = useCallback((e, rowId) => {
    e.preventDefault();
    e.stopPropagation();
    const rowEl = document.querySelector(`[data-row-id="${rowId}"]`);
    const currentHeight = rowEl ? rowEl.offsetHeight : 80;
    setRowResize({ rowId, startY: e.clientY, startHeight: currentHeight });
  }, []);

  useEffect(() => {
    if (!rowResize) return;
    const handleMouseMove = (e) => {
      const delta = e.clientY - rowResize.startY;
      setRowHeights((prev) => ({ ...prev, [rowResize.rowId]: Math.max(50, rowResize.startHeight + delta) }));
    };
    const handleMouseUp = () => setRowResize(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [rowResize]);

  /* ================================================================
     REORDER WITHIN CELL
     ================================================================ */

  const handleReorderStart = useCallback((e, card, cellCards) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderState({
      cardId: card.id, rowId: card.rowId, startSprintId: card.startSprintId,
      startY: e.clientY, cellCards: cellCards.map((c) => c.id),
      currentIndex: cellCards.findIndex((c) => c.id === card.id),
    });
  }, []);

  useEffect(() => {
    if (!reorderState) return;
    const handleMouseMove = (e) => {
      const deltaY = e.clientY - reorderState.startY;
      const cardHeight = 52;
      const indexShift = Math.round(deltaY / cardHeight);
      const newIndex = Math.max(0, Math.min(reorderState.cellCards.length - 1, reorderState.currentIndex + indexShift));
      if (newIndex !== reorderState.currentIndex) {
        const newOrder = [...reorderState.cellCards];
        const [moved] = newOrder.splice(reorderState.currentIndex, 1);
        newOrder.splice(newIndex, 0, moved);
        setCards((prev) => prev.map((c) => { const idx = newOrder.indexOf(c.id); return idx >= 0 ? { ...c, order: idx } : c; }));
        setReorderState((prev) => ({ ...prev, currentIndex: newIndex, cellCards: newOrder, startY: e.clientY }));
      }
    };
    const handleMouseUp = () => setReorderState(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [reorderState]);

  /* ================================================================
     GRID TEMPLATE
     ================================================================ */

  const showRowHeaders = rows.length >= 1;

  const gridTemplateColumns = `${showRowHeaders ? `${rowHeaderWidth}px ` : ""}${sprints.map((s, i) =>
    colWidths[s.id] != null ? `${colWidths[s.id]}px` : `${Math.max(MIN_COL_WIDTH, s.days * PIXELS_PER_DAY)}px`
  ).join(" ")}`;

  const HEADER_ROWS = 3;
  const dataRowStart = (rowIdx) => HEADER_ROWS + 1 + rowIdx;
  const sprintCol = (si) => showRowHeaders ? si + 2 : si + 1;
  const totalGridCols = (showRowHeaders ? 1 : 0) + sprints.length;

  /* ================================================================
     RENDER
     ================================================================ */

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="topbar">
          <div className="topbar-left">
            <div className="skeleton" style={{ width: 200, height: 20, borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ flex: 1, padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px repeat(6, 1fr)", gap: 8 }}>
            {Array.from({ length: 21 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: i < 7 ? 28 : 60, borderRadius: 6 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, padding: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
          {loadError === "not_found" ? "Roadmap not found" : "Failed to load roadmap"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>
          {loadError === "not_found"
            ? "This roadmap doesn't exist or may have been deleted."
            : "Something went wrong. Please try again."}
        </p>
        <button className="btn btn-primary" onClick={() => navigate("/roadmaps")}>
          Go to Roadmaps
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* -- Top Bar -- */}
      <div className="topbar">
        <div className="topbar-left">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="topbar-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <span className="topbar-title" onClick={() => setEditingTitle(true)} style={{ cursor: "pointer" }} title="Click to rename">
              {roadmapName}
            </span>
          )}
          <span
            className={`badge ${roadmapStatus === "live" ? "badge-green" : "badge-gray"}`}
            onClick={toggleStatus}
            style={{ cursor: "pointer", userSelect: "none" }}
            title="Click to toggle status"
          >
            {roadmapStatus === "live" ? "LIVE" : "DRAFT"}
          </span>
        </div>

        <div className="topbar-right">
          <button
            className={`btn-icon${commentsHidden ? "" : " active-toggle"}`}
            type="button"
            onClick={() => setCommentsHidden((v) => !v)}
            title={commentsHidden ? "Show comments" : "Hide comments"}
          >
            {commentsHidden ? <MessageCircle size={16} /> : <MessageCircleOff size={16} />}
          </button>
          <button className="btn-icon" type="button" onClick={() => setShowVersionHistory(true)} title="Version history">
            <Clock size={16} />
          </button>
          <button
            className={`roadway-ai-btn${chatOpen ? " active" : ""}`}
            type="button"
            onClick={toggleChat}
          >
            <Sparkles size={14} />
            Roadway AI
          </button>
        </div>
      </div>

      {/* -- Sprint summary bar -- */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "6px 20px",
        background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-default)",
        fontSize: 12, color: "var(--text-secondary)", flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600 }}>{sprints.length} sprints</span>
        {sprints.length > 0 && (
          <span style={{ color: "var(--text-muted)" }}>
            {formatDateShort(sprints[0].startDate)} &mdash; {formatDateShort(sprints[sprints.length - 1].endDate)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="summary-bar-add-row" onClick={handleAddRow}>
          <Plus size={12} /> Add row
        </button>
      </div>

      {/* -- Canvas Area -- */}
      <div
        className={`canvas-wrapper${commentMode ? " comment-mode-cursor" : ""}`}
        ref={canvasRef}
        style={{ position: "relative" }}
      >
        <div
          className="canvas-grid"
          ref={gridRef}
          style={{
            gridTemplateColumns,
            gridTemplateRows: `28px 24px auto ${rows.map((r) =>
              rowHeights[r.id] != null ? `${rowHeights[r.id]}px` : "minmax(70px, 1fr)"
            ).join(" ")}`,
          }}
        >
          {/* -- Corner cell (only when row headers visible) -- */}
          {showRowHeaders && (
            <div className="grid-corner" style={{ gridColumn: "1 / 2", gridRow: "1 / 4", position: "sticky", left: 0, top: 0, zIndex: 15 }}>
              <div className="col-resize-handle" style={{ position: "absolute", top: 0, right: -2, bottom: 0, width: 5 }} onMouseDown={handleRowHeaderResizeStart} />
            </div>
          )}

          {/* -- Quarter headers -- */}
          {QUARTERS.map((q, qi) => {
            const startCol = sprintCol(q.startIdx);
            const span = q.endIdx - q.startIdx + 1;
            return (
              <div key={qi} className="quarter-header" style={{ gridColumn: `${startCol} / ${startCol + span}`, gridRow: "1 / 2" }}>
                {q.label}
              </div>
            );
          })}

          {/* -- Month headers -- */}
          {MONTHS.map((m, mi) => {
            const startCol = sprintCol(m.startIdx);
            const span = m.endIdx - m.startIdx + 1;
            return (
              <div key={m.key} className="month-header" style={{ gridColumn: `${startCol} / ${startCol + span}`, gridRow: "2 / 3" }}>
                {m.label}
              </div>
            );
          })}

          {/* -- Sprint headers -- */}
          {sprints.map((s, si) => (
            <div
              key={s.id}
              className="sprint-header"
              style={{
                gridColumn: `${sprintCol(si)} / ${sprintCol(si) + 1}`,
                gridRow: "3 / 4",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0,
                padding: "2px 4px",
                cursor: "pointer",
                position: "sticky",
                top: 52,
                zIndex: 10,
                background: "var(--bg-sprint-header)",
                borderBottom: "2px solid var(--border-default)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (sprintPopoverId === s.id) { setSprintPopoverId(null); return; }
                setSprintPopoverId(s.id);
                setSprintEditDraft({ name: s.name, goal: s.goal, startDate: s.startDate, endDate: s.endDate });
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, lineHeight: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </div>
              <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: "12px" }}>
                {formatDateShort(s.startDate)} – {formatDateShort(s.endDate)}
              </div>

              {/* Hover edit icon */}
              <div className="sprint-edit-hint">
                <Pencil size={9} />
              </div>

              {/* Sprint edit popover */}
              {sprintPopoverId === s.id && (
                <div
                  className="sprint-popover"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 50,
                    background: "var(--bg-primary)", border: "1px solid var(--border-default)",
                    borderRadius: 8, boxShadow: "var(--shadow-dropdown)", padding: 12,
                    minWidth: 200, display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", flex: 1 }}>
                      Start
                      <input type="date" className="form-input" style={{ marginTop: 2, fontSize: 11, padding: "3px 6px" }}
                        value={sprintEditDraft.startDate ?? s.startDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSprintEditDraft((d) => ({ ...d, startDate: val }));
                        }}
                        onBlur={() => {
                          if (sprintEditDraft.startDate && sprintEditDraft.startDate !== s.startDate) {
                            handleSprintFieldUpdate(s.id, "startDate", sprintEditDraft.startDate);
                          }
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", flex: 1 }}>
                      End
                      <input type="date" className="form-input" style={{ marginTop: 2, fontSize: 11, padding: "3px 6px" }}
                        value={sprintEditDraft.endDate ?? s.endDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSprintEditDraft((d) => ({ ...d, endDate: val }));
                        }}
                        onBlur={() => {
                          if (sprintEditDraft.endDate && sprintEditDraft.endDate !== s.endDate) {
                            handleSprintFieldUpdate(s.id, "endDate", sprintEditDraft.endDate);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 0" }}>
                    {(() => {
                      const sd = sprintEditDraft.startDate ?? s.startDate;
                      const ed = sprintEditDraft.endDate ?? s.endDate;
                      const d = Math.round((new Date(ed) - new Date(sd)) / 86400000) + 1;
                      return `${d} day${d !== 1 ? "s" : ""}`;
                    })()}
                  </div>
                </div>
              )}

              {/* Column resize handle */}
              <div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart(e, s.id)} />
            </div>
          ))}

          {/* -- "+" add sprint column -- */}
          <div
            style={{
              gridColumn: `${totalGridCols + 1} / ${totalGridCols + 2}`,
              gridRow: "1 / 4",
              display: "flex", alignItems: "center", justifyContent: "center",
              minWidth: 40, cursor: "pointer", color: "var(--text-muted)",
              borderBottom: "2px solid var(--border-default)",
              position: "sticky", top: 0, zIndex: 10, background: "var(--bg-secondary)",
            }}
            onClick={handleAddSprint}
            title="Add sprint"
          >
            <Plus size={16} />
          </div>

          {/* -- Data Rows -- */}
          {rows.map((row, ri) => {
            const gridRow = dataRowStart(ri);
            const cardsInRow = cards.filter((c) => c.rowId === row.id);

            return (
              <React.Fragment key={row.id}>
                {/* Row header (only when multiple rows) */}
                {showRowHeaders && (
                  <div
                    className={`row-header${rowDrag && rowDrag.rowId === row.id ? " row-dragging" : ""}`}
                    style={{
                      gridColumn: "1 / 2", gridRow: `${gridRow} / ${gridRow + 1}`,
                      width: rowHeaderWidth, minWidth: rowHeaderWidth,
                    }}
                  >
                    <div className="row-drag-grip" onMouseDown={(e) => handleRowDragStart(e, row.id, ri)} title="Drag to reorder">
                      <GripVertical size={10} />
                    </div>
                    <span className="row-color-bar" style={{ background: row.color }} />
                    {editingRowId === row.id ? (
                      <input
                        ref={rowNameInputRef}
                        className="inline-input"
                        style={{ fontSize: 11, fontWeight: 600, width: "100%" }}
                        value={rowNameDraft}
                        onChange={(e) => setRowNameDraft(e.target.value)}
                        onBlur={commitRowRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRowRename();
                          if (e.key === "Escape") setEditingRowId(null);
                        }}
                      />
                    ) : (
                      <span className="row-name" onDoubleClick={() => startRowRename(row.id)}>{row.name}</span>
                    )}
                    <div className="row-actions" style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
                      <button className="btn-icon" type="button" style={{ padding: 2 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (rowMenuId === row.id) {
                            setRowMenuId(null);
                            setRowMenuPos(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setRowMenuPos({ top: rect.bottom + 4, left: rect.left });
                            setRowMenuId(row.id);
                          }
                        }}>
                        <MoreHorizontal size={12} />
                      </button>
                    </div>
                    <div className="row-resize-handle" onMouseDown={(e) => handleRowResizeStart(e, row.id)} />
                  </div>
                )}

                {/* Grid cells for each sprint */}
                {sprints.map((s, si) => {
                  const isInlineHere = inlineCreate && inlineCreate.rowId === row.id && inlineCreate.sprintId === s.id;

                  const cellCards = cardsInRow
                    .filter((c) => cardStartIdx(c) === si)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                  const isDropTarget = isDragging && dropTarget && dropTarget.rowId === row.id && dropTarget.sprintIdx === si;

                  return (
                    <div
                      key={`${row.id}-${s.id}`}
                      className={`grid-cell${isDropTarget ? " drop-target-active" : ""}`}
                      data-row-id={row.id}
                      data-sprint-id={s.id}
                      style={{
                        gridColumn: `${sprintCol(si)} / ${sprintCol(si) + 1}`,
                        gridRow: `${gridRow} / ${gridRow + 1}`,
                      }}
                      onMouseDown={!commentMode ? (e) => {
                        if (e.button !== 0) return;
                        if (isInlineHere) return; // Don't drag during inline creation
                        if (e.target.closest(".feature-card")) return; // Card handles its own drag
                        if (e.target.closest(".cell-add-btn")) return; // Add button handles its own click
                        if (e.target.closest(".resize-handle")) return;
                        if (cellCards.length === 1) {
                          const cardEl = e.currentTarget.querySelector(`[data-card-id="${cellCards[0].id}"]`);
                          if (cardEl) {
                            const rect = cardEl.getBoundingClientRect();
                            e.preventDefault();
                            e.stopPropagation();
                            dragStartPos.current = { x: e.clientX, y: e.clientY };
                            dragPendingRef.current = {
                              card: cellCards[0],
                              offset: { x: rect.width / 2, y: rect.height / 2 },
                              size: { w: rect.width, h: rect.height },
                            };
                            setDragPending(true);
                          }
                        }
                      } : undefined}
                      onClick={commentMode ? (e) => {
                        e.stopPropagation();
                        if (e.target.closest(".comment-pin") || e.target.closest(".comment-popover")) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
                        const yPct = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
                        const cardEl = e.target.closest(".feature-card");
                        window.dispatchEvent(new CustomEvent("roadway-comment-click", {
                          detail: { rowId: row.id, sprintId: s.id, cardId: cardEl?.dataset?.cardId || null, xPct, yPct, screenX: e.clientX, screenY: e.clientY },
                        }));
                      } : undefined}
                    >
                      {isDropTarget && <div className="drop-insertion-line" />}

                      {/* Feature cards — render multi-sprint and single-sprint in separate layers to prevent overlap */}
                      {(() => {
                        const multiCards = [];
                        const singleCards = [];
                        cellCards.forEach((c) => {
                          const span = cardEndIdx(c) - cardStartIdx(c) + 1;
                          if (span > 1) multiCards.push(c);
                          else singleCards.push(c);
                        });

                        function renderCard(c, cardStyle) {
                          const isBeingDragged = isDragging && dragCard && dragCard.id === c.id;
                          const isBeingResized = resizeCard && resizeCard.cardId === c.id;
                          const displayStartIdx = isBeingResized && resizePreview ? resizePreview.startIdx : cardStartIdx(c);
                          const displayEndIdx = isBeingResized && resizePreview ? resizePreview.endIdx : cardEndIdx(c);
                          const displaySpan = displayEndIdx - displayStartIdx + 1;

                          return (
                            <div
                              key={c.id}
                              className={`feature-card${selectedCard && selectedCard.id === c.id ? " selected" : ""}${isBeingDragged ? " dragging" : ""}${isBeingResized ? " resizing" : ""}`}
                              data-card-id={c.id}
                              onClick={() => !isDragging && !commentMode && handleCardClick(c)}
                              onMouseDown={(e) => {
                                if (commentMode) return;
                                if (e.button !== 0) return;
                                if (e.target.closest(".resize-handle")) return;
                                if (e.target.closest(".reorder-grip")) { handleReorderStart(e, c, cellCards); return; }
                                handleDragStart(e, c);
                              }}
                              style={cardStyle}
                            >
                              <div className="resize-handle resize-handle-left" onMouseDown={(e) => handleResizeStart(e, c, "left")} />
                              {cellCards.length > 1 && (
                                <div className="reorder-grip"><GripVertical size={10} /></div>
                              )}
                              <div className="feature-card-name">{c.name}</div>
                              {displaySpan > 1 && (() => {
                                let totalW = 0;
                                for (let idx = displayStartIdx; idx <= displayEndIdx && idx < sprints.length; idx++) totalW += getColWidth(idx);
                                const cw = totalW - 6;
                                return (
                                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
                                    {Array.from({ length: displaySpan - 1 }, (_, ti) => {
                                      let leftPos = 0;
                                      for (let idx = displayStartIdx; idx <= displayStartIdx + ti; idx++) leftPos += getColWidth(idx);
                                      return (
                                        <div key={ti} style={{
                                          position: "absolute", top: 2, bottom: 2, left: leftPos - 3,
                                          width: 1, background: "var(--border-default)", opacity: 0.4,
                                        }} />
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              {c.tags.length > 0 && (
                                <div className="feature-card-tags">
                                  {c.tags.map((t) => (<span key={t} className="tag" style={tagStyle(t)}>{t}</span>))}
                                </div>
                              )}
                              <div className="feature-card-footer">
                                {c.lenses.length > 0 && (
                                  <div className="feature-card-lenses">
                                    {c.lenses.map((color, li) => (<span key={li} className="lens-dot" style={{ background: `var(--${color})` }} />))}
                                  </div>
                                )}
                                <span className="feature-card-headcount"><User size={9} />{c.headcount}</span>
                              </div>
                              <div className="resize-handle resize-handle-right" onMouseDown={(e) => handleResizeStart(e, c, "right")} />
                            </div>
                          );
                        }

                        return (
                          <>
                            {/* Multi-sprint cards in a relative container */}
                            {multiCards.length > 0 && (
                              <div style={{ position: "relative", width: "100%" }}>
                                {multiCards.map((c, mi) => {
                                  const dStartIdx = (resizeCard && resizeCard.cardId === c.id && resizePreview) ? resizePreview.startIdx : cardStartIdx(c);
                                  const dEndIdx = (resizeCard && resizeCard.cardId === c.id && resizePreview) ? resizePreview.endIdx : cardEndIdx(c);
                                  let totalW = 0;
                                  for (let idx = dStartIdx; idx <= dEndIdx && idx < sprints.length; idx++) totalW += getColWidth(idx);
                                  const cardWidth = totalW - 6;
                                  const style = { position: mi === 0 ? "relative" : "absolute", top: mi === 0 ? 0 : mi * 40, left: mi === 0 ? undefined : 3, width: cardWidth, zIndex: 3 };
                                  if (mi === 0) style.width = cardWidth;
                                  if (mi === 0) style.marginLeft = 3;
                                  return renderCard(c, style);
                                })}
                                {/* Extra space for stacked absolute cards beyond the first */}
                                {multiCards.length > 1 && (
                                  <div style={{ height: (multiCards.length - 1) * 40, flexShrink: 0 }} />
                                )}
                              </div>
                            )}
                            {/* Single-sprint cards flow normally below */}
                            {singleCards.map((c) => renderCard(c, { marginTop: 4 }))}
                          </>
                        );
                      })()}

                      {/* Inline card creation */}
                      {isInlineHere && (
                        <div className="feature-card placeholder" style={{ zIndex: 4 }}>
                          <input
                            ref={inlineInputRef} className="inline-input"
                            style={{ fontSize: 11, fontWeight: 600 }}
                            placeholder="Card name..."
                            value={inlineCreateName}
                            onChange={(e) => setInlineCreateName(e.target.value)}
                            onBlur={commitInlineCreate}
                            onKeyDown={handleInlineKeyDown}
                          />
                        </div>
                      )}

                      {!isInlineHere && (
                        <button className={`cell-add-btn${cellCards.length > 0 ? " has-cards" : ""}`} type="button" onClick={() => handleCellAddClick(row.id, s.id)}>
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

        </div>

        {/* -- Comment pins layer -- */}
        <CommentLayer
          roadmapId={id}
          canvasRef={canvasRef}
          sprints={sprints}
          rows={rows}
          rowHeights={rowHeights}
          rowHeaderWidth={rowHeaderWidth}
          showRowHeaders={showRowHeaders}
          getColWidth={getColWidth}
          commentMode={commentsHidden ? false : commentMode}
          setCommentMode={setCommentMode}
          currentUserId={JSON.parse(localStorage.getItem("user") || "{}").id}
          cards={cards}
          hidden={commentsHidden}
          triageOpen={triageOpen}
        />
      </div>

      {/* -- Triage Drawer -- */}
      <div className={`triage-drawer${triageOpen ? " triage-drawer-open" : ""}`}>
        <button
          className="triage-drawer-tab"
          type="button"
          onClick={() => setTriageOpen((prev) => !prev)}
        >
          <Inbox size={14} />
          <span className="triage-drawer-label">Triage</span>
          {triageCards.length > 0 && (
            <span className="triage-drawer-count">{triageCards.length}</span>
          )}
          {triageOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {triageOpen && (
          <div className="triage-drawer-content">
            {triageCards.length === 0 ? (
              <div className="triage-drawer-empty">
                <button
                  type="button"
                  className="triage-add-card-btn"
                  disabled={sprints.length === 0}
                  onClick={() => {
                    if (sprints.length === 0) return;
                    const tempId = `card-${Date.now()}`;
                    const newCard = {
                      id: tempId, name: "New Card", rowId: null,
                      startSprintId: sprints[0].id, endSprintId: sprints[0].id,
                      sprintStart: 0, duration: 1,
                      tags: [], headcount: 1, lenses: [], status: "Placeholder",
                      team: "", effort: 0, description: "", order: 0,
                    };
                    setCards((prev) => [...prev, newCard]);
                    apiCreateCard(id, {
                      name: "New Card",
                      start_sprint_id: sprints[0].id,
                      end_sprint_id: sprints[0].id,
                      status: "placeholder",
                    })
                      .then((serverCard) => {
                        const mapped = mapCardFromApi(serverCard);
                        setCards((prev) => prev.map((c) => (c.id === tempId ? mapped : c)));
                        handleCardClick(mapped);
                      })
                      .catch((err) => {
                        console.error(err);
                        setCards((prev) => prev.filter((c) => c.id !== tempId));
                      });
                  }}
                >
                  <Plus size={14} /> Add a card
                </button>
              </div>
            ) : (
              <div className="triage-drawer-cards">
                {triageCards.map((c) => (
                  <div
                    key={c.id}
                    className={`feature-card triage-card${selectedCard && selectedCard.id === c.id ? " selected" : ""}${isDragging && dragCard && dragCard.id === c.id ? " dragging" : ""}`}
                    data-card-id={c.id}
                    onClick={() => !isDragging && !commentMode && handleCardClick(c)}
                    onMouseDown={(e) => {
                      if (commentMode) return;
                      if (e.button !== 0) return;
                      handleDragStart(e, c);
                    }}
                  >
                    <div className="feature-card-name">{c.name}</div>
                    {c.tags.length > 0 && (
                      <div className="feature-card-tags">
                        {c.tags.map((t) => (
                          <span key={t} className="tag" style={tagStyle(t)}>{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="feature-card-footer">
                      {c.lenses.length > 0 && (
                        <div className="feature-card-lenses">
                          {c.lenses.map((color, li) => (
                            <span key={li} className="lens-dot" style={{ background: `var(--${color})` }} />
                          ))}
                        </div>
                      )}
                      <span className="feature-card-headcount"><User size={9} />{c.headcount}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* -- Floating drag ghost -- */}
      {isDragging && dragCard && (
        <div className="feature-card drag-ghost" style={{
          position: "fixed", left: dragPos.x - dragOffset.x, top: dragPos.y - dragOffset.y,
          width: dragSize.w, pointerEvents: "none", zIndex: 1000,
        }}>
          <div className="feature-card-name">{dragCard.name}</div>
          {dragCard.tags.length > 0 && (
            <div className="feature-card-tags">
              {dragCard.tags.map((t) => (<span key={t} className="tag" style={tagStyle(t)}>{t}</span>))}
            </div>
          )}
        </div>
      )}

      {/* -- Side Panel -- */}
      {selectedCard && (
        <SidePanel card={selectedCard} onClose={() => setSelectedCard(null)} onUpdate={handleCardUpdate} onDelete={handleDeleteCard} />
      )}

      {/* -- Version History Panel -- */}
      {showVersionHistory && (
        <VersionHistoryPanel onClose={() => setShowVersionHistory(false)} />
      )}


      {/* -- Row context menu (fixed position, outside scroll container) -- */}
      {rowMenuId && rowMenuPos && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => { setRowMenuId(null); setRowMenuPos(null); }} />
          <div className="dropdown-menu" style={{
            position: "fixed", top: rowMenuPos.top, left: rowMenuPos.left, right: "auto",
            zIndex: 1000, animation: "dropdown-in 150ms ease-out",
          }}>
            <button className="dropdown-item" type="button" onClick={() => { startRowRename(rowMenuId); setRowMenuPos(null); }}>Rename</button>
            <div className="dropdown-divider" />
            <button className="dropdown-item destructive" type="button"
              onClick={() => { handleDeleteRow(rowMenuId); }}>Delete row</button>
          </div>
        </>
      )}

      {/* -- Hover styles -- */}
      <style>{`
        .sprint-edit-hint {
          position: absolute;
          top: 2px;
          right: 3px;
          opacity: 0;
          transition: opacity 150ms ease;
          color: var(--text-muted);
          pointer-events: none;
        }
        .sprint-header:hover .sprint-edit-hint {
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
