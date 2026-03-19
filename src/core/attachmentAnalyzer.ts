import type { AttachmentInfo, AttachmentAnalysis } from "./types";

/** Extensions that are directly executable on Windows/Linux/macOS */
const DANGEROUS_EXECUTABLES = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".msi",
  ".application", ".gadget", ".hta", ".cpl", ".msc", ".inf",
  ".reg", ".vb", ".vbe", ".ws", ".wsh", ".wsf",
]);

/** Script files - often used in phishing payloads */
const SCRIPT_EXTENSIONS = new Set([
  ".ps1", ".psm1", ".psd1",   // PowerShell
  ".vbs", ".vbe",              // VBScript
  ".js", ".jse",               // JScript
  ".jar", ".class",            // Java
  ".sh", ".bash", ".zsh",     // Shell
  ".py", ".rb", ".pl",        // Python / Ruby / Perl
  ".php",                      // PHP
]);

/** Macro-enabled Office formats */
const MACRO_EXTENSIONS = new Set([
  ".xlsm", ".xlsb", ".xltm", ".xlam", ".xla",  // Excel macros
  ".docm", ".dotm", ".docb",                     // Word macros
  ".pptm", ".potm", ".ppam", ".ppsm",            // PowerPoint macros
]);

/** Unicode bidirectional override characters used to spoof filenames */
const RTL_CHARS = [
  "\u202E",  // RIGHT-TO-LEFT OVERRIDE (most common in attacks)
  "\u202D",  // LEFT-TO-RIGHT OVERRIDE
  "\u200F",  // RIGHT-TO-LEFT MARK
  "\u200E",  // LEFT-TO-RIGHT MARK
  "\u202C",  // POP DIRECTIONAL FORMATTING
  "\u2067",  // RIGHT-TO-LEFT ISOLATE
  "\u2066",  // LEFT-TO-RIGHT ISOLATE
  "\u061C",  // ARABIC LETTER MARK
];

/** Analyze a list of attachments for suspicious signals */
export function analyzeAttachments(attachments: AttachmentInfo[]): AttachmentAnalysis {
  const dangerousExecutables: string[] = [];
  const scriptFiles: string[] = [];
  const macroFiles: string[] = [];
  const doubleExtensions: string[] = [];
  const rtlTricks: string[] = [];

  for (const { filename } of attachments) {
    // RTL override trick - check before extension parsing
    if (RTL_CHARS.some((c) => filename.includes(c))) {
      rtlTricks.push(filename);
      continue; // already flagged, skip other checks
    }

    const ext = getExtension(filename);
    if (!ext) continue;

    // Double extension: document.pdf.exe - last ext is dangerous, penultimate also has ext
    if (isDoubleExtension(filename, ext)) {
      doubleExtensions.push(filename);
    }

    if (DANGEROUS_EXECUTABLES.has(ext)) {
      dangerousExecutables.push(filename);
    } else if (SCRIPT_EXTENSIONS.has(ext)) {
      scriptFiles.push(filename);
    } else if (MACRO_EXTENSIONS.has(ext)) {
      macroFiles.push(filename);
    }
  }

  return {
    attachments,
    dangerousExecutables,
    scriptFiles,
    macroFiles,
    doubleExtensions,
    rtlTricks,
  };
}

/** Return true if the empty attachment analysis object (no signals) */
export function emptyAttachmentAnalysis(): AttachmentAnalysis {
  return {
    attachments: [],
    dangerousExecutables: [],
    scriptFiles: [],
    macroFiles: [],
    doubleExtensions: [],
    rtlTricks: [],
  };
}

/** Extract the lowercase file extension including the dot (e.g. ".exe") */
function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return "";
  return filename.slice(dot).toLowerCase();
}

/** Return true if filename has two extensions and the outer one is dangerous or script.
 *  e.g. "invoice.pdf.exe" → penultimate ext ".pdf", final ext ".exe" (dangerous) */
function isDoubleExtension(filename: string, outerExt: string): boolean {
  if (!DANGEROUS_EXECUTABLES.has(outerExt) && !SCRIPT_EXTENSIONS.has(outerExt)) return false;

  // Strip outer extension and check if there's still an extension
  const withoutOuter = filename.slice(0, filename.length - outerExt.length);
  const innerDot = withoutOuter.lastIndexOf(".");
  return innerDot > 0; // there's a preceding extension
}
