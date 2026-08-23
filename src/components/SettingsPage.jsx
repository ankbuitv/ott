import React from 'react';
export default function SettingsPage({onClose}) {
  return <div className="p-8"><h1 className="text-2xl font-bold text-white mb-4">Cài đặt</h1>
  <button onClick={onClose} className="text-sm text-red-400">Đóng</button></div>;
}