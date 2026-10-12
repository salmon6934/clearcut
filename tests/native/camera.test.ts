import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  compressImageToJpeg,
  uploadReceiptToStorage,
  getReceiptSignedUrl,
  MAX_RECEIPT_BYTES,
} from '../../lib/native/camera';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

describe('Camera & Receipt Compression Module (T-2.9.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('guarantees image compression limits within 1.5 MB threshold', async () => {
    // In Node test environment, verify compressImageToJpeg returns a blob within maxBytes
    const content = 'a'.repeat(500 * 1024); // 500 KB
    const blob = new Blob([content], { type: 'image/jpeg' });

    const result = await compressImageToJpeg(blob, MAX_RECEIPT_BYTES);
    expect(result.sizeBytes).toBeLessThanOrEqual(MAX_RECEIPT_BYTES);
    expect(result.blob).toBeDefined();
  });

  it('uploads receipt blob to private receipts bucket with partitioned path', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: { path: 'group-123/expense-456_12345.jpg' },
      error: null,
    });

    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: mockUpload,
    } as any);

    const testBlob = new Blob(['fake image bytes'], { type: 'image/jpeg' });
    const res = await uploadReceiptToStorage('group-123', 'expense-456', testBlob);

    expect(supabase.storage.from).toHaveBeenCalledWith('receipts');
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^group-123\/expense-456_\d+\.jpg$/),
      testBlob,
      { contentType: 'image/jpeg', upsert: true }
    );
    expect(res.path).toBe('group-123/expense-456_12345.jpg');
  });

  it('generates a short-lived signed URL for a receipt storage path', async () => {
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://supabase.co/storage/v1/object/sign/receipts/path.jpg?token=abc' },
      error: null,
    });

    vi.mocked(supabase.storage.from).mockReturnValue({
      createSignedUrl: mockCreateSignedUrl,
    } as any);

    const signedUrl = await getReceiptSignedUrl('group-123/receipt.jpg', 3600);

    expect(supabase.storage.from).toHaveBeenCalledWith('receipts');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('group-123/receipt.jpg', 3600);
    expect(signedUrl).toContain('token=abc');
  });

  it('handles signed URL errors gracefully by returning null', async () => {
    vi.mocked(supabase.storage.from).mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: null,
        error: new Error('Permission denied'),
      }),
    } as any);

    const signedUrl = await getReceiptSignedUrl('unauthorized/path.jpg');
    expect(signedUrl).toBeNull();
  });
});
