# Design System Specification: The Digital Sentry

## 1. Overview & Creative North Star

### The Creative North Star: "The Digital Sentry"
This design system is built on the concept of **The Digital Sentry** - an authoritative, silent guardian that exists at the intersection of high-security infrastructure and premium editorial design. We are moving away from the "toy-like" aesthetics of consumer web extensions toward a UI that feels like a bespoke high-security console.

**Breaking the Template:**
To achieve a signature look, this system rejects the "flat block" layout. We utilize **intentional asymmetry** and **layered depth** to guide the eye. Information isn't just displayed; it is "protected" within nested containers. We prioritize breathing room (whitespace) and typographic hierarchy over structural lines to create a sense of calm, professional competence.

---

## 2. Colors & Surface Philosophy

The palette is rooted in an obsidian void, utilizing light not just for decoration, but as a functional indicator of security status.

### The Palette (Material Design Tokens)
*   **Background/Surface:** `#131318` (The Obsidian Void)
*   **Primary (Accent):** `#d2bbff` (Text/Icons) | `#7c3aed` (Container/Action)
*   **Success:** `#10b981` (The "Safe" Glow)
*   **Error:** `#ffb4ab` (Text) | `#ef4444` (Indicator)
*   **Warning:** `#f59e0b` (The "Caution" Amber)

### The "No-Line" Rule
**Standard 1px solid borders are strictly prohibited for sectioning.**
Structural boundaries must be defined through:
1.  **Background Color Shifts:** Use `surface-container-low` against `surface` to define a sidebar.
2.  **Tonal Transitions:** Use a 10% opacity difference between nested elements.
3.  **Negative Space:** Use the Spacing Scale (`8` or `10`) to separate logical groups.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of frosted obsidian sheets.
*   **Base:** `surface` (#131318) - The foundation.
*   **Level 1:** `surface-container-low` (#1b1b20) - Subtle groupings.
*   **Level 2:** `surface-container-high` (#2a292f) - Interactive cards or focused content.
*   **Floating:** `surface-bright` (#39383e) with `backdrop-blur` - Menus and Tooltips.

### The "Glass & Gradient" Rule
For hero elements or security status headers, use a **Radial Gradient**.
*   *Direction:* From `primary_container` (#7c3aed) at 15% opacity to `transparent`.
*   *Effect:* Creates a subtle "soul" or glow behind high-priority data points.

---

## 3. Typography: The Authoritative Voice

We use **Inter** exclusively. Its neutrality allows the "Sentry" personality to come from scale and weight rather than decorative flourishes.

| Role | Token | Size | Weight | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-md` | 2.75rem | 700 | Security scores or high-impact metrics. |
| **Headline** | `headline-sm` | 1.5rem | 600 | Major section headers. |
| **Title** | `title-md` | 1.125rem | 500 | Card titles and primary navigation. |
| **Body** | `body-md` | 0.875rem | 400 | General information and descriptions. |
| **Label** | `label-md` | 0.75rem | 600 (Caps) | Metadata, status tags, and overlines. |

**Editorial Note:** Use `label-md` with `0.05em` letter-spacing for all-caps "Security Overlines" to establish an authoritative, technical tone.

---

## 4. Elevation & Depth

### The Layering Principle
Do not use shadows to create "pop." Use **Tonal Layering**. A `surface-container-highest` card sitting on a `surface-dim` background provides enough contrast to be perceived as elevated without visual clutter.

### Ambient Shadows & Glows
When an element must float (e.g., a critical alert or dropdown):
*   **Shadow:** 0px 12px 32px rgba(0, 0, 0, 0.4).
*   **Glow:** For status indicators, use a 4px blur of the status color (e.g., `#10b981`) at 30% opacity behind the icon.

### The "Ghost Border" Fallback
If contrast testing requires a boundary, use a **Ghost Border**:
*   **Stroke:** 1px solid.
*   **Color:** `outline-variant` (#4a4455) at **15% opacity**.
*   It should be felt, not seen.

---

## 5. Components

### Buttons
*   **Primary:** Background `primary_container` (#7c3aed), Text `on_primary_container`. High-gloss finish: A subtle top-to-bottom gradient (5% lighter at the top).
*   **Tertiary:** No background. Text `primary`. Use `1.5` spacing for padding.
*   **Shape:** `md` (0.375rem) for a professional, engineered feel. Avoid `full` (pill) shapes unless they are status chips.

### Chips (Security Tags)
*   Used for status (e.g., "ENCRYPTED", "THREAT DETECTED").
*   **Style:** `surface-container-highest` background with a 1px `Ghost Border` in the status color (Success/Danger).

### Input Fields
*   **Background:** `surface-container-lowest` (#0e0e13).
*   **Focus State:** No thick border. Use a 1px `primary` Ghost Border and a soft `primary` outer glow (2px blur).

### Cards & Lists
*   **Strict Rule:** No dividers. Use `Spacing: 4` (1rem) between list items.
*   **Interactive State:** On hover, shift the background from `surface-container-low` to `surface-container-high`.

### The Security Pulse (Unique Component)
A small, 8px circle using `success` green. Apply a CSS animation "pulse" (scaling from 1.0 to 1.4 at 0.2 opacity) to indicate the extension is actively monitoring.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical layouts. Align a headline to the left and a status metric to the extreme right to create tension and visual interest.
*   **Do** use `backdrop-filter: blur(12px)` on all floating overlays.
*   **Do** prioritize high contrast (WCAG AAA) for text against obsidian backgrounds.

### Don't:
*   **Don't** use pure white (#FFFFFF). Use `on_surface` (#e4e1e9) to prevent eye strain in dark environments.
*   **Don't** use standard 1px #000000 shadows. They look "cheap" on deep obsidian.
*   **Don't** use deceptive patterns (dark patterns). If an action is destructive, use `danger` red clearly and provide a confirmation step.
*   **Don't** use "bouncy" or "playful" animations. Use linear or "expressive-decelerate" easing for a precise, mechanical feel.
