import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simple JSON persistence
  const DATA_DIR = path.join(process.cwd(), "data");
  const DATA_FILE = path.join(DATA_DIR, "lists.json");

  // Ensure data folder exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load initial data
  let lists: Record<string, any> = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      lists = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading lists file, resetting", e);
      lists = {};
    }
  }

  function saveLists() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(lists, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save lists to file", e);
    }
  }

  // Helper to generate a code (simple, readable uppercase digits / letters)
  function generateListId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No easily confused characters like O/0, I/1
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  // API endpoints
  // List info / items
  app.get("/api/lists/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    let list = lists[id];
    if (!list) {
      // If list doesn't exist, we auto-create it.
      // This is dynamic and friendly, allowing users to coordinate custom codes if they want!
      list = {
        id,
        name: `My Shopping List`,
        items: [],
        updatedAt: Date.now(),
      };
      lists[id] = list;
      saveLists();
    }
    res.json(list);
  });

  // Create new list
  app.post("/api/lists", (req, res) => {
    const { name } = req.body;
    const id = generateListId();
    const newList = {
      id,
      name: name || "Shopping List",
      items: [],
      updatedAt: Date.now(),
    };
    lists[id] = newList;
    saveLists();
    res.status(201).json(newList);
  });

  // Update list
  app.put("/api/lists/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    const { name, items } = req.body;
    
    if (!lists[id]) {
      lists[id] = {
        id,
        name: name || "Shopping List",
        items: items || [],
        updatedAt: Date.now()
      };
    } else {
      if (typeof name !== "undefined") lists[id].name = name;
      if (typeof items !== "undefined") lists[id].items = items;
      lists[id].updatedAt = Date.now();
    }
    saveLists();
    res.json(lists[id]);
  });

  // Delete list
  app.delete("/api/lists/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    if (lists[id]) {
      delete lists[id];
      saveLists();
    }
    res.json({ success: true });
  });

  // Duplicate list
  app.post("/api/lists/:id/duplicate", (req, res) => {
    const sourceId = req.params.id.toUpperCase();
    const sourceList = lists[sourceId];
    if (!sourceList) {
      return res.status(404).json({ error: "Source list not found" });
    }

    const { newName } = req.body;
    const newId = generateListId();

    // Deep copy existing items with brand new IDs
    const copiedItems = sourceList.items.map((item: any) => ({
      ...item,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now() + (item.createdAt % 1000)
    }));

    const duplicatedList = {
      id: newId,
      name: newName || `${sourceList.name} (Copy)`,
      items: copiedItems,
      updatedAt: Date.now(),
    };

    lists[newId] = duplicatedList;
    saveLists();
    res.status(201).json(duplicatedList);
  });

  // Intellegent voice recognition processing with Gemini
  app.post("/api/parse-voice-items", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Voice transcript is empty or invalid." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "GEMINI_API_KEY is not configured on the server. Please define this secret in your environment parameters."
        });
      }

      // Lazy instantiation of the GoogleGenAI client (robust pattern)
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Analyze the provided voice transcript and extract shopping/grocery items accurately.
For each item, determine:
- "name": Clean name of the item. Capitalize properly (e.g. "Chocolate Chip Cookies", "Fresh Milk", "Sourdough Bread").
- "quantity": Optional quantity or brief size note (e.g. "1 dozen", "2 liters", "3 bags"). If no quantity is specified, keep it as empty string "".

Examples:
1. "get two gallons of milk and a box of cereal" -> [{"name": "Milk", "quantity": "2 gallons"}, {"name": "Box of Cereal", "quantity": ""}]
2. "buy six banas, paper towels, and some fresh eggs" -> [{"name": "Bananas", "quantity": "6"}, {"name": "Paper Towels", "quantity": ""}, {"name": "Fresh Eggs", "quantity": ""}]
3. "toothpaste and five apples please" -> [{"name": "Toothpaste", "quantity": ""}, {"name": "Apples", "quantity": "5"}]

Voice transcript: "${text}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: "Name of the grocery or list item (essential, properly capitalized)."
                },
                quantity: {
                  type: Type.STRING,
                  description: "Extracted quantity associated with this item, or empty string if unspecified."
                }
              },
              required: ["name"]
            }
          }
        }
      });

      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error("No structured output returned from the Gemini model.");
      }

      const parsedItems = JSON.parse(jsonText);
      res.json({ items: parsedItems });
    } catch (error: any) {
      console.error("Error in speech processing using Gemini:", error);
      res.status(500).json({ error: error.message || "Failed to process text with Gemini API." });
    }
  });

  // Serve Vite or static files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
