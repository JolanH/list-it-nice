var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  const DATA_DIR = import_path.default.join(process.cwd(), "data");
  const DATA_FILE = import_path.default.join(DATA_DIR, "lists.json");
  if (!import_fs.default.existsSync(DATA_DIR)) {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  }
  let lists = {};
  if (import_fs.default.existsSync(DATA_FILE)) {
    try {
      lists = JSON.parse(import_fs.default.readFileSync(DATA_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading lists file, resetting", e);
      lists = {};
    }
  }
  function saveLists() {
    try {
      import_fs.default.writeFileSync(DATA_FILE, JSON.stringify(lists, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save lists to file", e);
    }
  }
  function generateListId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
  app.get("/api/lists/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    let list = lists[id];
    if (!list) {
      list = {
        id,
        name: `My Shopping List`,
        items: [],
        updatedAt: Date.now()
      };
      lists[id] = list;
      saveLists();
    }
    res.json(list);
  });
  app.post("/api/lists", (req, res) => {
    const { name } = req.body;
    const id = generateListId();
    const newList = {
      id,
      name: name || "Shopping List",
      items: [],
      updatedAt: Date.now()
    };
    lists[id] = newList;
    saveLists();
    res.status(201).json(newList);
  });
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
  app.delete("/api/lists/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    if (lists[id]) {
      delete lists[id];
      saveLists();
    }
    res.json({ success: true });
  });
  app.post("/api/lists/:id/duplicate", (req, res) => {
    const sourceId = req.params.id.toUpperCase();
    const sourceList = lists[sourceId];
    if (!sourceList) {
      return res.status(404).json({ error: "Source list not found" });
    }
    const { newName } = req.body;
    const newId = generateListId();
    const copiedItems = sourceList.items.map((item) => ({
      ...item,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now() + item.createdAt % 1e3
    }));
    const duplicatedList = {
      id: newId,
      name: newName || `${sourceList.name} (Copy)`,
      items: copiedItems,
      updatedAt: Date.now()
    };
    lists[newId] = duplicatedList;
    saveLists();
    res.status(201).json(duplicatedList);
  });
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
      const ai = new import_genai.GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
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
            type: import_genai.Type.ARRAY,
            items: {
              type: import_genai.Type.OBJECT,
              properties: {
                name: {
                  type: import_genai.Type.STRING,
                  description: "Name of the grocery or list item (essential, properly capitalized)."
                },
                quantity: {
                  type: import_genai.Type.STRING,
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
    } catch (error) {
      console.error("Error in speech processing using Gemini:", error);
      res.status(500).json({ error: error.message || "Failed to process text with Gemini API." });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
