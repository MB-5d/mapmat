import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import CaptureImage from './CaptureImage';
import { fetchPrivateScanCapture } from '../../api';

vi.mock('../../api', () => ({ fetchPrivateScanCapture: vi.fn() }));

test('private images use authenticated blobs and release them on unmount', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  URL.createObjectURL = vi.fn(() => 'blob:private-fixture');
  URL.revokeObjectURL = vi.fn();
  fetchPrivateScanCapture.mockResolvedValue(new Blob(['fixture'], { type: 'image/png' }));
  const src = `/api/private-scan-captures/private_scan_${'a'.repeat(48)}.bin`;
  await act(async () => root.render(<CaptureImage src={src} alt="Private page" />));
  expect(fetchPrivateScanCapture).toHaveBeenCalledWith(src, expect.any(AbortSignal));
  expect(container.querySelector('img').getAttribute('src')).toBe('blob:private-fixture');
  await act(async () => root.unmount());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-fixture');
});

test('public images keep their original URL and do not fetch credentials', async () => {
  fetchPrivateScanCapture.mockClear();
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<CaptureImage src="/screenshots/public.png" alt="Public page" />));
  expect(container.querySelector('img').getAttribute('src')).toBe('/screenshots/public.png');
  expect(fetchPrivateScanCapture).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
