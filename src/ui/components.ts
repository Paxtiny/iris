import type { ScoringResult } from "../core/types";

/** Create the result card as a DOM element (avoids inline event handlers blocked by CSP) */
export function createResultCardElement(result: ScoringResult): HTMLElement {
  const levelClass = `iris-card-${result.level}`;
  const scoreClass = `iris-score-${result.level}`;

  const levelLabels = {
    safe: "Very likely legitimate",
    uncertain: "Review carefully",
    dangerous: "Very likely phishing",
  };

  const card = document.createElement("div");
  card.className = `iris-card ${levelClass}`;

  // Threat level label
  const levelLabel = document.createElement("div");
  levelLabel.className = "iris-card-level-label";
  levelLabel.textContent = "Threat Level";
  card.appendChild(levelLabel);

  // Header with score badge
  const header = document.createElement("div");
  header.className = "iris-card-header";
  const title = document.createElement("span");
  title.className = "iris-card-title";
  title.textContent = levelLabels[result.level];
  const badge = document.createElement("span");
  badge.className = `iris-score-badge ${scoreClass}`;
  badge.textContent = String(result.score);
  header.appendChild(title);
  header.appendChild(badge);
  card.appendChild(header);

  // Explanation
  const explanation = document.createElement("div");
  explanation.className = "iris-card-explanation";
  explanation.textContent = result.explanation;
  card.appendChild(explanation);

  // Signals (expandable via native <details> - immune to Gmail's event interception)
  if (result.signals.length > 0) {
    const details = document.createElement("details");
    details.className = "iris-card-signals";

    const summary = document.createElement("summary");
    summary.className = "iris-card-toggle";
    summary.textContent = "Analysis Signals";
    details.appendChild(summary);

    const list = document.createElement("ul");
    for (const signal of result.signals) {
      const li = document.createElement("li");
      const textSpan = document.createElement("span");
      textSpan.className = "iris-signal-text";
      textSpan.textContent = signal.detail;
      const scoreSpan = document.createElement("span");
      scoreSpan.className = "iris-signal-score";
      scoreSpan.textContent = `${signal.points > 0 ? "+" : ""}${signal.points}`;
      li.appendChild(textSpan);
      li.appendChild(scoreSpan);
      list.appendChild(li);
    }
    details.appendChild(list);

    card.appendChild(details);
  }

  // Footer
  const footer = document.createElement("div");
  footer.className = "iris-card-footer";
  footer.textContent = "Checked by nicodAImus iris";
  card.appendChild(footer);

  return card;
}

/** Render the result card as an HTML string (for popup / non-Gmail contexts) */
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
      <button class="iris-card-toggle">Analysis Signals</button>
      <ul style="display:none;">
        ${result.signals.map((s) => `<li><span class="iris-signal-text">${escapeHtml(s.detail)}</span><span class="iris-signal-score">${s.points > 0 ? "+" : ""}${s.points}</span></li>`).join("")}
      </ul>
    </div>`
      : "";

  return `
    <div class="iris-card ${levelClass}">
      <div class="iris-card-level-label">Threat Level</div>
      <div class="iris-card-header">
        <span class="iris-card-title">${levelLabels[result.level]}</span>
        <span class="iris-score-badge ${scoreClass}">${result.score}</span>
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
