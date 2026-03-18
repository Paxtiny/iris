// nicodAImus iris - Popup fallback
// Communicates with the content script on the active Gmail tab

document.addEventListener("DOMContentLoaded", () => {
  const checkBtn = document.getElementById("iris-check-btn");
  const resultDiv = document.getElementById("iris-popup-result");
  const hintDiv = document.querySelector(".iris-popup-hint");

  if (!checkBtn || !resultDiv) return;

  checkBtn.addEventListener("click", async () => {
    checkBtn.textContent = "Checking...";
    checkBtn.setAttribute("disabled", "true");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id || !tab.url?.includes("mail.google.com")) {
        resultDiv.innerHTML =
          '<p class="iris-error">Please open a Gmail email first.</p>';
        resultDiv.style.display = "block";
        checkBtn.textContent = "Check Current Email";
        checkBtn.removeAttribute("disabled");
        return;
      }

      // Send message to content script to trigger analysis
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "iris-check",
      });

      if (response?.html) {
        resultDiv.innerHTML = response.html;
        resultDiv.style.display = "block";
        if (hintDiv) (hintDiv as HTMLElement).style.display = "none";
      } else {
        resultDiv.innerHTML =
          '<p class="iris-error">Could not analyze this email. Make sure you have an email open.</p>';
        resultDiv.style.display = "block";
      }
    } catch {
      resultDiv.innerHTML =
        '<p class="iris-error">Could not connect to Gmail tab. Try refreshing the page.</p>';
      resultDiv.style.display = "block";
    }

    checkBtn.textContent = "Check Again";
    checkBtn.removeAttribute("disabled");
  });
});
