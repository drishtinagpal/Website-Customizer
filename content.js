chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📩 Modification request received in content.js:", message);

    if (message.action === "modify_page") {
        if (!message.modificationsNeeded || Object.keys(message.modificationsNeeded).length === 0) {
            console.warn("⚠️ No modifications received.");
            sendResponse({ status: "⚠️ No modifications applied." });
            return;
        }

        applyModifications(message.modificationsNeeded);

        setTimeout(() => {
            console.log("✅ Sending success response from content.js");
            sendResponse({ status: "✅ Modifications applied" });
        }, 100);

        return true;
    }
});

function applyModifications(data) {
    let appliedSelectors = new Set();

    Object.entries(data).forEach(([type, modifications]) => {
        if (!modifications) {
            console.log(`❌ No modifications needed for ${type}`);
            return;
        }

        modifications = Array.isArray(modifications) ? modifications : [modifications];

        modifications.forEach(mod => {
            const { decision, explanation, modifiedCode, selector } = mod;

            if (decision !== "true" || !modifiedCode || !selector) {
                console.log(`ℹ️ Skipping ${type}: ${explanation}`);
                return;
            }

            console.log(`✅ Applying modification to ${type}: ${explanation}`);

            if (appliedSelectors.has(selector) && selector !== "body") {
                console.warn(`⚠️ Skipping duplicate modification for selector: ${selector}`);
                return;
            }
            appliedSelectors.add(selector);

            if (document.styleSheets.length === 0) {
                let globalStyle = document.createElement("style");
                document.head.appendChild(globalStyle);
            }
            let styleSheet = document.styleSheets[document.styleSheets.length - 1];
            styleSheet.insertRule(`:root ${selector} { ${modifiedCode} !important; }`, styleSheet.cssRules.length);

            if (type === "inlineJS" && typeof modifiedCode === "string") {
                console.log(`⚡ Injecting Inline JS for ${selector}`);
                document.querySelectorAll(selector).forEach(element => {
                    element.setAttribute("onClick", modifiedCode);
                });
            }

            if (type === "externalCSS" && modifiedCode) {
                console.log("🎨 Injecting external CSS...");
                let styleTag = document.createElement("style");
                styleTag.innerHTML = modifiedCode;
                document.head.appendChild(styleTag);
            }

            if (type === "externalJS" && modifiedCode) {
                console.log("⚡ Injecting external JS...");
                let scriptTag = document.createElement("script");
                scriptTag.innerHTML = modifiedCode;
                document.body.appendChild(scriptTag);
            }
        });
    });

    console.log("🎉 All modifications applied successfully!");

    const observer = new MutationObserver(() => {
        console.log("🔄 Detected page changes, reapplying modifications...");
        setTimeout(() => applyModifications(data), 50);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

