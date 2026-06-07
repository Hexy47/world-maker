import tkinter as tk
from tkinter import scrolledtext, messagebox
import subprocess
import os
import threading
import webbrowser
import time
import urllib.request
import urllib.error
import json

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
PROJECT_DIR = r"C:\Users\Poije\.gemini\antigravity\scratch\world_maker"
AI_MODEL    = "qwen2.5-coder:7b"
OLLAMA_URL  = "http://localhost:11434"
LOCAL_URL   = "http://localhost:3000"
PUBLIC_URL  = "https://github.com/Hexy47/world-maker"
PYTHON_EXE  = r"C:\Users\Poije\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.10_qbz5n2kfra8p0\python.exe"
GAME_FILES  = "main.js server.js style.css index.html"

# Keywords that suggest a code-change request vs a question
CHANGE_WORDS = [
    "make", "change", "add", "remove", "delete", "create", "build",
    "set", "turn", "update", "fix", "move", "increase", "decrease",
    "modify", "replace", "put", "give", "enable", "disable", "speed",
    "color", "colour", "size", "bigger", "smaller", "faster", "slower"
]

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

def is_change_request(msg):
    lower = msg.lower()
    return any(w in lower for w in CHANGE_WORDS)

# Context injected into every aider request
GAME_MAP_CONTEXT = """
You are editing a game config file called game.config.js.
This file has ONE setting per line, each with a clear unique name.
When the user asks to change something, find its setting name and change the value.
Do NOT edit any other file. Only edit game.config.js.

The settings are:
- SKY_COLOR          = the sky/background color (hex like 0x003300)
- GROUND_COLOR       = the floor/ground color (hex)
- GROUND_SIZE        = how big the world ground is
- STAR_COUNT         = number of stars in sky
- PLAYER_SPEED       = walk speed (number, higher = faster)
- JUMP_HEIGHT        = jump power (number, higher = bigger jump)
- GRAVITY            = gravity strength (number)
- EYE_HEIGHT         = camera/player eye height
- OTHER_PLAYER_COLOR = color of other players (hex)
- OTHER_PLAYER_HEIGHT= height of other player shapes
- BLOCK_COLOR        = default placed block color (hex)
- AMBIENT_INTENSITY  = overall light brightness (0.0-1.0)
- SUN_INTENSITY      = sunlight strength (number)
"""
class WorldMakerLauncher:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("World Maker Engine")
        self.root.geometry("580x840")
        self.root.configure(bg="#0d0d0d")
        self.root.resizable(False, False)
        self._build_ui()
        self._refresh_status()
        self._chat_add("sys",
            "👋 Welcome! You can ask me anything or tell me to change your game.\n\n"
            "💡 Examples:\n"
            "  • \"make the ground blue\"\n"
            "  • \"what does main.js do?\"\n"
            "  • \"add a big red cube in the middle\"\n"
            "  • \"how do I add more players?\"\n"
        )

    # ─────────────── BUILD UI ────────────────
    def _build_ui(self):
        # HEADER
        tk.Label(self.root, text="⚒️  WORLD MAKER", font=("Segoe UI", 22, "bold"),
                 bg="#0d0d0d", fg="#4facfe", pady=10).pack()
        tk.Label(self.root, text="Engine Launcher", font=("Segoe UI", 10),
                 bg="#0d0d0d", fg="#444").pack()
        self._sep()

        # TOP BUTTONS — row 1: Play
        r1 = tk.Frame(self.root, bg="#0d0d0d")
        r1.pack(fill="x", padx=20, pady=(6,2))
        self._btn(r1, "🎮 Play Local",  self.play_local,  "#2563eb", side="left")
        self._btn(r1, "🌐 Play Public", self.play_public, "#0891b2", side="left")

        # TOP BUTTONS — row 2: Build + Folder
        r2 = tk.Frame(self.root, bg="#0d0d0d")
        r2.pack(fill="x", padx=20, pady=2)
        self._btn(r2, "🔨 Rebuild Local Game", self.rebuild_local, "#065f46", side="left")
        self._btn(r2, "📁 Open Folder",         self.open_folder,   "#374151", side="left")

        # TOP BUTTONS — row 3: Publish
        r3 = tk.Frame(self.root, bg="#0d0d0d")
        r3.pack(fill="x", padx=20, pady=(2,6))
        self.publish_btn = self._btn(r3, "🚀 Publish Update to Friends", self.publish_update, "#dc2626", full=True)
        tk.Label(self.root, text="Push your latest code live — friends see it in ~3 mins",
                 font=("Segoe UI", 8), bg="#0d0d0d", fg="#444").pack()

        self._sep()

        # STATUS STRIP
        sf = tk.Frame(self.root, bg="#111118", padx=14, pady=6)
        sf.pack(fill="x", padx=14)
        self.server_lbl = tk.Label(sf, text="⏳ Checking local server...",
                                   font=("Segoe UI", 9), bg="#111118", fg="#888", anchor="w")
        self.server_lbl.pack(fill="x")
        self.git_lbl = tk.Label(sf, text="⏳ Checking for unpublished changes...",
                                font=("Segoe UI", 9), bg="#111118", fg="#888", anchor="w")
        self.git_lbl.pack(fill="x")

        self._sep()

        # AI CHAT HEADER
        hdr = tk.Frame(self.root, bg="#0d0d0d")
        hdr.pack(fill="x", padx=14)
        tk.Label(hdr, text="🤖  AI ASSISTANT", font=("Segoe UI", 11, "bold"),
                 bg="#0d0d0d", fg="#a78bfa").pack(side="left")
        tk.Label(hdr, text="ask anything or say what to change",
                 font=("Segoe UI", 9), bg="#0d0d0d", fg="#555").pack(side="left", padx=8)

        # CHAT DISPLAY
        self.chat = scrolledtext.ScrolledText(
            self.root, height=16, font=("Consolas", 9),
            bg="#08080f", fg="#cbd5e1", insertbackground="white",
            relief="flat", padx=10, pady=10, state="disabled",
            wrap="word", bd=0
        )
        self.chat.pack(fill="x", padx=14, pady=(4, 0))
        self.chat.tag_config("sys",    foreground="#94a3b8")
        self.chat.tag_config("user",   foreground="#60a5fa", font=("Segoe UI", 9, "bold"))
        self.chat.tag_config("ai",     foreground="#c4b5fd")
        self.chat.tag_config("code",   foreground="#86efac", font=("Consolas", 8))
        self.chat.tag_config("ok",     foreground="#22c55e", font=("Segoe UI", 9, "bold"))
        self.chat.tag_config("err",    foreground="#f87171", font=("Segoe UI", 9, "bold"))
        self.chat.tag_config("warn",   foreground="#fbbf24")
        self.chat.tag_config("label",  foreground="#a78bfa", font=("Segoe UI", 9, "bold"))

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

        # FOOTER
        tk.Label(self.root, text="Built with ❤️ by Antigravity",
                 font=("Segoe UI", 8), bg="#0d0d0d", fg="#1f1f1f").pack(side="bottom", pady=4)

    def _btn(self, parent, text, cmd, color, side=None, full=False):
        b = tk.Button(parent, text=text, command=cmd,
                      font=("Segoe UI", 10, "bold"), bg=color, fg="#fff",
                      activebackground=self._lighten(color), activeforeground="#fff",
                      relief="flat", pady=8, cursor="hand2", bd=0)
        if full:
            b.pack(fill="x")
        else:
            b.pack(side=side, fill="x", expand=True, padx=2)
        return b

    def _sep(self):
        tk.Frame(self.root, bg="#1a1a2e", height=1).pack(fill="x", padx=14, pady=5)

    def _lighten(self, c):
        try:
            r = min(255, int(c[1:3], 16)+30)
            g = min(255, int(c[3:5], 16)+30)
            b = min(255, int(c[5:7], 16)+30)
            return f"#{r:02x}{g:02x}{b:02x}"
        except: return "#555"

    # ─────────────── CHAT ────────────────
    def _chat_add(self, tag, text):
        self.chat.config(state="normal")
        self.chat.insert("end", text, tag)
        self.chat.see("end")
        self.chat.config(state="disabled")

    @threaded
    def _send(self):
        msg = self.entry.get().strip()
        if not msg:
            return
        self.entry.delete(0, "end")
        self.send_btn.config(state="disabled", text="Thinking...")
        self.root.update_idletasks()

        self._chat_add("user", f"\n👤 You: {msg}\n")

        if is_change_request(msg):
            self._apply_code_change(msg)
        else:
            self._ask_ai_question(msg)

        self.send_btn.config(state="normal", text="Send  ➤")

    def _ask_ai_question(self, msg):
        """Send a plain question to Ollama and stream the answer."""
        self._chat_add("label", "🤖 AI: ")
        try:
            payload = json.dumps({
                "model": AI_MODEL,
                "messages": [
                    {"role": "system",
                     "content": (
                         "You are a helpful assistant for a beginner game developer. "
                         "Their game is a multiplayer 3D world built with Three.js, Node.js, "
                         "Express, and Socket.io. The main game code is in main.js. "
                         "Keep answers short, friendly, and beginner-friendly."
                     )},
                    {"role": "user", "content": msg}
                ],
                "stream": True
            }).encode()
            req = urllib.request.Request(
                f"{OLLAMA_URL}/api/chat",
                data=payload,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                for line in resp:
                    if line:
                        try:
                            chunk = json.loads(line.decode())
                            token = chunk.get("message", {}).get("content", "")
                            if token:
                                self._chat_add("ai", token)
                        except:
                            pass
            self._chat_add("ai", "\n")
        except Exception as e:
            self._chat_add("err",
                f"⚠️ Couldn't connect to the AI.\n"
                f"Make sure Ollama is running. Error: {e}\n")

    def _apply_code_change(self, msg):
        """Run aider targeting ONLY game.config.js."""
        self._chat_add("warn", "🔧 Changing setting in game.config.js... (10-30 sec)\n")
        try:
            full_msg = GAME_MAP_CONTEXT.strip() + "\n\nUser request: " + msg
            cmd = [
                PYTHON_EXE, "-m", "aider",
                "--model", f"ollama/{AI_MODEL}",
                "--yes",
                "--no-suggest-shell-commands",
                "--message", full_msg,
                "game.config.js"   # ← ONLY this file, never main.js
            ]
            proc = subprocess.Popen(
                cmd, cwd=PROJECT_DIR,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace"
            )
            for line in proc.stdout:
                line = line.rstrip()
                if not line or line.startswith(">"):
                    continue
                low = line.lower()
                if any(k in low for k in ["commit", "applied", "wrote", "edit", "creating"]):
                    self._chat_add("code", f"  {line}\n")
                elif any(k in low for k in ["error", "failed"]):
                    self._chat_add("err", f"  {line}\n")
                elif any(k in low for k in ["token", "cost", "git", "add ", "ollama", "model"]):
                    pass  # skip noisy lines
                else:
                    self._chat_add("ai", f"  {line}\n")
            proc.wait()
            if proc.returncode == 0:
                self._chat_add("ok",
                    "✅ Done! Click 🔨 Rebuild Local Game then refresh your browser.\n")
                self._update_git_status()
            else:
                self._chat_add("err",
                    "⚠️ Couldn't apply that change. Try rephrasing it.\n"
                    "Example: 'change GROUND_COLOR to dark blue'\n")
        except Exception as e:
            self._chat_add("err", f"Error: {e}\n")

    # ─────────────── ACTIONS ────────────────
    def play_local(self):
        subprocess.Popen("pm2 start ecosystem.config.cjs", cwd=PROJECT_DIR, shell=True,
                         creationflags=subprocess.CREATE_NO_WINDOW)
        webbrowser.open(LOCAL_URL)

    def play_public(self):
        webbrowser.open(PUBLIC_URL)
        self._chat_add("sys", "\n🌐 Opened your public game link!\n")

    def open_folder(self):
        os.startfile(PROJECT_DIR)

    @threaded
    def rebuild_local(self):
        self._chat_add("warn", "\n🔨 Rebuilding local game...\n")
        ok, out, err = run_cmd(f'"{PYTHON_EXE}" -m aider --version', timeout=5)
        ok, out, err = run_cmd("npm run build", cwd=PROJECT_DIR, timeout=60)
        if ok:
            self._chat_add("ok", "✅ Local game rebuilt! Refresh your browser to see changes.\n")
        else:
            self._chat_add("err", f"⚠️ Build failed:\n{err}\n")

    @threaded
    def publish_update(self):
        self.publish_btn.config(state="disabled")
        self._chat_add("warn", "\n🚀 Publishing update to friends...\n")
        try:
            run_cmd("git add -A")
            ok, out, _ = run_cmd("git status --porcelain")
            if ok and out.strip():
                run_cmd('git commit -m "Update from World Maker Launcher"')
            ok, out, err = run_cmd("git push origin main")
            combined = (out + err).lower()
            if ok or "up-to-date" in combined:
                self._chat_add("ok", "✅ Published! Friends will see the update in ~3 mins.\n")
                self._update_git_status()
            else:
                self._chat_add("err", f"⚠️ Publish failed:\n{err}\n")
        except Exception as e:
            self._chat_add("err", f"Error: {e}\n")
        finally:
            self.publish_btn.config(state="normal")

    # ─────────────── STATUS ────────────────
    @threaded
    def _refresh_status(self):
        # Server
        try:
            urllib.request.urlopen(LOCAL_URL, timeout=2)
            self.server_lbl.config(text="🟢 Local server is running", fg="#22c55e")
        except:
            self.server_lbl.config(
                text="🔴 Local server offline — click Play Local to start it", fg="#ef4444")
        self._update_git_status()
        self.root.after(15000, self._refresh_status)

    def _update_git_status(self):
        try:
            ok1, uncommitted, _ = run_cmd("git status --porcelain")
            ok2, unpushed, _    = run_cmd("git log origin/main..HEAD --oneline")
            if (ok1 and uncommitted.strip()) or (ok2 and unpushed.strip()):
                self.git_lbl.config(text="🟡 You have unpublished changes", fg="#eab308")
            else:
                self.git_lbl.config(text="🟢 Public server is up to date", fg="#22c55e")
        except:
            self.git_lbl.config(text="⚪ Could not check git status", fg="#555")

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    WorldMakerLauncher().run()
