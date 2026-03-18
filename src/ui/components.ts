import type { ScoringResult } from "../core/types";

/** Render the result card HTML for inline display in Gmail */
export function renderResultCard(result: ScoringResult): string {
  const levelClass = `iris-card-${result.level}`;
  const scoreClass = `iris-score-${result.level}`;

  const levelLabels = {
    safe: "Very likely legitimate",
    uncertain: "Review carefully",
    dangerous: "Very likely phishing",
  };

  const signalsHtml =
    result.signals.length > 0
      ? `
    <div class="iris-card-signals">
      <button class="iris-card-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.textContent = this.textContent === 'Show details' ? 'Hide details' : 'Show details'">Show details</button>
      <ul style="display:none;">
        ${result.signals.map((s) => `<li>${escapeHtml(s.detail)} (${s.points > 0 ? "+" : ""}${s.points})</li>`).join("")}
      </ul>
    </div>`
      : "";

  return `
    <div class="iris-card ${levelClass}">
      <div class="iris-card-header">
        <span class="iris-score-badge ${scoreClass}">${result.score}</span>
        <span class="iris-card-title">${levelLabels[result.level]}</span>
      </div>
      <div class="iris-card-explanation">${escapeHtml(result.explanation)}</div>
      ${signalsHtml}
      <div class="iris-card-footer">Checked by nicodAImus iris</div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  const div = typeof document !== "undefined" ? document.createElement("div") : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  // Fallback for non-browser environments (tests)
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
