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
    <div className="w-full bg-white border border-[#E5D9CC] rounded-3xl p-4 shadow-sm space-y-3">
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
          <span className="text-xs font-bold text-[#432E22] uppercase tracking-wider">
            Attached Bill
          </span>
        </div>
        {currentDisplayUrl ? (
          <span className="px-2.5 py-0.5 rounded-full border border-[#C5D9BE] bg-[#E8F0E4] text-[#2E4226] text-[10px] font-bold uppercase">
            1 File Synced
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#8D7868] text-[10px] font-semibold uppercase">
            Optional
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="h-24 flex flex-col items-center justify-center bg-[#FAF6F0] border border-[#E5D9CC] rounded-2xl">
          <div className="w-5 h-5 border-2 border-[#543A2A] border-t-transparent rounded-full animate-spin mb-1.5" />
          <span className="text-xs font-semibold text-[#8D7868]">Compressing bill photo...</span>
        </div>
      ) : currentDisplayUrl ? (
        <div className="space-y-3">
          <div className="p-3 bg-[#FAF6F0] border border-[#E5D9CC] rounded-2xl flex items-center justify-between gap-3 shadow-xs">
            <div
              onClick={() => setShowModal(true)}
              className="flex items-center gap-3 cursor-pointer min-w-0"
            >
              <div className="w-12 h-12 rounded-xl border border-[#E5D9CC] overflow-hidden bg-white shrink-0">
                <img
                  src={currentDisplayUrl}
                  alt="Receipt"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#432E22] block truncate">
                  Bill_Receipt.jpg
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-2 py-0.5 rounded-full border border-[#E5D9CC] bg-white text-[10px] font-semibold text-[#8D7868]">
                    {sizeInfo || 'Synced'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-[#C5D9BE] bg-[#E8F0E4] text-[10px] font-bold text-[#2E4226]">
                    OCR Ready
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemove}
              className="w-8 h-8 rounded-full border border-[#F5C2C0] bg-[#FCE8E6] text-[#A83232] font-bold flex items-center justify-center hover:bg-[#F8D8D5] transition active:scale-95 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleCapture('camera')}
              className="py-2.5 px-3 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#432E22] text-xs font-bold shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>📷</span>
              <span>Retake</span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleCapture('photos')}
              className="py-2.5 px-3 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#432E22] text-xs font-bold shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>➕</span>
              <span>Add More</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleCapture('camera')}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#432E22] text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
          >
            <span>📷</span>
            <span>Camera</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleCapture('photos')}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#432E22] text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
          >
            <span>📁</span>
            <span>Gallery / File</span>
          </button>
        </div>
      )}

      {/* Fullscreen Receipt Modal */}
      {showModal && currentDisplayUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div className="relative max-w-lg max-h-[85vh] w-full flex flex-col items-center">
            <button
              onClick={() => setShowModal(false)}
              className="absolute -top-12 right-0 px-3 py-1.5 bg-[#FAF6F0] border border-[#E5D9CC] rounded-full text-[#432E22] font-bold text-xs shadow-md cursor-pointer hover:bg-[#EFE4D6]"
            >
              Close ✕
            </button>
            <img
              src={currentDisplayUrl}
              alt="Receipt Full View"
              className="max-h-[80vh] max-w-full rounded-2xl object-contain border border-[#E5D9CC] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
