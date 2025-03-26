chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📩 Received message:", message);

    if (message.action === "apply_modifications") {
        console.log("🌍 Processing modifications for:", message.websiteUrl);
        injectScript(message.websiteUrl, message.userCommand, sendResponse);
        return true; // ✅ Ensure async response
    }
});

function findActiveTab(callback, retries = 3) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
            console.log("✅ Active tab found:", tabs[0].id);
            callback(tabs[0].id);
        } else if (retries > 0) {
            console.warn(`⚠️ No active tab found. Retrying... (${retries} attempts left)`);
            setTimeout(() => findActiveTab(callback, retries - 1), 200); // Retry after 200ms
        } else {
            console.error("❌ No active tab found after retries.");
            callback(null);
        }
    });
}

async function injectScript(websiteUrl, userCommand, sendResponse) {
    try {
        console.log("🔄 Sending request to server...");

        const response = await fetch("http://localhost:5000/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ webpageLink: websiteUrl, userCommand }),
        });

        if (!response.ok) {
            console.error("❌ Failed to fetch modifications from server.");
            sendResponse({ status: "❌ Server error" });
            return;
        }

        const data = await response.json();
        console.log("📥 Modifications received:", data);

        if (!data.success || !data.modificationsNeeded || Object.keys(data.modificationsNeeded).length === 0) {
            console.warn("ℹ️ No modifications needed.");
            sendResponse({ status: "ℹ️ No modifications required." });
            return;
        }

        console.log("📤 Preparing to send modifications to content.js...");

        findActiveTab((tabId) => {
            if (!tabId) {
                console.error("❌ No active tab found. Aborting modification.");
                sendResponse({ status: "❌ No active tab found." });
                return;
            }

            console.log("✅ Active tab found:", tabId);

            chrome.scripting.executeScript(
                {
                    target: { tabId: tabId },
                    files: ["content.js"],
                },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error("❌ Failed to inject content.js:", chrome.runtime.lastError.message);
                        sendResponse({ status: "❌ Failed to inject content.js" });
                    } else {
                        console.log("✅ Injected content.js");
                        setTimeout(() => {
                            sendModifications(tabId, data.modificationsNeeded, sendResponse);
                        }, 200);
                    }
                }
            );
        });
    } catch (error) {
        console.error("❌ Error fetching modifications:", error);
        sendResponse({ status: "❌ Unexpected error" });
    }
}

function sendModifications(tabId, modificationsNeeded, sendResponse) {
    if (!tabId || typeof tabId !== "number") {
        console.error("❌ Invalid tabId:", tabId);
        sendResponse({ status: "❌ Invalid tabId" });
        return;
    }

    if (!modificationsNeeded || typeof modificationsNeeded !== "object" || Object.keys(modificationsNeeded).length === 0) {
        console.error("❌ Invalid modificationsNeeded data:", modificationsNeeded);
        sendResponse({ status: "❌ Invalid modifications data" });
        return;
    }

    console.log("📨 Sending modifications to tab:", tabId, modificationsNeeded);

    chrome.tabs.sendMessage(tabId, { action: "modify_page", modificationsNeeded: modificationsNeeded }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("❌ Error sending message to content script:", chrome.runtime.lastError.message);
            sendResponse({ status: "❌ Error communicating with content script" });
        } else if (!response) {
            console.error("❌ No response received from content script.");
            sendResponse({ status: "❌ No response received from content script" });
        } else {
            console.log("📨 Modifications sent successfully:", response);
            sendResponse({ status: "✅ Modifications applied" });
        }
    });
}
