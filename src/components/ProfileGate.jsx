import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Lock, User, X, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile, AVATAR_OPTIONS, getAvatar } from '../contexts/ProfileContext';
import { AvatarBubble } from './Logo';

export default function ProfileGate() {
  const { user, logout } = useAuth();
  const { profiles, currentProfile, fetchProfiles, createProfile, updateProfile, deleteProfile, verifyPin, selectProfile, loading } = useProfile();
  const [editing, setEditing] = useState(null); // null | 'new' | profileId
  const [pinEntry, setPinEntry] = useState(null); // profileId
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    if (user && !currentProfile) fetchProfiles(user.token || localStorage.getItem('chrtv_token'));
  }, [user]);

  if (!user) return null; // Will be handled by AuthGate

  // Hasn't selected a profile yet — show "Who's watching?" + setup
  if (!currentProfile) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-6 overflow-y-auto">
        {/* Top-right logout */}
        <div className="absolute top-6 right-6 flex items-center gap-3">
          <span className="text-xs text-stone-500">{user.email}</span>
          <button onClick={logout} className="text-xs text-stone-400 hover:text-white underline">Đăng xuất</button>
        </div>

        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2">Ai đang xem?</h1>
          <p className="text-stone-500 text-sm mb-10">Chọn hồ sơ của bạn để bắt đầu</p>

          <div className="flex flex-wrap gap-4 md:gap-6 justify-center">
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  if (p.is_child && p.pin_hash) {
                    setPinEntry(p);
                    setPinError('');
                  } else {
                    selectProfile(p);
                  }
                }}
                className="group flex flex-col items-center gap-3 transition-transform hover:scale-105"
              >
                <div className="relative">
                  <AvatarBubble avatarId={p.avatar_url} size="lg" name={p.name} />
                  {p.is_child && (
                    <div className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-amber-500 border-2 border-black flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(p); }}
                    className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-stone-300 group-hover:text-white">{p.name}</p>
                  {p.is_child && <p className="text-[10px] text-amber-500 font-bold mt-0.5">TRẺ EM</p>}
                </div>
              </button>
            ))}

            {/* Add profile */}
            {profiles.length < 5 && (
              <button
                onClick={() => setEditing('new')}
                className="group flex flex-col items-center gap-3 transition-transform hover:scale-105"
              >
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg bg-stone-800/40 border-2 border-dashed border-stone-700 flex items-center justify-center group-hover:border-red-500/50 group-hover:bg-stone-800/60 transition-colors">
                  <Plus className="w-10 h-10 text-stone-600 group-hover:text-red-500" strokeWidth={2} />
                </div>
                <p className="text-sm font-semibold text-stone-400 group-hover:text-white">Thêm hồ sơ</p>
              </button>
            )}
          </div>

          {pinEntry && (
            <PinModal
              profile={pinEntry}
              error={pinError}
              onSuccess={() => { selectProfile(pinEntry); setPinEntry(null); }}
              onCancel={() => { setPinEntry(null); }}
              onVerify={async (pin) => {
                const r = await verifyPin(user.token || localStorage.getItem('chrtv_token'), pinEntry.id, pin);
                if (!r.success) setPinError(r.error || 'PIN sai');
                return r.success;
              }}
            />
          )}

          {editing && (
            <ProfileEditModal
              profile={editing === 'new' ? null : editing}
              onSave={async (data) => {
                const token = user.token || localStorage.getItem('chrtv_token');
                if (editing === 'new') {
                  await createProfile(token, data);
                } else {
                  await updateProfile(token, { id: editing.id, ...data });
                }
                setEditing(null);
              }}
              onDelete={async () => {
                const token = user.token || localStorage.getItem('chrtv_token');
                await deleteProfile(token, editing.id);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      </div>
    );
  }

  return null;
}

function PinModal({ profile, error, onSuccess, onCancel, onVerify }) {
  const [pin, setPin] = useState('');
  const submit = async () => {
    if (pin.length < 4) return;
    const ok = await onVerify(pin);
    onSuccess();
  };
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-[#16181f] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
        <button onClick={onCancel} className="absolute top-3 right-3 p-1"><X className="w-4 h-4" /></button>
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold">Mở khóa {profile.name}</h2>
        </div>
        <p className="text-xs text-stone-400 mb-3">Hồ sơ trẻ em — nhập PIN để tiếp tục</p>
        <input
          type="password" autoFocus value={pin} maxLength={6}
          onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-full bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono text-white focus:outline-none focus:border-red-500 mb-2"
        />
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button onClick={submit} className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm">Mở khóa</button>
      </div>
    </div>
  );
}

function ProfileEditModal({ profile, onSave, onDelete, onCancel }) {
  const isNew = !profile;
  const [name, setName] = useState(profile?.name || '');
  const [avatarId, setAvatarId] = useState(profile?.avatar_url || AVATAR_OPTIONS[0].id);
  const [isChild, setIsChild] = useState(!!profile?.is_child);
  const [pin, setPin] = useState('');

  const handleSave = () => {
    if (!name) return;
    onSave({
      name, avatar_url: avatarId,
      is_child: isChild,
      pin: isChild ? pin : undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#16181f] border border-white/10 rounded-2xl p-6 w-full max-w-md my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{isNew ? 'Tạo hồ sơ mới' : 'Chỉnh sửa hồ sơ'}</h2>
          <button onClick={onCancel} className="p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* Avatar picker */}
        <div className="text-xs text-stone-400 mb-2 font-semibold">Chọn biểu tượng</div>
        <div className="grid grid-cols-5 gap-2 mb-4">
          {AVATAR_OPTIONS.map(a => (
            <button
              key={a.id}
              onClick={() => setAvatarId(a.id)}
              className={`aspect-square rounded-lg bg-gradient-to-br ${a.color} flex items-center justify-center text-2xl transition-transform hover:scale-105 ${
                avatarId === a.id ? 'ring-2 ring-red-500 scale-105' : 'opacity-60'
              }`}
              title={a.label}
            >
              {a.emoji}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs text-stone-400 mb-1 font-semibold">Tên hồ sơ</div>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} maxLength={20}
              placeholder="Vd: Trẻ em, Bố Mẹ..."
              className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <label className="flex items-center justify-between bg-stone-900 rounded-xl px-3 py-2.5 border border-stone-700/50 cursor-pointer">
            <div>
              <div className="text-sm font-semibold">Hồ sơ trẻ em</div>
              <div className="text-[10px] text-stone-500">Giới hạn nội dung, có thể khóa bằng PIN</div>
            </div>
            <button
              type="button"
              onClick={() => setIsChild(!isChild)}
              className={`w-11 h-6 rounded-full transition-all ${isChild ? 'bg-red-600' : 'bg-stone-700'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isChild ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>

          {isChild && (
            <div>
              <div className="text-xs text-stone-400 mb-1 font-semibold">PIN khóa (tùy chọn)</div>
              <input
                type="password" value={pin} onChange={e => setPin(e.target.value)} maxLength={6}
                placeholder="4-6 số"
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 text-center tracking-widest"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          {!isNew && (
            <button
              onClick={() => { if (confirm('Xóa hồ sơ này?')) onDelete(); }}
              className="px-3 py-2.5 bg-red-600/15 text-red-400 border border-red-600/30 rounded-xl text-sm font-semibold hover:bg-red-600/20"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onCancel} className="flex-1 px-3 py-2.5 bg-stone-800 rounded-xl text-sm font-semibold hover:bg-stone-700">Hủy</button>
          <button onClick={handleSave} disabled={!name} className="flex-1 px-3 py-2.5 bg-red-600 disabled:opacity-50 rounded-xl text-sm font-bold hover:bg-red-700">
            {isNew ? 'Tạo' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
