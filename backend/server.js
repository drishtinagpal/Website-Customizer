const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const axios = require("axios");

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// Function to get token count using Gemini's tokenizer
const getTokenCount = async (text) => {
  try {
    if (!text) return 0; // Handle empty input

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.countTokens({ contents: [{ parts: [{ text }] }] });

    return response.totalTokens || 0;
  } catch (error) {
    console.error("Error getting token count:", error);
    return 0;
  }
};

// Function to fetch webpage and extract all required data
const fetchWebpageData = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Get the full HTML content
  const html = await page.content();
  await browser.close();

  // Load HTML into Cheerio
  const $ = cheerio.load(html);

  // Extract inline CSS (inside <style> tags)
  let inlineCSS = [];
  $("style").each((_, element) => {
    inlineCSS.push($(element).html());
  });

  // Extract inline JavaScript (inside <script> tags without src attribute)
  let inlineJS = [];
  $("script:not([src])").each((_, element) => {
    inlineJS.push($(element).html());
  });

  // Extract external CSS links
  let externalCSSLinks = [];
  $("link[rel='stylesheet']").each((_, element) => {
    externalCSSLinks.push($(element).attr("href"));
  });

  // Extract external JS links
  let externalJSLinks = [];
  $("script[src]").each((_, element) => {
    externalJSLinks.push($(element).attr("src"));
  });

  // Function to fetch external CSS & JS files
  const fetchExternalFiles = async (links) => {
    let files = {};
    for (let link of links) {
      try {
        if (link.startsWith("//")) link = "https:" + link; // Handle protocol-relative URLs
        if (!link.startsWith("http")) link = new URL(link, url).href; // Convert relative to absolute URL

        const response = await axios.get(link);
        files[link] = response.data;
      } catch (error) {
        console.error("Failed to fetch:", link);
      }
    }
    return files;
  };

  // Fetch external CSS & JS content
  const externalCSS = await fetchExternalFiles(externalCSSLinks);
  const externalJS = await fetchExternalFiles(externalJSLinks);

  // Compute token counts for each part
  const htmlTokenCount = await getTokenCount(html);
  const inlineCSSTokenCount = await getTokenCount(inlineCSS.join("\n"));
  const inlineJSTokenCount = await getTokenCount(inlineJS.join("\n"));
  const externalCSSTokenCount = await getTokenCount(Object.values(externalCSS).join("\n"));
  const externalJSTokenCount = await getTokenCount(Object.values(externalJS).join("\n"));

  console.log("Token Counts:");
  console.log("Full HTML:", htmlTokenCount);
  console.log("Inline CSS:", inlineCSSTokenCount);
  console.log("Inline JS:", inlineJSTokenCount);
  console.log("External CSS:", externalCSSTokenCount);
  console.log("External JS:", externalJSTokenCount);

  return {
    html,         // Full HTML of the webpage
    inlineCSS,    // Inline CSS inside <style> tags
    inlineJS,     // Inline JavaScript inside <script> tags
    externalCSS,  // External CSS file content
    externalJS,   // External JavaScript file content
    tokenCounts: {
      html: htmlTokenCount,
      inlineCSS: inlineCSSTokenCount,
      inlineJS: inlineJSTokenCount,
      externalCSS: externalCSSTokenCount,
      externalJS: externalJSTokenCount,
    },
  };
};





const TOKEN_LIMIT_PER_CHUNK = 400000; // Define token limit per chunk

// Helper function to process the AI response into decision and explanation using regex
const parseAIResponse = async (result) => {
  // Get and clean up the full AI response text
  const rawResponse = await result.response.text();
  // Replace multiple spaces and newlines with a single space, then trim
  const responseText = rawResponse.replace(/[\r\n]+/g, " ").trim();
  console.log("Full AI Response:", responseText);

  // Use a regex to capture the decision and explanation.
  // This regex matches "true" or "false" at the beginning, ignoring extra whitespace,
  // followed by a hyphen, then captures the rest as the explanation.
  const regex = /^(true|false)\s*-\s*(.*)$/i;
  const match = responseText.match(regex);

  if (match) {
    return { decision: match[1].toLowerCase(), explanation: match[2].trim() };
  } else {
    // Fallback: try to see if "true" or "false" appears anywhere.
    if (responseText.toLowerCase().includes("true")) {
      return { decision: "true", explanation: responseText };
    }
    if (responseText.toLowerCase().includes("false")) {
      return { decision: "false", explanation: responseText };
    }
    return { decision: "false", explanation: responseText };
  }
};

