import React, { useEffect, useRef } from 'react';

export default function LogViewer({ logs = '', title = 'Logs' }) {
  const ref = useRef();

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-gray-100 px-3 py-2 font-semibold text-sm">{title}</div>
      <pre ref={ref} className="bg-black text-green-300 text-xs p-3 h-64 overflow-auto whitespace-pre-wrap">
        {logs || 'Waiting for output...'}
      </pre>
    </div>
  );
}
