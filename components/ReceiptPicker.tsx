'use client';

// components/ReceiptPicker.tsx
// Stitch-Engineered Attached Bill Card with Neo-Brutalist Layout

import React, { useState, useEffect, useRef } from 'react';
import {
  captureReceiptPhoto,
  compressImageToJpeg,
  getReceiptSignedUrl,
  MAX_RECEIPT_BYTES,
} from '../lib/native/camera';

interface ReceiptPickerProps {
  receiptPath?: string | null;
  onReceiptSelected: (blob: Blob, previewUrl: string) => void;
  onReceiptRemoved: () => void;
  disabled?: boolean;
}

export const ReceiptPicker: React.FC<ReceiptPickerProps> = ({
  receiptPath,
  onReceiptSelected,
  onReceiptRemoved,
  disabled = false,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sizeInfo, setSizeInfo] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (receiptPath && !previewUrl) {
      let isMounted = true;
      setIsLoading(true);
      getReceiptSignedUrl(receiptPath, 3600)
        .then((url) => {
          if (isMounted && url) {
            setSignedUrl(url);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
      return () => {
        isMounted = false;
      };
    } else if (!receiptPath && !previewUrl) {
      setSignedUrl(null);
    }
  }, [receiptPath, previewUrl]);

  const handleCapture = async (source: 'camera' | 'photos') => {
    if (disabled) return;
    try {
      setIsLoading(true);
      const result = await captureReceiptPhoto(source);
      if (result) {
        setPreviewUrl(result.previewUrl);
        const kb = Math.round(result.sizeBytes / 1024);
        setSizeInfo(`${kb} KB`);
        onReceiptSelected(result.blob, result.previewUrl);
      }
    } catch {
      fileInputRef.current?.click();
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      const { blob, sizeBytes } = await compressImageToJpeg(file, MAX_RECEIPT_BYTES);
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setPreviewUrl(url);
        const kb = Math.round(sizeBytes / 1024);
        setSizeInfo(`${kb} KB`);
        onReceiptSelected(blob, url);
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      alert(`Error processing image: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemove = () => {
    if (disabled) return;
    setPreviewUrl(null);
    setSignedUrl(null);
    setSizeInfo(null);
    onReceiptRemoved();
  };

  const currentDisplayUrl = previewUrl || signedUrl;

  return (
    <div className="w-full bg-white border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_0px_#000] space-y-3">
      {/* Hidden file input for web fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
        disabled={disabled}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧾</span>
          <span className="text-xs font-mono font-black text-black uppercase tracking-wider">
            ATTACHED BILL
          </span>
        </div>
        {currentDisplayUrl ? (
          <span className="px-2 py-0.5 rounded border border-black bg-[#ccff00] text-black text-[10px] font-mono font-black uppercase">
            1 FILE SYNCED
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded border border-black bg-[#f0f0ea] text-black/60 text-[10px] font-mono font-bold uppercase">
            OPTIONAL
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="h-24 flex flex-col items-center justify-center bg-[#f0f0ea] border-2 border-black rounded-xl">
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mb-1.5" />
          <span className="text-xs font-mono font-bold text-black">Compressing bill photo...</span>
        </div>
      ) : currentDisplayUrl ? (
        <div className="space-y-3">
          <div className="p-3 bg-[#e8e8e2] border-2 border-black rounded-xl flex items-center justify-between gap-3 shadow-[2px_2px_0px_0px_#000]">
            <div
              onClick={() => setShowModal(true)}
              className="flex items-center gap-3 cursor-pointer min-w-0"
            >
              <div className="w-12 h-12 rounded-lg border-2 border-black overflow-hidden bg-white shrink-0">
                <img
                  src={currentDisplayUrl}
                  alt="Receipt"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-mono font-black text-black block truncate">
                  Bill_Receipt.jpg
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-1.5 py-0.2 rounded border border-black bg-white text-[9px] font-mono font-bold">
                    {sizeInfo || 'Synced'}
                  </span>
                  <span className="px-1.5 py-0.2 rounded border border-black bg-[#ccff00] text-[9px] font-mono font-black text-black">
                    OCR READY
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemove}
              className="w-8 h-8 rounded-lg border-2 border-black bg-[#ff8a80] text-black font-black flex items-center justify-center shadow-[1px_1px_0px_0px_#000] hover:bg-[#ff7060] transition"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleCapture('camera')}
              className="py-2.5 px-3 rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] text-black text-xs font-mono font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5"
            >
              <span>📷</span>
              <span>RETAKE</span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleCapture('photos')}
              className="py-2.5 px-3 rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] text-black text-xs font-mono font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5"
            >
              <span>➕</span>
              <span>ADD MORE</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleCapture('camera')}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] text-black text-xs font-mono font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5"
          >
            <span>📷</span>
            <span>CAMERA</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleCapture('photos')}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] text-black text-xs font-mono font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5"
          >
            <span>📁</span>
            <span>GALLERY / FILE</span>
          </button>
        </div>
      )}

      {/* Fullscreen Receipt Modal */}
      {showModal && currentDisplayUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div className="relative max-w-lg max-h-[85vh] w-full flex flex-col items-center">
            <button
              onClick={() => setShowModal(false)}
              className="absolute -top-10 right-0 px-2 py-1 bg-white border-2 border-black rounded-lg text-black font-mono font-black text-xs shadow-[2px_2px_0px_0px_#000]"
            >
              CLOSE ✕
            </button>
            <img
              src={currentDisplayUrl}
              alt="Receipt Full View"
              className="max-h-[80vh] max-w-full rounded-xl object-contain border-2 border-black shadow-[5px_5px_0px_0px_#000]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
