import tkinter as tk
from tkinter import scrolledtext
import subprocess
import os
import threading
import webbrowser
import urllib.request
import urllib.error
import json
import tempfile
import re

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
PROJECT_DIR = r"C:\Users\Poije\.gemini\antigravity\scratch\world_maker"
AI_MODEL    = "qwen2.5-coder:7b"
OLLAMA_URL  = "http://localhost:11434"
LOCAL_URL   = "http://localhost:3000"
PUBLIC_URL  = "https://github.com/Hexy47/world-maker"
PYTHON_EXE  = r"C:\Users\Poije\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.10_qbz5n2kfra8p0\python.exe"

# ──────────────────────────────────────────────
# PROMPTS
# ──────────────────────────────────────────────
ROUTER_PROMPT = """You are the routing brain for a game engine launcher.
Classify the user's request into one of three categories:
1. "chat": The user is asking a general question (e.g. "how do I play?", "what does main.js do?")
2. "config": The user wants to change a simple game setting (e.g. "make the ground blue", "make player faster", "change jump height").
3. "deep": The user wants complex code changes, logic optimization, or new features (e.g. "optimize FPS", "add an inventory system", "make blocks fall with gravity").

Reply ONLY with a JSON object: {"type": "chat|config|deep", "reason": "..."}
"""

CONFIG_PROMPT = """You are a game config assistant. The user wants to change a setting in game.config.js.
Current config:
{config}

RULES:
1. Reply with ONLY a JSON object: {{"setting": "SETTING_NAME", "value": "NEW_VALUE", "explanation": "short"}}
2. For colors, use hex like 0x228B22. For numbers, use numbers.
3. If unsure, reply: {{"error": "reason"}}
"""

# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────
def run_cmd(cmd, cwd=PROJECT_DIR, timeout=30):
    try:
        r = subprocess.run(cmd, cwd=cwd, shell=True,
                           capture_output=True, text=True, timeout=timeout)
        return r.returncode == 0, r.stdout.strip(), r.stderr.strip()
    except Exception as e:
        return False, "", str(e)

def threaded(fn):
    def wrapper(*args, **kwargs):
        threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True).start()
    return wrapper

def read_file(path):
    with open(os.path.join(PROJECT_DIR, path), "r", encoding="utf-8") as f:
        return f.read()

def write_file(path, content):
    with open(os.path.join(PROJECT_DIR, path), "w", encoding="utf-8") as f:
        f.write(content)

