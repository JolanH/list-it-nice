import React, { useState, useEffect, useRef } from "react";
import { Trash2, X, Check, Copy } from "lucide-react";
import { motion } from "motion/react";

interface RecentListItemCardProps {
  key?: string | number;
  id: string;
  name: string;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string, e?: React.MouseEvent, bypassConfirm?: boolean) => any;
  onDuplicate?: (id: string, name: string) => void;
}

export function RecentListItemCard({ id, name, isActive, onSelect, onDelete, onDuplicate }: RecentListItemCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActive = useRef(false);

  useEffect(() => {
    if (!showConfirm) return;
    const timer = setTimeout(() => {
      setShowConfirm(false);
    }, 4000); // reset after 4s of inactivity
    return () => clearTimeout(timer);
  }, [showConfirm]);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, []);

  const startPress = (e: React.MouseEvent | React.TouchEvent) => {
    // If we're already raw deleting or confirming, don't trigger duplicate
    if (showConfirm) return;
    
    isLongPressActive.current = false;
    setIsPressing(true);

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }

    pressTimerRef.current = setTimeout(() => {
      isLongPressActive.current = true;
      setIsPressing(false);
      if (onDuplicate) {
        onDuplicate(id, name);
      }
    }, 600); // 600ms hold duration
  };

  const endPress = () => {
    setIsPressing(false);
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startPress(e);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only detect left clicks
    if (e.button !== 0) return;
    startPress(e);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPressActive.current) {
      // Long press already triggered, swallow click
      e.preventDefault();
      e.stopPropagation();
      isLongPressActive.current = false;
      return;
    }
    if (!showConfirm) {
      onSelect(id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    endPress();
    if (showConfirm) {
      onDelete(id, e, true);
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(false);
  };

  return (
    <motion.div
      onMouseDown={handleMouseDown}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={handleTouchStart}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
      onTouchMove={endPress}
      onClick={handleClick}
      whileTap={{ scale: 0.98 }}
      className={`group relative flex items-center justify-between px-3.5 h-11 border rounded-xl cursor-pointer select-none transition-all duration-200 mb-1.5 overflow-hidden ${
        isPressing
          ? "bg-zinc-900 border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
          : isActive
          ? "bg-purple-950 border-purple-500/40 font-semibold text-purple-200 shadow-sm shadow-purple-950/20"
          : "bg-zinc-900 border-zinc-900/30 text-zinc-400 hover:bg-zinc-800/100 hover:text-zinc-150"
      }`}
    >
      <div className="flex flex-col min-w-0 flex-1 justify-center">
        <span className="text-sm truncate pr-2 font-medium">
          {showConfirm ? <span className="text-red-400 font-semibold animate-pulse">Delete?</span> : name}
        </span>
        {/* Subtle helper hint that appears on group hover to guide users */}
        {!showConfirm && !isPressing && (
          <span className="text-[9px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-mono tracking-tight leading-none mt-0.5">
            Hold to duplicate
          </span>
        )}
        {isPressing && (
          <span className="text-[9px] text-purple-400 font-mono tracking-tight leading-none mt-0.5 animate-pulse">
            Duplicating...
          </span>
        )}
      </div>

      <div className="flex items-center space-x-1 shrink-0 z-10">
        {showConfirm && (
          <button
            type="button"
            onClick={handleCancelClick}
            title="Cancel"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors rounded-lg hover:bg-zinc-800/80 flex items-center justify-center -mr-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDeleteClick}
          title={showConfirm ? "Confirm Delete" : "Delete List"}
          className={`p-1.5 transition-all rounded-lg flex items-center justify-center shrink-0 ${
            showConfirm
              ? "bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white"
              : "text-zinc-500 hover:text-red-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:transition-opacity hover:bg-zinc-800"
          }`}
        >
          {showConfirm ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Visual long press progress loading bar */}
      {isPressing && (
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 0.6, ease: "linear" }}
          className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-purple-500 to-indigo-500"
        />
      )}
    </motion.div>
  );
}
