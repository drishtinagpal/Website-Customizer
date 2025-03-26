// content.js (Updated to Ensure CSS is Injected Correctly)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📩 Modification request received in content.js:", message);

    if (message.action === "modify_page") {
        if (!message.modificationsNeeded || Object.keys(message.modificationsNeeded).length === 0) {
            console.warn("⚠️ No modifications received.");
            sendResponse({ status: "⚠️ No modifications applied." });
            return;
        }

        applyModifications(message.modificationsNeeded);
        saveModificationsToStorage(message.modificationsNeeded); // 🔥 Save modifications for persistence

        setTimeout(() => {
            console.log("✅ Sending success response from content.js");
            sendResponse({ status: "✅ Modifications applied" });
        }, 100);

        return true;
    }
});

function applyModifications(modifications) {
    if (!modifications || typeof modifications !== 'object') return;

    // Extract relevant modifications where decision is true
    for (const [key, mod] of Object.entries(modifications)) {
        if (mod.decision === "true" && mod.selector && mod.modifiedCode) {
            applyChange(mod.selector, mod.modifiedCode, key);
        }
    }
}

// Function to modify elements dynamically
function applyChange(selector, modifiedCode, type) {
    if (!selector || !modifiedCode) return;

    switch (type) {
        case "html":
            document.querySelectorAll(selector).forEach(el => {
                el.style.cssText += modifiedCode; // Apply new styles
            });
            break;

        case "externalCSS":
        case "inlineCSS":
            addStyle(modifiedCode);
            break;

        case "externalJS":
        case "inlineJS":
            addScript(modifiedCode);
            break;
    }
}

// Function to inject CSS dynamically
function addStyle(cssCode) {
    let styleTag = document.createElement("style");
    styleTag.textContent = cssCode;
    document.head.appendChild(styleTag);
}

// Function to inject JS dynamically
function addScript(jsCode) {
    let scriptTag = document.createElement("script");
    scriptTag.textContent = jsCode;
    document.body.appendChild(scriptTag);
}

// 🔥 Save modifications so they persist even after page reload
function saveModificationsToStorage(modifications) {
    chrome.storage.local.set({ savedModifications: modifications }, () => {
        console.log("💾 Modifications saved to storage.");
    });
}

// 🔥 Reapply modifications when the page is loaded again
window.addEventListener("load", () => {
    chrome.storage.local.get("savedModifications", (data) => {
        if (data.savedModifications) {
            console.log("♻️ Reapplying saved modifications...");
            applyModifications(data.savedModifications);
        }
    });
});
