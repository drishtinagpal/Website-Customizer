// Auto-fill the active tab URL
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
        document.getElementById("websiteUrl").value = tabs[0].url;
    }
});

// Event listener for applyChanges button
document.getElementById("applyChanges").addEventListener("click", async () => {
    const websiteUrl = document.getElementById("websiteUrl").value.trim();
    const userCommand = document.getElementById("userCommand").value.trim();

    if (!websiteUrl || !userCommand) {
        alert("⚠️ Please enter both the website URL and the modification command.");
        return;
    }

    console.log("🌍 Website URL:", websiteUrl);
    console.log("📝 User Command:", userCommand);

    // Show a loading indicator instead of closing immediately
    const applyBtn = document.getElementById("applyChanges");
    applyBtn.innerText = "⏳ Processing...";
    applyBtn.disabled = true;

    // Send message to background script
    chrome.runtime.sendMessage(
        { action: "apply_modifications", websiteUrl, userCommand },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error("❌ Runtime error:", chrome.runtime.lastError.message);
                alert("❌ An error occurred. Please try again.");
            } else {
                console.log("✅ Response from background:", response);
                alert("✅ Modification request sent! Changes will be applied shortly.");
            }

            // Reset button text after processing
            applyBtn.innerText = "🚀 Apply Changes";
            applyBtn.disabled = false;
        }
    );
});
