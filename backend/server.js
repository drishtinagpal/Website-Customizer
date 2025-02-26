const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// Function to fetch entire webpage HTML
const fetchWebpageContent = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  pageContent = await page.content(); // Fetch full HTML
  await browser.close();
  return pageContent;
  
};


// Function to convert webpage HTML into JSON format
const convertHTMLToJSON = async (html) => {
  const prompt = `
    Convert the following HTML into a structured JSON format that represents the full webpage structure.

    HTML:
    ${html.substring(0, 3000)}

    Provide only valid JSON output.
  `;

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
const jsonMatch = rawText.match(/\{[\s\S]*\}/);

if (!jsonMatch) {
    console.error("Error: No JSON found in AI response:", rawText);
    return { error: "Failed to extract valid JSON from AI response." };
}

const cleanedText = jsonMatch[0].trim();

try {
    return JSON.parse(cleanedText);
} catch (error) {
    console.error("Error parsing extracted JSON:", cleanedText);
    return { error: "Failed to parse AI-generated JSON." };
}


  } catch (error) {
    console.error("Error converting HTML to JSON:", error);
    return { error: "Failed to process webpage structure." };
  }
};

// Function to convert user command into JSON format
const convertUserCommandToJSON = async (command) => {
  const prompt = `
    Convert the following user command into a structured JSON format indicating the intended modifications.

    User Command:
    "${command}"

    Provide only valid JSON output.
  `;

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
const jsonMatch = rawText.match(/\{[\s\S]*\}/);

if (!jsonMatch) {
    console.error("Error: No JSON found in AI response:", rawText);
    return { error: "Failed to extract valid JSON from AI response." };
}

const cleanedText = jsonMatch[0].trim();

try {
    return JSON.parse(cleanedText);
} catch (error) {
    console.error("Error parsing extracted JSON:", cleanedText);
    return { error: "Failed to parse AI-generated JSON." };
}


  } catch (error) {
    console.error("Error converting user command to JSON:", error);
    return { error: "Failed to process user command." };
  }
};

// Function to determine how changes should be applied
const applyChangesToWebpageJSON = async (pageJSON, commandJSON) => {
  const prompt = `
    Given the following webpage structure in JSON and user modification request in JSON, compare both and make required changes in wepage structure according to the user demand which he gave by his command.

    Webpage JSON:
    ${JSON.stringify(pageJSON).substring(0, 3000)}

    User Request JSON:
    ${JSON.stringify(commandJSON)}

    Provide the modified webpage JSON with applied changes.
  `;

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
const jsonMatch = rawText.match(/\{[\s\S]*\}/);

if (!jsonMatch) {
    console.error("Error: No JSON found in AI response:", rawText);
    return { error: "Failed to extract valid JSON from AI response." };
}

const cleanedText = jsonMatch[0].trim();

try {
    return JSON.parse(cleanedText);
} catch (error) {
    console.error("Error parsing extracted JSON:", cleanedText);
    return { error: "Failed to parse AI-generated JSON." };
}


  } catch (error) {
    console.error("Error applying changes:", error);
    return { error: "Failed to apply changes." };
  }
};

// API Route: Process user request
app.post("/api/process", async (req, res) => {
  const { webpageLink, userCommand } = req.body;

  if (!webpageLink || !userCommand) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    // Step 1: Fetch webpage HTML
    const webpageHTML = await fetchWebpageContent(webpageLink);

    // Step 2: Convert webpage HTML to JSON
    const webpageJSON = await convertHTMLToJSON(webpageHTML);

    // Step 3: Convert user command to JSON
    const commandJSON = await convertUserCommandToJSON(userCommand);

    // Step 4: Apply modifications based on comparison
    const modifiedWebpageJSON = await applyChangesToWebpageJSON(webpageJSON, commandJSON);

    // Step 5: Send back the modified webpage JSON
    res.json({ success: true, modifiedWebpageJSON });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