# ──────────────────────────────────────────────
# LAUNCHER APP
# ──────────────────────────────────────────────
class WorldMakerLauncher:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("World Maker Ultimate AI Engine")
        self.root.geometry("620x880")
        self.root.configure(bg="#0d0d0d")
        self.root.resizable(False, False)
        
        self.chat_history = []
        self.last_restart_count = -1
        self.is_healing = False

        self._build_ui()
        self._refresh_status()
        self._chat_add("sys",
            "👋 Welcome to the Ultimate AI Engine!\n\n"
            "I have 3 Brains:\n"
            "💬 Chat Brain: Ask me how your code works.\n"
            "⚡ Config Brain: Say 'make the ground red' (instant).\n"
            "🧠 Deep Brain: Say 'optimize my FPS' (I will rewrite your engine code).\n\n"
            "Just type what you want and I will figure out which brain to use.\n"
        )

    # ─────────────── BUILD UI ────────────────
    def _build_ui(self):
        # HEADER
        tk.Label(self.root, text="⚒️  WORLD MAKER", font=("Segoe UI", 22, "bold"),
                 bg="#0d0d0d", fg="#4facfe", pady=10).pack()
        tk.Label(self.root, text="Ultimate AI Engine Launcher", font=("Segoe UI", 10),
                 bg="#0d0d0d", fg="#444").pack()
        self._sep()

        # TOP BUTTONS
        r1 = tk.Frame(self.root, bg="#0d0d0d")
        r1.pack(fill="x", padx=20, pady=(6,2))
        self._btn(r1, "🎮 Play Local",  self.play_local,  "#2563eb", side="left")
        self._btn(r1, "🌐 Play Public", self.play_public, "#0891b2", side="left")

        r2 = tk.Frame(self.root, bg="#0d0d0d")
        r2.pack(fill="x", padx=20, pady=2)
        self._btn(r2, "🔨 Rebuild Local Game", self.rebuild_local, "#065f46", side="left")
        self._btn(r2, "📁 Open Folder",         self.open_folder,   "#374151", side="left")

        r3 = tk.Frame(self.root, bg="#0d0d0d")
        r3.pack(fill="x", padx=20, pady=(2,6))
        self.publish_btn = self._btn(r3, "🚀 Publish Update to Friends", self.publish_update, "#dc2626", full=True)

        self._sep()

        # STATUS STRIP
        sf = tk.Frame(self.root, bg="#111118", padx=14, pady=6)
        sf.pack(fill="x", padx=14)
        
        self.server_lbl = tk.Label(sf, text="⏳ Server: Checking...",
                                   font=("Segoe UI", 9), bg="#111118", fg="#888", anchor="w")
        self.server_lbl.pack(fill="x")
        
        self.git_lbl = tk.Label(sf, text="⏳ Git: Checking...",
                                font=("Segoe UI", 9), bg="#111118", fg="#888", anchor="w")
        self.git_lbl.pack(fill="x")
        
        self.telemetry_lbl = tk.Label(sf, text="📡 Live Game Stats: Waiting for connection...",
                                font=("Segoe UI", 9, "bold"), bg="#111118", fg="#a78bfa", anchor="w")
        self.telemetry_lbl.pack(fill="x", pady=(4,0))

        self._sep()

        # AI CHAT HEADER
        hdr = tk.Frame(self.root, bg="#0d0d0d")
        hdr.pack(fill="x", padx=14)
        tk.Label(hdr, text="🤖  AI CO-DEVELOPER", font=("Segoe UI", 11, "bold"),
                 bg="#0d0d0d", fg="#a78bfa").pack(side="left")

        # CHAT DISPLAY
        self.chat = scrolledtext.ScrolledText(
            self.root, height=15, font=("Consolas", 9),
            bg="#08080f", fg="#cbd5e1", insertbackground="white",
            relief="flat", padx=10, pady=10, state="disabled", wrap="word", bd=0
        )
        self.chat.pack(fill="x", padx=14, pady=(4, 0))
        self.chat.tag_config("sys",    foreground="#94a3b8")
        self.chat.tag_config("user",   foreground="#60a5fa", font=("Segoe UI", 9, "bold"))
        self.chat.tag_config("ai",     foreground="#c4b5fd")
        self.chat.tag_config("code",   foreground="#86efac", font=("Consolas", 8))
        self.chat.tag_config("ok",     foreground="#22c55e", font=("Segoe UI", 9, "bold"))
        self.chat.tag_config("err",    foreground="#f87171", font=("Segoe UI", 9, "bold"))
        self.chat.tag_config("warn",   foreground="#fbbf24", font=("Segoe UI", 9, "bold"))

        # INPUT ROW
        ir = tk.Frame(self.root, bg="#0d0d0d")
        ir.pack(fill="x", padx=14, pady=6)
        self.entry = tk.Entry(ir, font=("Segoe UI", 11),
                              bg="#13131f", fg="#fff", insertbackground="#a78bfa",
                              relief="flat", bd=0)
        self.entry.pack(side="left", fill="x", expand=True, ipady=8, padx=(0,6))
        self.entry.bind("<Return>", lambda e: self._send())
        self.send_btn = tk.Button(ir, text="Send  ➤", command=self._send,
                                  font=("Segoe UI", 10, "bold"),
                                  bg="#7c3aed", fg="#fff", activebackground="#6d28d9",
                                  activeforeground="#fff", relief="flat",
                                  padx=14, cursor="hand2", bd=0)
        self.send_btn.pack(side="left", ipady=8)

    def _btn(self, parent, text, cmd, color, side=None, full=False):
        b = tk.Button(parent, text=text, command=cmd,
                      font=("Segoe UI", 10, "bold"), bg=color, fg="#fff",
                      activebackground=color, activeforeground="#fff",
                      relief="flat", pady=8, cursor="hand2", bd=0)
        if full: b.pack(fill="x")
        else: b.pack(side=side, fill="x", expand=True, padx=2)
        return b

    def _sep(self):
        tk.Frame(self.root, bg="#1a1a2e", height=1).pack(fill="x", padx=14, pady=5)

    def _chat_add(self, tag, text):
        self.chat.config(state="normal")
        self.chat.insert("end", text, tag)
        self.chat.see("end")
        self.chat.config(state="disabled")

    # ─────────────── CORE AI LOGIC ────────────────
    def _call_ollama(self, messages, json_format=False):
        payload = {"model": AI_MODEL, "messages": messages, "stream": False}
        if json_format: payload["format"] = "json"
        
        req = urllib.request.Request(
            f"{OLLAMA_URL}/api/chat",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())["message"]["content"]

    @threaded
    def _send(self):
        msg = self.entry.get().strip()
        if not msg: return
        self.entry.delete(0, "end")
        self.send_btn.config(state="disabled", text="Thinking...")
        self.root.update_idletasks()

        self._chat_add("user", f"\n👤 You: {msg}\n")
        
        # Add to memory
        self.chat_history.append({"role": "user", "content": msg})

        try:
            # 1. Routing
            route_msg = [{"role": "system", "content": ROUTER_PROMPT}, {"role": "user", "content": msg}]
            intent_json = self._call_ollama(route_msg, json_format=True)
            intent = json.loads(intent_json).get("type", "chat")
            
            if intent == "config":
                self._apply_config(msg)
            elif intent == "deep":
                self._apply_deep_code(msg)
            else:
                self._chat_answer(msg)
        except Exception as e:
            self._chat_add("err", f"⚠️ Error reasoning: {e}\n")

        self.send_btn.config(state="normal", text="Send  ➤")

    def _chat_answer(self, msg):
        self._chat_add("warn", "💬 [Chat Brain]\n")
        sys_msg = {"role": "system", "content": "You are a helpful Three.js game dev assistant. Keep it brief."}
        messages = [sys_msg] + self.chat_history
        
        reply = self._call_ollama(messages)
        self.chat_history.append({"role": "assistant", "content": reply})
        self._chat_add("ai", f"🤖 {reply}\n")

    def _apply_config(self, msg):
        self._chat_add("warn", "⚡ [Fast Config Brain] Editing game.config.js...\n")
        try:
            config = read_file("game.config.js")
            prompt = CONFIG_PROMPT.format(config=config)
            
            result = self._call_ollama([{"role": "system", "content": prompt}, {"role": "user", "content": msg}], json_format=True)
            change = json.loads(result)
            
            if "error" in change:
                self._chat_add("err", f"⚠️ {change['error']}\n")
                return

            setting, value = change.get("setting"), change.get("value")
            
            # Regex replace
            pattern = re.compile(r"^(\s*" + re.escape(setting) + r"\s*:\s*)(.+?)(,\s*//.*)?$", re.MULTILINE)
            match = pattern.search(config)
            if not match:
                self._chat_add("err", f"⚠️ Couldn't find {setting}\n")
                return

            comment = match.group(3) if match.group(3) else ","
            new_line = f"{match.group(1)}{value}{comment}"
            new_config = config[:match.start()] + new_line + config[match.end():]
            
            write_file("game.config.js", new_config)
            self._chat_add("code", f"  ✏️ {setting} → {value}\n")
            
            # Commit & Reload
            run_cmd('git add game.config.js && git commit -m "Config: ' + setting + ' to ' + str(value) + '"')
            self._auto_reload()
            
            self.chat_history.append({"role": "assistant", "content": f"I changed {setting} to {value}."})
            
        except Exception as e:
            self._chat_add("err", f"⚠️ Config Error: {e}\n")

    def _apply_deep_code(self, msg):
        self._chat_add("warn", "🧠 [Deep Planning Brain] Reading full codebase & writing code...\n")
        try:
            # Build history context
            context = "Previous chat history:\n"
            for m in self.chat_history[-5:]:
                context += f"{m['role'].upper()}: {m['content']}\n"
            
            full_msg = context + "\n\nNEW REQUEST: " + msg

            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
                f.write(full_msg)
                msg_file = f.name

            # Run Aider with multiple files for RAG
            cmd = [
                "cmd", "/c", "run_aider.bat",
                "--model", f"ollama/{AI_MODEL}",
                "--yes", "--no-suggest-shell-commands",
                "--message-file", msg_file,
                "main.js", "server.js", "game.config.js"
            ]
            
            proc = subprocess.Popen(cmd, cwd=PROJECT_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
            
            self._chat_add("ai", "  🔍 Scanning project files...\n")
            for line in proc.stdout:
                line = line.rstrip()
                if not line or line.startswith(">"): continue
                low = line.lower()
                if "commit" in low or "wrote" in low or "edit" in low:
                    self._chat_add("code", f"  🛠️ {line}\n")
                elif "error" in low or "failed" in low:
                    self._chat_add("err", f"  ⚠️ {line}\n")
            proc.wait()
            
            if proc.returncode == 0:
                self._chat_add("ok", "  ✅ Code updated successfully.\n")
                self._chat_add("sys", "  🔄 Auto-rebuilding and hot-reloading game...\n")
                run_cmd("npm run build") # Rebuild Vite
                self._auto_reload() # Force browser refresh
                self.chat_history.append({"role": "assistant", "content": "I applied the deep code changes."})
            else:
                self._chat_add("err", "  ⚠️ Aider hit an issue. Check the output.\n")
                
        except Exception as e:
            self._chat_add("err", f"⚠️ Error: {e}\n")

    def _auto_reload(self):
        try:
            urllib.request.urlopen(f"{LOCAL_URL}/api/reload", data=b"", timeout=2)
            self._chat_add("ok", "✅ Game Hot-Reloaded in browser!\n")
        except:
            self._chat_add("warn", "ℹ️ Couldn't hot-reload (is the server running?)\n")

    # ─────────────── AUTO HEALING ────────────────
    @threaded
    def _auto_heal(self, logs):
        if self.is_healing: return
        self.is_healing = True
        self._chat_add("err", "\n🚨 [SELF-HEALING] Detected server crash!\n")
        self._chat_add("ai", "  Reading error logs and writing fix...\n")
        
        try:
            msg = f"The Node server crashed with this error. Fix the code:\n\n{logs}"
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
                f.write(msg)
                msg_file = f.name
                
            cmd = ["cmd", "/c", "run_aider.bat", "--model", f"ollama/{AI_MODEL}", "--yes", "--no-suggest-shell-commands", "--message-file", msg_file, "server.js", "main.js"]
            proc = subprocess.Popen(cmd, cwd=PROJECT_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
            for line in proc.stdout:
                if "wrote" in line.lower() or "commit" in line.lower():
                    self._chat_add("code", f"  🛠️ {line.strip()}\n")
            proc.wait()
            
            if proc.returncode == 0:
                self._chat_add("ok", "✅ Crash fixed! Hot-reloading...\n")
                run_cmd("npm run build")
                self._auto_reload()
            else:
                self._chat_add("err", "⚠️ Couldn't auto-fix the crash. You may need to look at it manually.\n")
        except Exception as e:
            pass
        finally:
            self.is_healing = False

    # ─────────────── BACKGROUND STATUS ────────────────
    @threaded
    def _refresh_status(self):
        # 1. Server Status
        try:
            urllib.request.urlopen(LOCAL_URL + "/status", timeout=2)
            self.server_lbl.config(text="🟢 Server: Running", fg="#22c55e")
        except:
            self.server_lbl.config(text="🔴 Server: Offline — Click Play Local to start", fg="#ef4444")
            
        # 2. Git Status
        try:
            ok1, uncommitted, _ = run_cmd("git status --porcelain")
            ok2, unpushed, _    = run_cmd("git log origin/main..HEAD --oneline")
            if uncommitted.strip() or unpushed.strip():
                self.git_lbl.config(text="🟡 Git: You have unpublished changes", fg="#eab308")
            else:
                self.git_lbl.config(text="🟢 Git: Public server is up to date", fg="#22c55e")
        except: pass

        # 3. Live Telemetry
        try:
            resp = urllib.request.urlopen(f"{LOCAL_URL}/api/telemetry", timeout=2)
            data = json.loads(resp.read().decode())
            if data:
                self.telemetry_lbl.config(text=f"📡 Live Stats — FPS: {data.get('fps',0)} | Objects: {data.get('objects',0)} | Players: {data.get('players',0)}")
            else:
                self.telemetry_lbl.config(text="📡 Live Game Stats: Waiting for player to connect...")
        except:
            self.telemetry_lbl.config(text="📡 Live Game Stats: Offline")

        # 4. PM2 Crash Monitoring
        ok, out, _ = run_cmd("pm2 jlist")
        if ok and out:
            try:
                processes = json.loads(out)
                for p in processes:
                    if p.get("name") == "world_maker_server":
                        restarts = p.get("pm2_env", {}).get("restart_time", 0)
                        if self.last_restart_count != -1 and restarts > self.last_restart_count:
                            # CRASH DETECTED! Grab logs.
                            _, err_logs, _ = run_cmd("pm2 logs world_maker_server --err --lines 20 --nostream")
                            
                            # PM2 watch restarts also increment restart_count. Only heal if there is a real error.
                            real_error = False
                            for line in err_logs.split('\n'):
                                if line.strip() and not line.startswith("[TAILING]") and not line.startswith("C:\\"):
                                    real_error = True
                                    break
                                    
                            if real_error:
                                self._auto_heal(err_logs)
                        self.last_restart_count = restarts
            except: pass

        self.root.after(2000, self._refresh_status) # Faster refresh for live telemetry

    # ─────────────── BUTTON ACTIONS ────────────────
    def play_local(self):
        subprocess.Popen("pm2 start ecosystem.config.cjs", cwd=PROJECT_DIR, shell=True, creationflags=subprocess.CREATE_NO_WINDOW)
        webbrowser.open(LOCAL_URL)

    def play_public(self):
        webbrowser.open(PUBLIC_URL)

    def open_folder(self):
        os.startfile(PROJECT_DIR)

    @threaded
    def rebuild_local(self):
        self._chat_add("warn", "\n🔨 Rebuilding local game...\n")
        ok, out, err = run_cmd("npm run build", cwd=PROJECT_DIR, timeout=60)
        if ok:
            self._chat_add("ok", "✅ Local game rebuilt!\n")
            self._auto_reload()
        else:
            self._chat_add("err", f"⚠️ Build failed:\n{err}\n")

    @threaded
    def publish_update(self):
        self.publish_btn.config(state="disabled")
        self._chat_add("warn", "\n🚀 Publishing update to friends...\n")
        try:
            run_cmd("git add -A")
            run_cmd('git commit -m "Update from World Maker Launcher"')
            ok, out, err = run_cmd("git push origin main")
            if ok or "up-to-date" in (out + err).lower():
                self._chat_add("ok", "✅ Published! Friends will see the update in ~3 mins.\n")
            else:
                self._chat_add("err", f"⚠️ Publish failed:\n{err}\n")
        except: pass
        finally: self.publish_btn.config(state="normal")

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    WorldMakerLauncher().run()
