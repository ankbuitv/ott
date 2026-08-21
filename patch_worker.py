#!/usr/bin/env python3
with open('worker/worker.js', 'r') as f:
    code = f.read()

# Remove the bloated ensureTables and replace with minimal version
start = code.find('async function ensureTables(env)')
handle_user_start = code.find('async function handleUser(path, request, env)')

if start >= 0 and handle_user_start >= 0:
    old = code[start:handle_user_start]
    
    minimal = '''async function ensureTables(env) {
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS user_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, avatar_url TEXT DEFAULT '', is_child INTEGER DEFAULT 0, pin_hash TEXT DEFAULT '', active INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)").run();
  } catch (e) {
    console.error('ensureTables error:', e.message || e);
  }
}
'''
    code = code.replace(old, minimal)
    with open('worker/worker.js', 'w') as f:
        f.write(code)
    print(f"Replaced {len(old)} bytes with {len(minimal)} bytes")
else:
    print("Could not find markers")