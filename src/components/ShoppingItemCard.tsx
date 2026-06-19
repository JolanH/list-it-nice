import React from "react";
import { motion, useMotionValue, useTransform } from "motion/react";
import { Check, Trash2 } from "lucide-react";
import { ShoppingItem } from "../types";

interface ShoppingItemCardProps {
  item: ShoppingItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ShoppingItemCard({ item, onToggle, onDelete }: ShoppingItemCardProps) {
  const x = useMotionValue(0);
  
  // Transform x position to reveal red background
  const backgroundOpacity = useTransform(x, [0, 15, 80, 180], [0, 0, 0.9, 1]);
  const trashScale = useTransform(x, [0, 15, 80, 150], [0, 0.8, 1, 1.2]);

  // Red halo shadow glow and border when swiping right
  const haloShadow = useTransform(
    x,
    [0, 15, 60, 140],
    [
      "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -1px rgba(0,0,0,0.06)", // Default dark shadow
      "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -1px rgba(0,0,0,0.06)", // Still dark shadow
      "0px 0px 16px rgba(239, 68, 68, 0.45), 0px 0px 4px rgba(239, 68, 68, 0.2)", // Red halo
      "0px 0px 30px rgba(239, 68, 68, 0.95), 0px 0px 8px rgba(239, 68, 68, 0.45)" // Strong red halo
    ]
  );

  const haloBorder = useTransform(
    x,
    [0, 15, 100],
    [
      item.checked ? "rgba(24, 24, 27, 0.6)" : "rgba(39, 39, 42, 1)",
      item.checked ? "rgba(24, 24, 27, 0.6)" : "rgba(39, 39, 42, 1)",
      "rgba(239, 68, 68, 0.85)"
    ]
  );
  
  const handleDragEnd = (_event: any, info: any) => {
    // If swiped right past 140px, trigger delete action
    if (info.offset.x > 140) {
      onDelete(item.id);
    }
  };

  return (
    <div className="relative group overflow-hidden rounded-2xl mb-3.5 h-[76px] bg-zinc-950 select-none shadow-md">
      {/* Background delete action banner - revealed on swiping right */}
      <motion.div
        style={{ opacity: backgroundOpacity }}
        className="absolute inset-0 bg-red-650 rounded-2xl pointer-events-none flex items-center pl-6"
      >
        <motion.div style={{ scale: trashScale }}>
          <Trash2 className="w-5 h-5 text-white stroke-[2.5]" />
        </motion.div>
      </motion.div>
 
      {/* Foreground Swipeable Item Card styled via Dark Theme with Purple Highlight */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 300 }}
        dragElastic={{ left: 0.05, right: 0.65 }}
        style={{ x, boxShadow: haloShadow, borderColor: haloBorder }}
        onDragEnd={handleDragEnd}
        onClick={() => onToggle(item.id)}
        className={`absolute inset-0 flex items-center justify-between px-6 border rounded-2xl cursor-pointer active:cursor-grabbing transition-colors duration-200 ${
          item.checked
            ? "bg-zinc-900/40 border-zinc-900/60 opacity-50"
            : "bg-zinc-850 border-zinc-800 shadow-lg hover:border-purple-500/40 hover:shadow-purple-950/10"
        }`}
      >
        <div className="flex items-center gap-4 min-w-0 pr-4">
          <motion.div
            whileTap={{ scale: 0.88 }}
            className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 ${
              item.checked 
                ? "bg-purple-600 border-none text-white shadow-md shadow-purple-900/40" 
                : "border-2 border-zinc-650 hover:border-purple-400/80 text-transparent"
            }`}
          >
            {item.checked ? (
              <Check className="w-4 h-4 stroke-[3]" />
            ) : (
              <span className="block w-2.5 h-2.5 rounded-full bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </motion.div>

          <div className="min-w-0">
            <span
              className={`text-lg font-medium block truncate transition-all duration-300 leading-tight ${
                item.checked
                  ? "text-zinc-500 line-through decoration-zinc-600"
                  : "text-zinc-100"
              }`}
            >
              {item.name}
            </span>
            {item.quantity && (
              <span
                className={`text-xs font-semibold font-mono tracking-wider mt-0.5 block ${
                  item.checked ? "text-zinc-600" : "text-purple-450 group-hover:text-purple-400"
                }`}
              >
                Qty: {item.quantity}
              </span>
            )}
          </div>
        </div>

        {/* Swipe Handle Hint for Desktop/Touch Users (visible on hover) */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex items-center gap-1 text-zinc-600 pr-1 select-none pointer-events-none sm:flex hidden">
          <span className="text-[10px] font-bold tracking-widest uppercase">Swipe →</span>
        </div>
      </motion.div>
    </div>
  );
}