// New helper function to generate the modified code snippet with minimal diff details.
// This function strips markdown formatting (e.g., triple backticks) before parsing.
const generateModifiedCode = async (type, currentCode, userCommand, explanation) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `
        You are an AI that takes a snippet of webpage code and an explanation of the required modifications, and outputs only the minimal diff needed to reflect the changes as per the user's request.
        Do not output the entire code snippet—output only the exact portion that needs to be changed. 

        **Content Type:** ${type}
        **Original Code Snippet (relevant portion only):**
        ${currentCode}

        **User Modification Request:**
        "${userCommand}"

        **Modification Explanation:**
        ${explanation}

        Please provide the result in **valid JSON format** with:
        - "modifiedCode": containing only the exact modification that should be applied.
        - "selector": the exact class, tag, or ID that needs to be modified.

        Ensure that the "selector" field is extracted directly from the relevant HTML structure. 

        Response format:
        \`\`\`json
        {
          "modifiedCode": "Your modified code here...",
          "selector": "Your selector here..."
        }
        \`\`\`
        `;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  
  let modifiedCodeText = (await result.response.text()).trim();
  console.log("Modified Code Response:", modifiedCodeText);
  
  // Remove markdown formatting (e.g., triple backticks)
  modifiedCodeText = modifiedCodeText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  
  try {
    return JSON.parse(modifiedCodeText);
  } catch (error) {
    console.error("Error parsing modified code JSON:", error);
    return { modifiedCodeText };
  }
};

const checkModificationNeeded = async (type, content, userCommand) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    // If content is an object, convert it to a string
    let contentStr = typeof content === "object" ? JSON.stringify(content) : content;
    // Get token count for the given content
    const tokenCount = await getTokenCount(contentStr);

    if (tokenCount > TOKEN_LIMIT_PER_CHUNK) {
      console.log(`${type} exceeds token limit. Splitting into chunks...`);

      // Calculate number of chunks
      let numChunks = Math.ceil(tokenCount / TOKEN_LIMIT_PER_CHUNK);
      console.log(`numChunks: ${numChunks}`);

      // Calculate chunk size (improved chunking might be needed)
      let chunkSize = Math.ceil(tokenCount / numChunks);
      console.log(`chunkSize: ${chunkSize}`);

      // Split content into chunks
      let contentChunks = await splitIntoChunks(contentStr, numChunks, tokenCount);
      let modificationResults = [];

      // Process each chunk
      for (let i = 0; i < contentChunks.length; i++) {
        let chunk = contentChunks[i];
        const prompt = `
          You are an AI that analyzes whether a specific section of a webpage requires modification based on a user's instruction. Your task is to compare the content provided below with the user’s request and decide if a change is necessary.

          **Content Type:** ${type}
          **Webpage Section Content:**
          ${chunk}

          **User Modification Request:**
          "${userCommand}"

          Please analyze the content carefully and consider:
          - Whether the content contains elements, attributes, or styles that relate to the user's request.
          - If the user request logically applies to this section.
          - Any indicators within the content that support or contradict the need for a change.

          **Important:** Respond in the exact format:
          - "true - [detailed explanation]" if the section requires modification. (Include which parts of the content match the user request and why.)
          - "false - [detailed explanation]" if no modification is required. (Explain clearly why the section does not apply.)

          Your response must include both the true/false decision and a detailed explanation.
                  `;
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        // Parse the AI response into decision and explanation using the regex-based function
        const { decision, explanation } = await parseAIResponse(result);

        let modifiedCode = null;
        let selector = null;
        // If modifications are needed, generate the exact modified code diff
        if (decision === "true") {
          const modResult = await generateModifiedCode(type, chunk, userCommand, explanation);
          modifiedCode = modResult.modifiedCode || modResult; // in case of error, include raw response
          selector = modResult.selector || null;
        }

        // Save as an object (for each chunk) so that the final API response includes the explanation and modification details if applicable
        modificationResults.push({
          chunk: i + 1,
          decision,
          explanation,
          modifiedCode,
          selector // this field will be null if no modification is required
        });
      }

      console.log(`${type}:`, modificationResults);
      return modificationResults;
    } else {
      // Process normally (if token count is within limit)
      const prompt = `
          You are an AI that analyzes whether a specific section of a webpage requires modification based on a user's instruction. Your task is to compare the content provided below with the user’s request and decide if a change is necessary.

          **Content Type:** ${type}
          **Webpage Section Content:**
          ${contentStr}

          **User Modification Request:**
          "${userCommand}"

          Please analyze the content carefully and consider:
          - Whether the content contains elements, attributes, or styles that relate to the user's request.
          - If the user request logically applies to this section.
          - Any indicators within the content that support or contradict the need for a change.

          **Important:** Respond in the exact format:
          - "true - [detailed explanation]" if the section requires modification. (Include which parts of the content match the user request and why.)
          - "false - [detailed explanation]" if no modification is required. (Explain clearly why the section does not apply.)

          Your response must include both the true/false decision and a detailed explanation.
                `;
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      // Parse the response using the regex-based function
      const { decision, explanation } = await parseAIResponse(result);
      
      let modifiedCode = null;
      let selector = null;
      if (decision === "true") {
        const modResult = await generateModifiedCode(type, contentStr, userCommand, explanation);
        modifiedCode = modResult.modifiedCode || modResult;
        selector = modResult.selector || null;
      }
      
      console.log(`${type}: ${decision} - ${explanation}`);
      return { decision, explanation, modifiedCode ,selector};
    }
  } catch (error) {
    console.error(`Error checking modification for ${type}:`, error);
    return [];
  }
};

