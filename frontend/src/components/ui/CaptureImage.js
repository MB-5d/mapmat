import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { fetchPrivateScanCapture } from '../../api';

const CaptureImage = forwardRef(({ src, onError, ...props }, ref) => {
  const privateCapture = String(src || '').startsWith('/api/private-scan-captures/');
  const [resolved, setResolved] = useState(null);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  useEffect(() => {
    if (!privateCapture) return undefined;
    const controller = new AbortController();
    let objectUrl;
    setResolved(null);
    fetchPrivateScanCapture(src, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ src, url: objectUrl });
    }).catch(() => { if (!controller.signal.aborted) errorHandler.current?.(); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, privateCapture]);
  const imageSrc = privateCapture ? (resolved?.src === src ? resolved.url : null) : src;
  return imageSrc ? <img {...props} src={imageSrc} ref={ref} onError={onError} /> : null;
});

export default CaptureImage;
