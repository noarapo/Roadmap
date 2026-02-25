import React, { useState, useEffect } from "react";
import { GitBranch, Users, Tag, ExternalLink, Plus, ChevronLeft, ChevronRight, Zap, FileText, Circle, Calendar, Clock, Hash, Type, List, Link, CheckSquare } from "lucide-react";

const FIELD_TYPE_ICONS = { text: Type, number: Hash, select: List, multi_select: List, date: Calendar, date_range: Calendar, url: Link, checkbox: CheckSquare };

const HUBSPOT_OBJECT_TYPES = [
  { key: "deals", label: "Deals" },
  { key: "tickets", label: "Tickets" },
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "Contacts" },
];

/**
 * DrawerPreview — live preview that mirrors the WorkspaceEditor configuration.
 * Shows tabs for all connected integrations (matching what the editor configures).
 *
 * Props:
 *   statuses — array of { name, color }
 *   customFields — array of custom field definitions
 *   builtinFields — array of { name, builtin, visible }
 *   connectedIntegrations — Set of integration names ("HubSpot", "Linear", "Notion")
 *   hubspotRecordTypes — Set of record type keys (optional)
 *   sections — array of { name, fields: [...] } (optional, for grouped fields)
 */
export default function DrawerPreview({
  statuses = [],
  customFields = [],
  builtinFields = [],
  connectedIntegrations = new Set(),
  hubspotRecordTypes = new Set(["companies", "deals"]),
  sections = [],
}) {
  const [integrationTabs, setIntegrationTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("details");

  // Derive tabs from connected integrations (mirrors editor config)
  useEffect(() => {
    const tabs = [];
    if (connectedIntegrations.has("HubSpot")) tabs.push({ key: "hubspot", label: "HubSpot", provider: "hubspot" });
    if (connectedIntegrations.has("Linear")) tabs.push({ key: "linear", label: "Linear", provider: "linear" });
    if (connectedIntegrations.has("Notion")) tabs.push({ key: "notion", label: "Notion", provider: "notion" });
    setIntegrationTabs(tabs);
    // Reset to details if active tab's integration was disconnected
    if (tabs.length === 0) setActiveTab("details");
  }, [connectedIntegrations]);

  const visibleBuiltins = builtinFields.filter((f) => f.visible);
  const visibleCustom = customFields.filter((f) => f.visible);

  return (
    <div className="ob-drawer-preview">
      <div className="ob-drawer-card">
        <div className="ob-drawer-header">
          <span className="ob-drawer-title">Feature Preview</span>
        </div>

        {/* Tab bar — shows when any integration is connected */}
        {integrationTabs.length > 0 && (() => {
          const allTabs = [{ key: "details", label: "Details" }, ...integrationTabs];
          const showArrows = allTabs.length > 4;
          return (
            <div className="ob-drawer-tabs">
              {showArrows && (
                <button type="button" className="ob-drawer-tabs-arrow" onClick={() => {
                  const el = document.querySelector(".ob-drawer-tabs-inner");
                  if (el) el.scrollBy({ left: -80, behavior: "smooth" });
                }}><ChevronLeft size={12} /></button>
              )}
              <div className="ob-drawer-tabs-inner">
                {allTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`ob-drawer-tab${activeTab === tab.key ? " active" : ""}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.key === "hubspot" && <Zap size={10} />}
                    {tab.key === "linear" && <GitBranch size={10} />}
                    {tab.key === "notion" && <FileText size={10} />}
                    {tab.label}
                  </button>
                ))}
              </div>
              {showArrows && (
                <button type="button" className="ob-drawer-tabs-arrow" onClick={() => {
                  const el = document.querySelector(".ob-drawer-tabs-inner");
                  if (el) el.scrollBy({ left: 80, behavior: "smooth" });
                }}><ChevronRight size={12} /></button>
              )}
            </div>
          );
        })()}

        {/* ---- Details tab ---- */}
        {activeTab === "details" && (
          <div className="ob-drawer-fields">
            {/* Builtin fields */}
            {visibleBuiltins.map((f) => (
              <div key={f.name} className="ob-drawer-field">
                {f.name === "Teams" ? (
                  <>
                    <span className="ob-drawer-field-label"><Users size={10} className="ob-drawer-field-icon" />{f.name}</span>
                    <span className="ob-drawer-field-value ob-drawer-field-placeholder">
                      <button className="ob-drawer-add-btn" type="button"><Plus size={9} /> Add team</button>
                    </span>
                  </>
                ) : f.name === "Tags" ? (
                  <>
                    <span className="ob-drawer-field-label"><Tag size={10} className="ob-drawer-field-icon" />{f.name}</span>
                    <span className="ob-drawer-field-value ob-drawer-field-placeholder">
                      <button className="ob-drawer-add-btn" type="button"><Plus size={9} /></button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="ob-drawer-field-label">
                      {f.name === "Status" && <Circle size={10} className="ob-drawer-field-icon" />}
                      {f.name === "Sprint" && <Calendar size={10} className="ob-drawer-field-icon" />}
                      {f.name === "Duration" && <Clock size={10} className="ob-drawer-field-icon" />}
                      {f.name}
                    </span>
                    <span className="ob-drawer-field-value ob-drawer-field-placeholder">
                      {f.name === "Status" && statuses.length > 0 ? (
                        <span className="ob-drawer-status-pill" style={{ background: statuses[0].color + "22", color: statuses[0].color, borderColor: statuses[0].color }}>
                          {statuses[0].name || "Status"}
                        </span>
                      ) : f.name === "Duration" ? (
                        "1 sprint"
                      ) : f.name === "Sprint" ? (
                        "\u2014"
                      ) : (
                        "Not set"
                      )}
                    </span>
                  </>
                )}
              </div>
            ))}

            {/* Custom fields */}
            {visibleCustom.map((f, i) => (
              <div key={`cf-${i}`} className="ob-drawer-field">
                <span className="ob-drawer-field-label">
                  {React.createElement(FIELD_TYPE_ICONS[f.field_type] || Type, { size: 10, className: "ob-drawer-field-icon" })}
                  {f.name || "Untitled"}
                </span>
                <span className="ob-drawer-field-value ob-drawer-field-placeholder">
                  {f.field_type === "select" && f.options?.length > 0
                    ? f.options[0]
                    : f.field_type === "number"
                    ? "0"
                    : f.field_type === "checkbox"
                    ? "No"
                    : "Not set"}
                </span>
              </div>
            ))}

            {/* Sections (onboarding only) */}
            {sections.map((section, si) => (
              <React.Fragment key={`section-${si}`}>
                <div className="ob-drawer-section-divider">
                  <span className="ob-drawer-section-label">{section.name || "Untitled Section"}</span>
                </div>
                {section.fields.filter((f) => f.visible).map((f, fi) => (
                  <div key={fi} className="ob-drawer-field">
                    <span className="ob-drawer-field-label">
                      {React.createElement(FIELD_TYPE_ICONS[f.field_type] || Type, { size: 10, className: "ob-drawer-field-icon" })}
                      {f.name || "Untitled"}
                    </span>
                    <span className="ob-drawer-field-value ob-drawer-field-placeholder">
                      {f.field_type === "number" ? "0" : f.field_type === "checkbox" ? "No" : "Not set"}
                    </span>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ---- Integration tab content ---- */}
        {activeTab !== "details" && (() => {
          const tab = integrationTabs.find((t) => t.key === activeTab);
          if (!tab) return null;
          return (
            <div className="ob-drawer-tab-content">
              {tab.provider === "hubspot" && (() => {
                const checkedTypes = HUBSPOT_OBJECT_TYPES.filter((o) => hubspotRecordTypes.has(o.key)).map((o) => o.label);
                return (
                  <div className="ob-drawer-integration-preview">
                    <div className="ob-drawer-integration-icon hubspot">HS</div>
                    <div className="ob-drawer-integration-info">
                      <p className="ob-drawer-integration-title">HubSpot Records</p>
                      <p className="ob-drawer-integration-desc">
                        {checkedTypes.length > 0 ? checkedTypes.join(", ") : "No record types selected"}
                      </p>
                    </div>
                  </div>
                );
              })()}
              {tab.provider === "linear" && (
                <div className="ob-drawer-linear-tab">
                  <div className="ob-drawer-linear-push">
                    <GitBranch size={20} className="ob-drawer-linear-icon" />
                    <p className="ob-drawer-linear-title">Push to Linear</p>
                    <p className="ob-drawer-linear-desc">
                      Create a Linear issue from this card to track it in your engineering workflow.
                    </p>
                    <button className="ob-drawer-linear-btn" type="button">
                      <GitBranch size={11} /> Push to Linear
                    </button>
                  </div>
                </div>
              )}
              {tab.provider === "notion" && (
                <div className="ob-drawer-integration-preview">
                  <div className="ob-drawer-integration-icon notion">NT</div>
                  <div className="ob-drawer-integration-info">
                    <p className="ob-drawer-integration-title">Notion Documents</p>
                    <p className="ob-drawer-integration-desc">
                      Linked Notion pages and databases will appear here with live previews.
                    </p>
                  </div>
                  <div className="ob-drawer-integration-sample">
                    <div className="ob-drawer-field">
                      <span className="ob-drawer-field-label">Linked Page</span>
                      <span className="ob-drawer-field-value ob-drawer-field-placeholder">No page linked</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
