import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShoppingBag,
  Plus,
  Copy,
  Check,
  AlertCircle,
  Edit2,
  X,
  FileCheck,
  Menu,
  Smartphone,
  ChevronRight,
  TrendingUp,
  Clock,
  ExternalLink,
  ChevronLeft,
  Mic,
  MicOff,
  RotateCw,
  Sparkles,
  QrCode,
  Camera,
  WifiOff,
  ArrowLeftRight,
  Trash2,
  Upload,
  Download,
  Share2
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { ShoppingList, ShoppingItem } from "./types";
import { ShoppingItemCard } from "./components/ShoppingItemCard";
import { RecentListItemCard } from "./components/RecentListItemCard";

export default function App() {
  const [listId, setListId] = useState<string>(() => {
    return localStorage.getItem("sync_shopping_list_id") || "";
  });
  
  const [list, setList] = useState<ShoppingList | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [syncInputCode, setSyncInputCode] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Duplication management states
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; name: string } | null>(null);

  const handleProposeDuplicate = (id: string, name: string) => {
    setDuplicateTarget({ id, name });
    setDuplicateName(`${name} (Copy)`);
    setIsDuplicating(true);
  };
  
  // Voice input state management
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // UI Interactive States
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [isSyncRunning, setIsSyncRunning] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Offline Sync States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showExportQr, setShowExportQr] = useState(false);
  const [offlineFeedback, setOfflineFeedback] = useState<string | null>(null);
  const [textCodecInput, setTextCodecInput] = useState("");
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [caretNotification, setCaretNotification] = useState<{
    title: string;
    message: string;
    type: "merge" | "overwrite";
    count: number;
  } | null>(null);

  // Auto-dismiss caretNotification
  useEffect(() => {
    if (caretNotification) {
      const timer = setTimeout(() => {
        setCaretNotification(null);
      }, 5500);
      return () => clearTimeout(timer);
    }
  }, [caretNotification]);

  // Maintain local history of structured shopping lists switcher
  const [recentLists, setRecentLists] = useState<Array<{id: string, name: string}>>(() => {
    try {
      const stored = localStorage.getItem("sync_recent_lists");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const pendingMutationRef = useRef<boolean>(false);

  // Auto-check custom protocol and query parameters on mount to handle direct imports
  useEffect(() => {
    const checkImportParams = () => {
      const params = new URLSearchParams(window.location.search);
      const importParam = params.get("import");
      if (importParam) {
        let extractedCode = importParam;
        
        // If browser expands %s to include the custom scheme 'web+lin://import?data=[CODE]' or 'lin://import?data=[CODE]'
        if (importParam.includes("data=")) {
          const match = importParam.match(/data=([^&]+)/);
          if (match && match[1]) {
            extractedCode = decodeURIComponent(match[1]);
          }
        } else if (importParam.includes("data%3D")) {
          const decodedParam = decodeURIComponent(importParam);
          const match = decodedParam.match(/data=([^&]+)/);
          if (match && match[1]) {
            extractedCode = match[1];
          }
        }
        
        if (extractedCode) {
          setTextCodecInput(extractedCode);
          setIsImportModalOpen(true);
          setOfflineFeedback("Data preloaded from your link! Choose whether to Merge or Overwrite below.");
        }

        // Clean up URL parameters cleanly
        try {
          const newUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, newUrl);
        } catch (e) {
          console.warn("Could not clean up URL: ", e);
        }
      }
    };
    checkImportParams();
  }, []);

  // Soft auto-register custom-protocol handler on mount so links like web+lin:// function correctly
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.registerProtocolHandler) {
      try {
        navigator.registerProtocolHandler(
          "web+lin",
          window.location.origin + "/?import=%s"
        );
      } catch (e) {
        // Suppress warning if browser rejects registration on load
      }
    }
  }, []);

  // Listen for Capacitor native deep links (e.g. lin:// or web+lin://)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const initDeepLinkListener = async () => {
        const handler = await CapApp.addListener('appUrlOpen', (event: any) => {
          try {
            const urlString = event.url;
            if (urlString) {
              let extractedCode = "";
              if (urlString.includes("data=")) {
                const match = urlString.match(/data=([^&]+)/);
                if (match && match[1]) {
                  extractedCode = decodeURIComponent(match[1]);
                }
              } else if (urlString.includes("data%3D")) {
                const decodedParam = decodeURIComponent(urlString);
                const match = decodedParam.match(/data=([^&]+)/);
                if (match && match[1]) {
                  extractedCode = match[1];
                }
              }
              
              if (extractedCode) {
                setTextCodecInput(extractedCode);
                setIsImportModalOpen(true);
                setOfflineFeedback("Data preloaded from native link! Choose whether to Merge or Overwrite below.");
              }
            }
          } catch (err) {
            console.error("Error processing native deep link URL:", err);
          }
        });
        return handler;
      };

      const handlerPromise = initDeepLinkListener();
      return () => {
        handlerPromise.then(h => h.remove());
      };
    }
  }, []);

  // 1. Get or Create initial active list
  useEffect(() => {
    async function initialize() {
      try {
        let activeId = listId;
        if (!activeId) {
          const res = await fetch("/api/lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Weekly Groceries" }),
          });
          if (!res.ok) throw new Error("Could not initialize shopping list");
          const newList: ShoppingList = await res.json();
          activeId = newList.id;
          setListId(newList.id);
          localStorage.setItem("sync_shopping_list_id", newList.id);
        }
        await fetchList(activeId);
      } catch (err: any) {
        setError(err.message || "Failed to load shopping list.");
      }
    }
    initialize();
  }, [listId]);

  // 2. Fetch list items helper
  const fetchList = async (idToFetch: string, silent = false) => {
    if (!idToFetch) return;
    if (!silent) setIsSyncRunning(true);
    
    try {
      const res = await fetch(`/api/lists/${idToFetch}`);
      if (!res.ok) {
        throw new Error("Could not fetch the specified list.");
      }
      const data: ShoppingList = await res.json();
      
      if (!pendingMutationRef.current) {
        setList(data);
        setLastSyncTime(Date.now());
        setError(null);

        // Update recently synced collections list
        setRecentLists(prev => {
          const exists = prev.some(item => item.id.toUpperCase() === data.id.toUpperCase());
          let updated;
          if (exists) {
            updated = prev.map(item =>
              item.id.toUpperCase() === data.id.toUpperCase()
                ? { ...item, name: data.name }
                : item
            );
          } else {
            updated = [{ id: data.id.toUpperCase(), name: data.name }, ...prev].slice(0, 6);
          }
          localStorage.setItem("sync_recent_lists", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err: any) {
      if (!silent) {
        setError(err.message || "Error syncing with cloud.");
      }
    } finally {
      if (!silent) setIsSyncRunning(false);
    }
  };

  // 3. Keep updating loop
  useEffect(() => {
    if (!listId) return;
    const pollInterval = setInterval(() => {
      fetchList(listId, true);
    }, 2500);
    return () => clearInterval(pollInterval);
  }, [listId]);

  // 4. Update core fields (helpers for mutations)
  const saveListToServer = async (payload: Partial<ShoppingList>) => {
    if (!listId || !list) return;
    pendingMutationRef.current = true;
    
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Could not sync item list to cloud.");
      const updatedList: ShoppingList = await res.json();
      setList(updatedList);
      setLastSyncTime(Date.now());
      setError(null);
    } catch (err: any) {
      setError(err.message || "Loss of network connection.");
    } finally {
      pendingMutationRef.current = false;
    }
  };

  // 5. Add shopping item
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !list) return;

    const newItem: ShoppingItem = {
      id: Math.random().toString(36).substring(2, 9),
      name: newItemName.trim(),
      quantity: newItemQty.trim(),
      checked: false,
      createdAt: Date.now(),
    };

    const updatedItems = [...list.items, newItem];
    setList({ ...list, items: updatedItems });
    setNewItemName("");
    setNewItemQty("");
    saveListToServer({ items: updatedItems });
  };

  // 5a. Intellgent text-based parsing with Gemini (No voice)
  const handleGeminiTextAdd = async () => {
    if (!newItemName.trim() || !list) return;

    const rawInput = newItemName.trim();
    setVoiceFeedback(`Extracting items with Gemini...`);
    setIsVoiceProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/parse-voice-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: rawInput })
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.error || "API error running Gemini on text input.");
      }

      const responseData = await res.json();
      if (responseData.items && responseData.items.length > 0) {
        const mappedNewItems: ShoppingItem[] = responseData.items.map((it: any) => ({
          id: Math.random().toString(36).substring(2, 9),
          name: it.name,
          quantity: it.quantity || "",
          checked: false,
          createdAt: Date.now()
        }));

        // Merge items
        const mergedListItems = [...list.items, ...mappedNewItems];
        setList({ ...list, items: mergedListItems });
        saveListToServer({ items: mergedListItems });
        setNewItemName("");
        setNewItemQty("");
        setVoiceFeedback(`Gemini added: ${responseData.items.map((x: any) => x.name).join(", ")}`);
      } else {
        setVoiceFeedback("Could not identify separate shopping items. Traditional add instead?");
      }
    } catch (err: any) {
      setError(err.message || "Failed to process text input with Gemini.");
      setVoiceFeedback(null);
    } finally {
      setIsVoiceProcessing(false);
      // Auto-fade feedback message after a brief timing window
      setTimeout(() => {
        setVoiceFeedback((prev) => (prev && prev.startsWith("Gemini added") ? null : prev));
      }, 4500);
    }
  };

  // 5b. Voice integration with Gemini parsing support
  const startVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please try using modern Chrome, Edge, or Safari.");
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsVoiceRecording(true);
        setVoiceFeedback("Listening... Say some items (e.g. '3 bananas and milk')");
        setError(null);
      };

      rec.onerror = (e: any) => {
        console.error("Speech recognition error", e);
        if (e.error === "not-allowed") {
          setError("Microphone permission was denied. Please allow microphone access in your browser settings.");
        } else {
          setError(`Voice input error: ${e.error || "Unknown recording error"}`);
        }
        setIsVoiceRecording(false);
        setVoiceFeedback(null);
      };

      rec.onend = () => {
        setIsVoiceRecording(false);
      };

      rec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (!transcript || !transcript.trim()) {
          setVoiceFeedback("No speech detected. Please speak clearly.");
          return;
        }

        setVoiceFeedback(`"${transcript}" - Extracting items with Gemini...`);
        setIsVoiceProcessing(true);

        try {
          const res = await fetch("/api/parse-voice-items", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ text: transcript })
          });

          if (!res.ok) {
            const errBody = await res.json();
            throw new Error(errBody.error || "API error running Gemini on voice input.");
          }

          const responseData = await res.json();
          if (responseData.items && responseData.items.length > 0 && list) {
            const mappedNewItems: ShoppingItem[] = responseData.items.map((it: any) => ({
              id: Math.random().toString(36).substring(2, 9),
              name: it.name,
              quantity: it.quantity || "",
              checked: false,
              createdAt: Date.now()
            }));

            // Merge items
            const mergedListItems = [...list.items, ...mappedNewItems];
            setList({ ...list, items: mergedListItems });
            saveListToServer({ items: mergedListItems });
            setVoiceFeedback(`Gemini added: ${responseData.items.map((x: any) => x.name).join(", ")}`);
          } else {
            setVoiceFeedback("Could not identify shopping items. Say things like: 'add apples and bread'");
          }
        } catch (err: any) {
          setError(err.message || "Failed to process speech input.");
          setVoiceFeedback(null);
        } finally {
          setIsVoiceProcessing(false);
          // Auto-fade feedback message after a brief timing window
          setTimeout(() => {
            setVoiceFeedback((prev) => (prev && prev.startsWith("Gemini added") ? null : prev));
          }, 4500);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      console.error("Speech initialization error:", err);
      setError("Unable to launch speech recognition services.");
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsVoiceRecording(false);
    }
  };

  // Clean recording instances on page unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // === OFFLINE PEER-TO-PEER DATA SYNC CODES & QR ENGINE ===
  const getEncodedOfflineData = (): string => {
    if (!list) return "";
    try {
      const payload = {
        n: list.name,
        i: list.items.map((it) => [it.name, it.quantity || "", it.checked ? 1 : 0]),
      };
      const json = JSON.stringify(payload);
      return btoa(encodeURIComponent(json));
    } catch (e) {
      console.error("Failed to encode list data offline", e);
      return "";
    }
  };

  const handleImportOfflineData = (encodedStr: string, mode: "merge" | "overwrite"): boolean => {
    if (!encodedStr || !encodedStr.trim()) {
      setOfflineFeedback("Please enter or scan a valid sync data payload.");
      return false;
    }
    try {
      let cleanedInput = encodedStr.trim();
      
      // Keep decoding URI components up to 4 times to unpack nested encodings from pasted URLs
      let decoded = cleanedInput;
      for (let i = 0; i < 4; i++) {
        if (decoded.includes("%")) {
          try {
            decoded = decodeURIComponent(decoded);
          } catch (e) {
            break;
          }
        } else {
          break;
        }
      }

      // If we find "data=" in the decoded or raw input, extract it
      const dataMatch = decoded.match(/data=([^&]+)/) || cleanedInput.match(/data=([^&]+)/);
      if (dataMatch && dataMatch[1]) {
        cleanedInput = dataMatch[1].trim();
      } else {
        // If there's an "import=" parameter, extract that first
        const importMatch = decoded.match(/import=([^&]+)/) || cleanedInput.match(/import=([^&]+)/);
        if (importMatch && importMatch[1]) {
          let inner = importMatch[1].trim();
          const innerDataMatch = inner.match(/data=([^&]+)/);
          if (innerDataMatch && innerDataMatch[1]) {
            cleanedInput = innerDataMatch[1].trim();
          } else {
            cleanedInput = inner;
          }
        }
      }

      const json = decodeURIComponent(atob(cleanedInput));
      const parsed = JSON.parse(json);
      if (!parsed || !parsed.i || !Array.isArray(parsed.i)) {
        throw new Error("Invalid format structure");
      }

      const importedItems: ShoppingItem[] = parsed.i.map((itemArr: any) => ({
        id: Math.random().toString(36).substring(2, 9),
        name: itemArr[0],
        quantity: itemArr[1] || "",
        checked: itemArr[2] === 1,
        createdAt: Date.now(),
      }));

      let mergedItems: ShoppingItem[] = [];
      if (mode === "overwrite") {
        mergedItems = importedItems;
      } else {
        // Prevent matching names to avoid exact duplicates
        const existingNames = new Set((list?.items || []).map((it) => it.name.trim().toLowerCase()));
        const uniqueImported = importedItems.filter((it) => !existingNames.has(it.name.trim().toLowerCase()));
        mergedItems = [...(list?.items || []), ...uniqueImported];
      }

      const updatedList = {
        id: list?.id || listId || "LOCAL",
        name: list?.name || parsed.n || "Shopping List",
        items: mergedItems,
        updatedAt: Date.now(),
      };

       setList(updatedList);
      saveListToServer({ name: updatedList.name, items: updatedList.items });
      const feedbackMsg = `Success! ${mode === "overwrite" ? "Replaced list with" : "Merged"} ${importedItems.length} items.`;
      setOfflineFeedback(feedbackMsg);
      setVoiceFeedback(feedbackMsg);

      setCaretNotification({
        title: mode === "overwrite" ? "List Overwritten" : "Items Merged",
        message: mode === "overwrite"
          ? `Successfully replaced all previous items with ${importedItems.length} imported items.`
          : `Successfully merged ${importedItems.length} items into your current list.`,
        type: mode,
        count: importedItems.length,
      });
      
      // Auto-fade success message on the main screen after 6 seconds
      setTimeout(() => {
        setVoiceFeedback((prev) => (prev === feedbackMsg ? null : prev));
      }, 6000);

      return true;
    } catch (e) {
      setOfflineFeedback("Invalid or corrupted backup string code.");
      return false;
    }
  };

  const closeExportModal = () => {
    setIsExportModalOpen(false);
    setShowExportQr(false);
    setOfflineFeedback(null);
  };

  const closeImportModal = () => {
    setIsImportModalOpen(false);
    setOfflineFeedback(null);
    setTextCodecInput("");
    setShowOverwriteConfirm(false);
  };

  // 6. Switch Active List helper
  const handleSelectRecentList = (idToSelect: string) => {
    setListId(idToSelect);
    localStorage.setItem("sync_shopping_list_id", idToSelect);
    setIsMobileSidebarOpen(false);
  };

  // 7. Toggle item checked
  const handleToggleItem = (itemId: string) => {
    if (!list) return;
    const updatedItems = list.items.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    setList({ ...list, items: updatedItems });
    saveListToServer({ items: updatedItems });
  };

  // 8. Delete logic
  const handleDeleteItem = (itemId: string) => {
    if (!list) return;
    const updatedItems = list.items.filter((item) => item.id !== itemId);
    setList({ ...list, items: updatedItems });
    saveListToServer({ items: updatedItems });
  };

  // 9. Connect to another device code
  const handleConnectCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = syncInputCode.trim().toUpperCase();
    if (!cleanCode) return;

    setIsSearchingCode(true);
    setError(null);

    try {
      const res = await fetch(`/api/lists/${cleanCode}`);
      if (!res.ok) {
        throw new Error("Specified list code was not found. Please verify.");
      }
      const targetList: ShoppingList = await res.json();
      setListId(targetList.id);
      setList(targetList);
      localStorage.setItem("sync_shopping_list_id", targetList.id);
      setSyncInputCode("");
      setLastSyncTime(Date.now());
      setIsMobileSidebarOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearchingCode(false);
    }
  };

  // 10. Rename current list
  const handleSaveTitle = () => {
    if (!list) return;
    const finalTitle = editedTitle.trim() || list.name || "New Collection";
    setIsEditingTitle(false);
    if (finalTitle === list.name) return;
    
    setList({ ...list, name: finalTitle });
    saveListToServer({ name: finalTitle });

    // Instantly update local collections sidebar name
    setRecentLists(prev =>
      prev.map(item => item.id === list.id ? { ...item, name: finalTitle } : item)
    );
  };

  // 11. Duplicate list handler
  const handleDuplicateList = async () => {
    const targetId = duplicateTarget?.id || list?.id;
    const targetName = duplicateTarget?.name || list?.name || "List";
    if (!targetId) return;
    const finalName = duplicateName.trim() || `${targetName} (Copy)`;
    setIsDuplicating(false);
    setDuplicateName("");
    setDuplicateTarget(null);
    setIsSyncRunning(true);

    try {
      const res = await fetch(`/api/lists/${targetId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: finalName }),
      });
      if (!res.ok) throw new Error("Could not duplicate this shopping list.");
      
      const newDuplicatedList: ShoppingList = await res.json();
      setListId(newDuplicatedList.id);
      setList(newDuplicatedList);
      localStorage.setItem("sync_shopping_list_id", newDuplicatedList.id);
      setError(null);

      // Add to recent lists if not already there, and update context
      setRecentLists(prev => {
        const itemExists = prev.some(item => item.id === newDuplicatedList.id);
        if (itemExists) {
          return prev.map(item => item.id === newDuplicatedList.id ? { id: item.id, name: finalName } : item);
        } else {
          return [{ id: newDuplicatedList.id, name: finalName }, ...prev];
        }
      });

      setCaretNotification({
        title: "List Duplicated",
        message: `Successfully duplicated "${targetName}" as "${finalName}".`,
        type: "merge",
        count: newDuplicatedList.items.length,
      });
    } catch (e: any) {
      setError(e.message || "Failed to make a copy.");
    } finally {
      setIsSyncRunning(false);
    }
  };

  // 12. Copy sync code to clipboard
  const copySyncCode = () => {
    if (!listId) return;
    navigator.clipboard.writeText(listId).then(() => {
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    });
  };

  // 13. Create a fresh clean list on the spot
  const handleCreateNewList = async () => {
    setIsSyncRunning(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Collection" }),
      });
      if (!res.ok) throw new Error("Could not create list");
      const newList: ShoppingList = await res.json();
      setListId(newList.id);
      setList(newList);
      localStorage.setItem("sync_shopping_list_id", newList.id);
      setError(null);
      setIsMobileSidebarOpen(false);
      setEditedTitle("");
      setIsEditingTitle(true);
    } catch (e: any) {
      setError("Failed to create new list.");
    } finally {
      setIsSyncRunning(false);
    }
  };

  // 14. Delete list entirely
  const handleDeleteList = async (idToDelete: string, e?: React.MouseEvent, bypassConfirm = false) => {
    if (e) e.stopPropagation(); // prevent clicking other button elements
    if (!bypassConfirm && !confirm("Are you sure you want to completely delete this list? This cannot be undone.")) {
      return false;
    }

    try {
      // 1. Send DELETE request to server
      await fetch(`/api/lists/${idToDelete}`, {
        method: "DELETE"
      });

      // 2. Filter from recent lists local state and localStorage
      const updatedRecent = recentLists.filter(item => item.id.toUpperCase() !== idToDelete.toUpperCase());
      setRecentLists(updatedRecent);
      localStorage.setItem("sync_recent_lists", JSON.stringify(updatedRecent));

      // 3. If deleting the current active list, select another one or create a fresh one
      if (listId && listId.toUpperCase() === idToDelete.toUpperCase()) {
        if (updatedRecent.length > 0) {
          const nextActiveId = updatedRecent[0].id;
          setListId(nextActiveId);
          localStorage.setItem("sync_shopping_list_id", nextActiveId);
          await fetchList(nextActiveId);
        } else {
          // No lists remain. Auto-create a brand new one
          const res = await fetch("/api/lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Weekly Groceries" }),
          });
          if (res.ok) {
            const newList: ShoppingList = await res.json();
            setListId(newList.id);
            setList(newList);
            localStorage.setItem("sync_shopping_list_id", newList.id);
            setRecentLists([{ id: newList.id.toUpperCase(), name: newList.name }]);
            localStorage.setItem("sync_recent_lists", JSON.stringify([{ id: newList.id.toUpperCase(), name: newList.name }]));
          }
        }
      }
      return true;
    } catch (err) {
      console.error("Failed to delete list", err);
      setError("Failed to delete list from the server.");
      return false;
    }
  };

  // Get all items in original order
  const allItems = list?.items || [];

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans overflow-hidden antialiased text-zinc-100/90 selection:bg-purple-500/35">
      
      {/* 1. SIDEBAR Navigation - Desktop view */}
      <aside className="w-80 bg-zinc-900 border-r border-zinc-800 hidden lg:flex flex-col shadow-xl select-none shrink-0">
        {/* Sidebar Header logo & Sync indicator */}
        <div className="p-6 border-b border-zinc-800/85 flex items-center bg-zinc-900/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-950/50 text-white">
              <ShoppingBag className="w-5 h-5 stroke-[2.2]" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">My Lists</h1>
          </div>
        </div>

        {/* Sidebar content - Collections Lists Switcher & Pairing forms */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* List Switcher Collections */}
          <div>
            <nav className="space-y-1">
              {recentLists.length > 0 ? (
                recentLists.map((recentItem) => (
                  <RecentListItemCard
                    key={recentItem.id}
                    id={recentItem.id}
                    name={recentItem.name}
                    isActive={recentItem.id === listId}
                    onSelect={handleSelectRecentList}
                    onDelete={handleDeleteList}
                    onDuplicate={handleProposeDuplicate}
                  />
                ))
              ) : (
                <div className="text-xs text-zinc-500 px-3 py-2 italic">No local lists stored yet</div>
              )}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer button */}
        <div className="p-4 border-t border-zinc-805 bg-zinc-900">
          <button
            onClick={handleCreateNewList}
            className="w-full py-3 bg-zinc-950 hover:bg-zinc-850 active:bg-zinc-900 text-white border border-zinc-800/80 rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create New List</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN SECTION */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950/40 overflow-hidden relative">
        
        {/* Dynamic Header Navbar */}
        <header className="h-20 bg-zinc-900 border-b border-zinc-800 px-6 sm:px-8 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Mobile Drawer Trigger */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-zinc-800 rounded-xl text-zinc-300 shrink-0 border border-zinc-800 mr-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            {/* Interactive Title & Rename Form */}
            <div className="min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={30}
                    placeholder="Name your list..."
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="text-xl sm:text-2xl font-bold text-white border-b-2 border-purple-500 bg-transparent outline-none py-0.5 px-0 w-44 sm:w-64 placeholder-zinc-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-1 px-1.5 text-white bg-purple-600 hover:bg-purple-700 rounded-lg text-xs font-bold"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingTitle(false)}
                    className="p-1 text-zinc-400 hover:bg-zinc-800 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight truncate max-w-[160px] sm:max-w-[320px]">
                    {list?.name || "Weekly Groceries"}
                  </h2>
                  <button
                    onClick={() => {
                      setEditedTitle(list?.name || "");
                      setIsEditingTitle(true);
                    }}
                    className="p-1 text-zinc-450 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              
              {/* Sync Metadata status subtitle */}
              <p className="text-[10px] sm:text-xs text-zinc-500 font-medium mt-0.5 flex items-center gap-1 w-full truncate">
                <span>Active ({list?.items.length || 0} items)</span>
              </p>
            </div>
          </div>
          
          {/* Header Action Controls */}
          <div className="flex items-center space-x-2">
            {/* Export List Button */}
            <button
              id="btn-export-list"
              onClick={() => {
                setIsExportModalOpen(true);
              }}
              className="px-2.5 sm:px-3 py-2 bg-zinc-900 border border-zinc-800 hover:border-purple-500/40 text-purple-400 hover:text-purple-300 hover:bg-zinc-850 rounded-xl text-xs font-bold flex items-center gap-1.5 transition select-none cursor-pointer shrink-0 shadow-sm"
              title="Export this list via QR Code or Text Sync Code"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Import List Button */}
            <button
              id="btn-import-list"
              onClick={() => {
                setIsImportModalOpen(true);
              }}
              className="px-2.5 sm:px-3 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition select-none cursor-pointer shrink-0 shadow-md shadow-purple-950/20"
              title="Import items into this list via QR Scanner or Text Sync Code"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>
          </div>
        </header>

        {/* Global errors banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mx-8 mt-4 px-5 py-3.5 bg-red-950/45 border border-red-900/60 text-red-250 rounded-2xl flex items-start gap-2.5 text-xs font-semibold overflow-hidden shadow-xs"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">{error}</div>
              <button onClick={() => setError(null)} className="text-red-450 hover:text-red-300 font-bold ml-1">
                Close
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List items wrapper */}
        <section className="flex-1 p-6 sm:p-8 overflow-y-auto space-y-6">
          
          {/* Empty Shopping List placeholder */}
          {(!list || list.items.length === 0) && (
            <div className="flex flex-col items-center justify-center text-center py-20 px-6 max-w-sm mx-auto">
              <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-5 border border-zinc-800 text-zinc-550">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-zinc-200 mb-1">Your Shopping List is Empty</h3>
              <p className="text-xs text-zinc-550 leading-relaxed">
                Add elements using the input panel below. Drag/Swipe right on any item to instantly delete it, or click to check/uncheck.
              </p>
            </div>
          )}

          {list && list.items.length > 0 && (
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <AnimatePresence mode="popLayout">
                  {allItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92, x: 120 }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    >
                      <ShoppingItemCard
                        item={item}
                        onToggle={handleToggleItem}
                        onDelete={handleDeleteItem}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </section>

        {/* Quick Add Shopping Item Form (Beautiful footer section matching Polish HTML) */}
        <div className="h-auto md:h-24 bg-zinc-900 border-t border-zinc-805 p-6 flex flex-col justify-center shrink-0 shadow-xl z-15">
          <div className="max-w-2xl w-full mx-auto">
            <AnimatePresence>
              {voiceFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  className="mb-3 px-4 py-3 border border-purple-500/20 bg-purple-950/30 rounded-xl flex items-center justify-between gap-3 text-xs text-purple-300 backdrop-blur-md"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-2.5 w-2.5 relative">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isVoiceRecording ? "bg-red-400" : "bg-purple-400"}`}></span>
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isVoiceRecording ? "bg-red-500" : "bg-purple-500"}`}></span>
                    </div>
                    <span className="font-semibold tracking-wide">{voiceFeedback}</span>
                  </div>
                  {isVoiceRecording && (
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium scale-[0.9] border border-zinc-700 transition"
                    >
                      Done Speaking
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleAddItem} className="flex gap-2">
              <input
                type="text"
                placeholder={`Add item to ${list?.name || "Weekly Groceries"}...`}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                maxLength={45}
                required
                className="flex-1 h-12 px-4 bg-zinc-950 border border-zinc-800 focus:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 rounded-xl font-medium text-sm transition-colors text-zinc-100"
              />
              <button
                type="button"
                onClick={isVoiceRecording ? stopVoiceRecording : startVoiceRecording}
                disabled={isVoiceProcessing}
                title="Add multiple items using voice + Gemini AI"
                className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all border shrink-0 ${
                  isVoiceRecording
                    ? "bg-red-500/20 border-red-500/80 text-red-500 hover:bg-red-500/30"
                    : isVoiceProcessing
                    ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-950 border-zinc-800 text-purple-400 hover:text-purple-300 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                }`}
              >
                {isVoiceProcessing ? (
                  <RotateCw className="w-5 h-5 animate-spin text-purple-500" />
                ) : isVoiceRecording ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
              <button
                type="submit"
                disabled={!newItemName.trim()}
                className="h-12 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 text-white rounded-xl px-4 flex items-center justify-center font-bold text-sm shrink-0 shadow-md shadow-purple-950 transition-colors"
              >
                Add Element
              </button>
            </form>
          </div>
        </div>

      </main>

      {/* 3. MOBILE SIDEBAR DRAWER PANEL (Framer Motion Slided Sheet) */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            
            {/* Backdrop black overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="absolute inset-0 bg-black"
            />
            
            {/* Slided panel menu sheet */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.28 }}
              className="relative w-80 max-w-[calc(100vw-48px)] bg-zinc-900 border-r border-zinc-800 h-full flex flex-col shadow-2xl z-10"
            >
              {/* Header */}
              <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/20">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8.5 h-8.5 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-purple-900/30">
                    <ShoppingBag className="w-4.5 h-4.5 stroke-[2.2]" />
                  </div>
                  <h1 className="text-lg font-extrabold tracking-tight text-white">My Lists</h1>
                </div>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-450"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items & Device connections layout matching actual desktop sidebar */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                  <nav className="space-y-1">
                    {recentLists.map((recentItem) => (
                      <RecentListItemCard
                        key={recentItem.id}
                        id={recentItem.id}
                        name={recentItem.name}
                        isActive={recentItem.id === listId}
                        onSelect={handleSelectRecentList}
                        onDelete={handleDeleteList}
                        onDuplicate={handleProposeDuplicate}
                      />
                    ))}
                  </nav>
                </div>

                {/* Offline sync for mobile */}
                 <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setIsMobileSidebarOpen(false);
                      setIsExportModalOpen(true);
                    }}
                    className="py-3 bg-zinc-900 border border-zinc-800 text-purple-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-zinc-850 active:bg-zinc-800 transition shadow-sm"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsMobileSidebarOpen(false);
                      setIsImportModalOpen(true);
                    }}
                    className="py-3 bg-purple-600 border border-purple-500/20 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-purple-700 active:bg-purple-800 transition shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Import</span>
                  </button>
                </div>
              </div>

              {/* Sidebar trigger */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-900">
                <button
                  onClick={handleCreateNewList}
                  className="w-full py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl text-sm font-semibold flex items-center justify-center space-x-2"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Create New List</span>
                </button>
              </div>

            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* 4. MODALS (Duplicate List Prompt) */}
      <AnimatePresence>
        {isDuplicating && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4 z-50">
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 80 }}
              className="w-full max-w-sm bg-zinc-900 rounded-t-3xl sm:rounded-2xl p-6 border-t sm:border border-zinc-800 shadow-2xl relative text-zinc-100"
            >
              <h3 className="text-lg font-bold text-white mb-2">Duplicate Shopping List</h3>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Provide a name for the new cloned copy. Both lists will be saved separately under unique codes.
              </p>
              <div className="mb-4">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide block mb-1">List Name</label>
                <input
                  type="text"
                  maxLength={30}
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  className="w-full bg-zinc-950 focus:bg-zinc-950 border border-zinc-800 focus:ring-2 focus:ring-purple-950 focus:border-purple-500 outline-none rounded-xl px-3 py-2 text-sm font-medium h-10 transition-colors text-zinc-100"
                  placeholder="E.g. Weekly Groceries Copy"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setIsDuplicating(false);
                    setDuplicateName("");
                  }}
                  className="flex-1 sm:flex-initial text-zinc-400 hover:text-zinc-200 font-bold text-xs bg-zinc-800 hover:bg-zinc-750 py-2.5 px-4 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDuplicateList}
                  className="flex-1 sm:flex-initial bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md transition-colors"
                >
                  Clone List
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5A. EXPORT MODAL */}
      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 120 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 120 }}
              className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-zinc-800 shadow-2xl relative text-zinc-100 overflow-hidden"
            >
              {/* Top violet/purple gradient indicator bar */}
              <div className="h-1.5 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 w-full" />

              {/* Close Button / Title */}
              <div className="p-6 pb-2 flex items-center justify-between border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-1.5 leading-tight">
                      Export List
                    </h3>
                    <p className="text-[11px] text-zinc-500 font-medium">Share your active shopping list or save a secure offline backup</p>
                  </div>
                </div>
                <button
                  onClick={closeExportModal}
                  className="p-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Feedback banner */}
              {offlineFeedback && (
                <div className="mx-6 mt-4 p-3 bg-purple-950/20 border border-purple-500/15 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping shrink-0" />
                  <span>{offlineFeedback}</span>
                </div>
              )}

              {/* Content Panels */}
              <div className="p-6">
                <div className="space-y-5">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Use the direct **Local Sync Link** below to instantly trigger imports on another device. This link pre-packages your entire list content inside the query data.
                  </p>

                  {/* Local Sync Link field */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block text-purple-400 font-mono">Local Sync Link</label>
                    <p className="text-[11px] text-zinc-450 leading-relaxed">
                      This custom application scheme launches this app on other devices and preloads all shopping list items automatically.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        readOnly
                        onClick={(e) => (e.target as any).select()}
                        value={`lin://import?data=${getEncodedOfflineData()}`}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs font-mono py-2 text-zinc-350 truncate focus:outline-none focus:border-purple-500/50"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`lin://import?data=${getEncodedOfflineData()}`);
                            setOfflineFeedback("Local sync link copied to clipboard!");
                          }}
                          className="flex-1 sm:flex-initial px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-purple-400 hover:text-purple-300 border border-zinc-750 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const linkVal = `lin://import?data=${getEncodedOfflineData()}`;
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: "Direct Shopping List Import Link",
                                  text: linkVal
                                });
                                setOfflineFeedback("Local sync link shared successfully!");
                              } catch (err: any) {
                                if (err.name !== "AbortError") {
                                  setOfflineFeedback(`Failed to share: ${err.message || err}`);
                                }
                              }
                            } else {
                              navigator.clipboard.writeText(linkVal);
                              setOfflineFeedback("Sharing is not supported. Link copied instead.");
                            }
                          }}
                          className="flex-1 sm:flex-initial px-4.5 py-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition shadow-md shadow-purple-950/20 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share Link</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 1-click Toggleable QR Code Panel */}
                  <div className="border border-zinc-850 rounded-xl bg-zinc-950/30 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowExportQr(!showExportQr)}
                      className="w-full px-4 py-3 flex items-center justify-between text-xs text-zinc-300 font-bold hover:bg-zinc-900/30 transition text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-purple-500 animate-pulse" />
                        <span>Interactive QR Code Sync</span>
                      </span>
                      <span className="text-purple-400 hover:text-purple-300 text-xs transition font-semibold">
                        {showExportQr ? "Hide QR Code ▲" : "Show QR Code ▼"}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {showExportQr && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-zinc-850 p-5 flex flex-col items-center text-center space-y-4 bg-zinc-950/60"
                        >
                          <p className="text-[11px] text-zinc-400 leading-relaxed max-w-xs">
                            Scan this QR code with a peer device's camera or a QR scanner to instantly load or sync this exact list.
                          </p>
                          <div className="p-3.5 bg-white rounded-2xl shadow-xl inline-block">
                            <QRCodeSVG
                              value={`lin://import?data=${getEncodedOfflineData()}`}
                              size={180}
                              fgColor="#7c3aed"
                              bgColor="#ffffff"
                              includeMargin={true}
                              style={{ borderRadius: "8px" }}
                            />
                          </div>
                          <div className="text-[9px] text-zinc-500 font-mono">
                            List: <span className="text-zinc-400 font-bold">{list?.name}</span> • <span className="text-purple-400 font-bold">{list?.items.length || 0} items</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Enable custom handlers trigger */}
                  <div className="pt-2 border-t border-zinc-800/40">
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.registerProtocolHandler) {
                          try {
                            navigator.registerProtocolHandler(
                              "web+lin",
                              window.location.origin + "/?import=%s"
                            );
                            setOfflineFeedback("Browser registration prompt active! Click allow in the address bar.");
                          } catch (err: any) {
                            setOfflineFeedback(`Registration error: ${err.message || err}`);
                          }
                        } else {
                          setOfflineFeedback("Custom link handlers not supported by this browser.");
                        }
                      }}
                      className="py-2 w-full bg-zinc-950 border border-zinc-850 hover:bg-zinc-900/40 text-purple-400/90 hover:text-purple-300 text-[10px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                      <span>Enable Direct Sync-Link Handler (`web+lin`) on this Device</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5B. IMPORT MODAL */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 120 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 120 }}
              className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-zinc-800 shadow-2xl relative text-zinc-100 overflow-hidden"
            >
              {/* Top violet/purple gradient indicator bar */}
              <div className="h-1.5 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 w-full" />

              {/* Close Button / Title */}
              <div className="p-6 pb-2 flex items-center justify-between border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
                    <Download className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-1.5 leading-tight">
                      Import List
                    </h3>
                    <p className="text-[11px] text-zinc-500 font-medium">Merge/overwrite items or sync from peer-scanned QR</p>
                  </div>
                </div>
                <button
                  onClick={closeImportModal}
                  className="p-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Feedback/Error banner */}
              {offlineFeedback && (
                <div className="mx-6 mt-4 p-3 bg-purple-950/20 border border-purple-500/15 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping shrink-0" />
                  <span>{offlineFeedback}</span>
                </div>
              )}

              {/* Content Panels */}
              <div className="p-6">
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Paste another list's direct **Sync Link** (starts with `lin://`), deep share link, or raw Base64 backup code below. The application will automatically extract and load the items for you on submit:
                  </p>
                  <textarea
                    rows={3}
                    value={textCodecInput}
                    onChange={(e) => {
                      setTextCodecInput(e.target.value);
                      setShowOverwriteConfirm(false);
                    }}
                    placeholder="Paste the lin:// link, share link, or base64 code here..."
                    className="w-full bg-zinc-950 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500/25 focus:border-purple-500 rounded-xl p-3 text-xs font-mono text-zinc-300 placeholder-zinc-700 resize-none"
                  />

                  <div className="flex flex-col gap-2.5">
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const success = handleImportOfflineData(textCodecInput, "merge");
                          if (success) {
                            closeImportModal();
                          }
                        }}
                        disabled={!textCodecInput.trim() || showOverwriteConfirm}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-750 border border-zinc-750 hover:border-zinc-700 hover:text-purple-300 disabled:opacity-40 text-purple-400 text-xs font-bold rounded-xl transition cursor-pointer"
                      >
                        Merge Items
                      </button>
                      {!showOverwriteConfirm && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowOverwriteConfirm(true);
                          }}
                          disabled={!textCodecInput.trim()}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer"
                        >
                          Overwrite List
                        </button>
                      )}
                    </div>

                    {showOverwriteConfirm && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-red-95/20 border border-red-500/20 rounded-xl">
                        <span className="text-[11px] text-red-300 font-semibold text-center sm:text-left flex-1 leading-tight">
                          ⚠️ Replace entire current list with imported items? This cannot be undone.
                        </span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowOverwriteConfirm(false)}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[11px] font-bold rounded-lg transition cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const success = handleImportOfflineData(textCodecInput, "overwrite");
                              if (success) {
                                closeImportModal();
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-750 text-white text-[11px] font-bold rounded-lg shadow-md transition cursor-pointer"
                          >
                            Confirm Overwrite
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Caret-styled Floating Notification Toast */}
      <AnimatePresence>
        {caretNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="fixed top-6 right-6 z-[100] max-w-sm w-full bg-zinc-900 border border-purple-500/30 shadow-2xl rounded-2xl p-4 overflow-visible"
          >
            {/* The Caret design pointing upwards */}
            <div className="absolute -top-2 right-12 w-4 h-4 bg-zinc-900 border-t border-l border-purple-500/30 rotate-45" />

            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <span className="block p-2 rounded-xl text-white bg-purple-600/30 border border-purple-500/20">
                  <FileCheck className="w-4 h-4 text-purple-400" />
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white tracking-tight">
                  {caretNotification.title}
                </p>
                <p className="mt-1 text-xs text-zinc-400 leading-normal">
                  {caretNotification.message}
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono font-medium text-zinc-500">
                  <span>Count: {caretNotification.count} items</span>
                  <span>Auto-dismissing...</span>
                </div>
              </div>
              <button
                onClick={() => setCaretNotification(null)}
                className="text-zinc-500 hover:text-zinc-300 self-start p-1 -mt-1 -mr-1 transition"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
