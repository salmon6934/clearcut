'use client';

// app/global-error.tsx
// Root-level global error boundary replacing root layout if layout or templates crash

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Clearcut GlobalError]:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: '24px',
          minHeight: '100vh',
          backgroundColor: '#FAF6F0',
          color: '#432E22',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '360px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5D9CC',
            borderRadius: '24px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(84, 58, 42, 0.08)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              backgroundColor: '#FCE8E6',
              border: '1px solid #F5C2C0',
              color: '#A83232',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              fontSize: '24px',
              fontWeight: 'bold',
            }}
          >
            !
          </div>

          <h1
            style={{
              fontSize: '18px',
              fontWeight: '700',
              color: '#432E22',
              margin: '0 0 8px 0',
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: '13px',
              color: '#8D7868',
              lineHeight: 1.5,
              margin: '0 0 20px 0',
            }}
          >
            An unexpected error occurred. You can reload the page or return to the dashboard.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => reset()}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: '#543A2A',
                color: '#FAF6F0',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>

            <button
              onClick={() => {
                window.location.href = '/';
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                borderRadius: '9999px',
                border: '1px solid #E5D9CC',
                backgroundColor: '#FAF6F0',
                color: '#543A2A',
                cursor: 'pointer',
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