// Helper function to split content into `numChunks`
const splitIntoChunks = async (text, numChunks, tokenCount) => {
  let chunkSize = Math.ceil(tokenCount / numChunks);
  console.log(`chunk size: ${chunkSize}`);
  console.log(`type of text: ${typeof(text)}`);
  let chunks = [];
  for (let i = 0; i < numChunks; i++) {
    let start = i * chunkSize;
    let end = start + chunkSize;
    chunks.push(text.slice(start, end));

    // Await the token count before logging
    let per_chunk_size = await getTokenCount(Object.values(chunks[i]).join("\n"));
    console.log(`Each chunk size: ${per_chunk_size}`);
  }
  
  return chunks;
};





app.post("/api/process", async (req, res) => {
  console.log("📥 Received Request Body:", req.body);
  const { webpageLink, userCommand } = req.body;

  if (!webpageLink || !userCommand) {
      console.error("❌ Missing Parameters:", webpageLink, userCommand);
      return res.status(400).json({ error: "Missing required parameters." });
  }

  console.log("✅ Request received correctly. Processing...");

  try {
      const webpageData = await fetchWebpageData(webpageLink);

      const results = {
          html: await checkModificationNeeded("HTML", webpageData.html, userCommand),
          inlineCSS: await checkModificationNeeded("Inline CSS", webpageData.inlineCSS.join("\n"), userCommand),
          inlineJS: await checkModificationNeeded("Inline JS", webpageData.inlineJS.join("\n"), userCommand),
          externalCSS: await checkModificationNeeded("External CSS", Object.values(webpageData.externalCSS).join("\n"), userCommand),
          externalJS: await checkModificationNeeded("External JS", Object.values(webpageData.externalJS).join("\n"), userCommand)
      };

      console.log("✅ Modifications generated:", results);

      res.json({ success: true, modificationsNeeded: results });
  } catch (error) {
      console.error("❌ Error processing request:", error);
      res.status(500).json({ error: "Internal server error" });
  }
});






// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));





