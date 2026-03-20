import type { ScoringResult } from "../core/types";

/** SVG ring score badge - arc fills based on score (0-10) */
function createScoreRingSvg(score: number, level: "safe" | "uncertain" | "dangerous"): string {
  const colors = {
    safe: { ring: "#10b981", glow: "rgba(16,185,129,0.3)" },
    uncertain: { ring: "#f59e0b", glow: "rgba(245,158,11,0.3)" },
    dangerous: { ring: "#ef4444", glow: "rgba(239,68,68,0.3)" },
  };
  const { ring, glow } = colors[level];
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score / 10, 1);
  const dashOffset = circumference * (1 - progress);

  return `<svg class="iris-score-ring" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2.5"/>
    <circle cx="22" cy="22" r="${radius}" fill="none" stroke="${ring}" stroke-width="2.5"
      stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
      stroke-linecap="round" transform="rotate(-90 22 22)"
      style="filter: drop-shadow(0 0 4px ${glow}); transition: stroke-dashoffset 0.6s ease;"/>
    <text x="22" y="22" text-anchor="middle" dominant-baseline="central"
      fill="${ring}" font-size="16" font-weight="700" font-family="Inter, system-ui, sans-serif">${score}</text>
  </svg>`;
}

/** Create the result card as a DOM element (avoids inline event handlers blocked by CSP) */
export function createResultCardElement(result: ScoringResult): HTMLElement {
  const levelClass = `iris-card-${result.level}`;

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

  // Header with title and SVG ring badge
  const header = document.createElement("div");
  header.className = "iris-card-header";
  const title = document.createElement("span");
  title.className = "iris-card-title";
  title.textContent = levelLabels[result.level];
  header.appendChild(title);
  const badgeWrapper = document.createElement("span");
  badgeWrapper.innerHTML = createScoreRingSvg(result.score, result.level);
  header.appendChild(badgeWrapper);
  card.appendChild(header);

  // "Verified Sender" chip for safe results with score 0
  if (result.level === "safe" && result.score === 0) {
    const chip = document.createElement("div");
    chip.className = "iris-verified-chip";
    chip.innerHTML = `<span class="iris-verified-icon">\u2714</span> Verified Sender`;
    card.appendChild(chip);
  }

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

  const levelLabels = {
    safe: "Very likely legitimate",
    uncertain: "Review carefully",
    dangerous: "Very likely phishing",
  };

  const verifiedChip = result.level === "safe" && result.score === 0
    ? `<div class="iris-verified-chip"><span class="iris-verified-icon">\u2714</span> Verified Sender</div>`
    : "";

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
        ${createScoreRingSvg(result.score, result.level)}
      </div>
      ${verifiedChip}
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
