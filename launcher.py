import tkinter as tk
from tkinter import messagebox, scrolledtext
import subprocess
import os
import threading
import webbrowser
import json
import time

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
PROJECT_DIR = r"C:\Users\Poije\.gemini\antigravity\scratch\world_maker"
AI_MODEL = "ollama/qwen2.5-coder:7b"
LOCAL_URL = "http://localhost:3000"
GITHUB_REPO = "https://github.com/Hexy47/world-maker"

# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────
def run_cmd(cmd, cwd=PROJECT_DIR, shell=True):
    """Run a command and return (success, stdout, stderr)"""
    try:
        result = subprocess.run(cmd, cwd=cwd, shell=shell, capture_output=True, text=True, timeout=30)
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return False, "", str(e)

def run_cmd_background(cmd, cwd=PROJECT_DIR):
    """Run a command in the background without blocking"""
    subprocess.Popen(cmd, cwd=cwd, shell=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=subprocess.CREATE_NO_WINDOW)

def threaded(fn):
    """Decorator to run a function in a background thread"""
    def wrapper(*args, **kwargs):
        t = threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True)
        t.start()
    return wrapper

# ──────────────────────────────────────────────
# MAIN APP CLASS
# ──────────────────────────────────────────────
class WorldMakerLauncher:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("World Maker Engine")
        self.root.geometry("520x720")
        self.root.configure(bg="#0d0d0d")
        self.root.resizable(False, False)

        # Try to set icon (won't crash if missing)
        try:
            self.root.iconbitmap(default="")
        except:
            pass

        self.build_ui()
        self.update_server_status()
        self.update_git_status()

        # Auto-refresh status every 10 seconds
        self.auto_refresh()

    # ──────────────────────────────────────────
    # UI BUILDER
    # ──────────────────────────────────────────
    def build_ui(self):
        # ── HEADER ──
        header = tk.Frame(self.root, bg="#0d0d0d", pady=15)
        header.pack(fill="x")

        tk.Label(header, text="⚒️ WORLD MAKER", font=("Segoe UI", 22, "bold"),
                 bg="#0d0d0d", fg="#4facfe").pack()
        tk.Label(header, text="Engine Launcher", font=("Segoe UI", 11),
                 bg="#0d0d0d", fg="#666666").pack()

        # ── SEPARATOR ──
        tk.Frame(self.root, bg="#1a1a2e", height=2).pack(fill="x", padx=20, pady=5)

        # ── MAIN BUTTONS ──
        btn_frame = tk.Frame(self.root, bg="#0d0d0d", pady=10)
        btn_frame.pack(fill="x")

        self.create_button(btn_frame, "🤖  Open AI Assistant",
                           "Talk to AI to build your game",
                           self.open_ai, "#7c3aed")

        self.create_button(btn_frame, "🎮  Play Local Game",
                           "Test your latest changes instantly",
                           self.play_local, "#2563eb")

        self.create_button(btn_frame, "🌐  Play Public Game",
                           "Join the live server your friends use",
                           self.play_public, "#0891b2")

        self.create_button(btn_frame, "📁  Open Engine Folder",
                           "Browse your game files",
                           self.open_folder, "#374151")

        # ── SEPARATOR ──
        tk.Frame(self.root, bg="#1a1a2e", height=2).pack(fill="x", padx=20, pady=5)

        # ── PUBLISH SECTION ──
        publish_frame = tk.Frame(self.root, bg="#0d0d0d", pady=5)
        publish_frame.pack(fill="x")

        self.publish_btn = self.create_button(publish_frame, "🚀  Publish Update to Friends",
                           "Push your code live (takes ~3 min to go live)",
                           self.publish_update, "#dc2626")

        # ── SEPARATOR ──
        tk.Frame(self.root, bg="#1a1a2e", height=2).pack(fill="x", padx=20, pady=5)

        # ── STATUS PANEL ──
        status_frame = tk.Frame(self.root, bg="#111118", pady=10, padx=20)
        status_frame.pack(fill="x", padx=20, pady=5)

        tk.Label(status_frame, text="STATUS", font=("Segoe UI", 9, "bold"),
                 bg="#111118", fg="#555555", anchor="w").pack(fill="x")

        # Server status
        self.server_status = tk.Label(status_frame, text="⏳ Checking local server...",
                                       font=("Segoe UI", 10), bg="#111118", fg="#888888", anchor="w")
        self.server_status.pack(fill="x", pady=(5,0))

        # Git status
        self.git_status = tk.Label(status_frame, text="⏳ Checking for unpublished changes...",
                                    font=("Segoe UI", 10), bg="#111118", fg="#888888", anchor="w")
        self.git_status.pack(fill="x", pady=(2,0))

        # AI model
        tk.Label(status_frame, text=f"🧠 AI Model: {AI_MODEL.split('/')[-1]}",
                 font=("Segoe UI", 10), bg="#111118", fg="#666666", anchor="w").pack(fill="x", pady=(2,0))

        # ── FOOTER ──
        tk.Label(self.root, text="Built with ❤️ by Antigravity",
                 font=("Segoe UI", 8), bg="#0d0d0d", fg="#333333").pack(side="bottom", pady=10)

    def create_button(self, parent, text, subtitle, command, color):
        """Create a styled button with a subtitle"""
        frame = tk.Frame(parent, bg="#0d0d0d")
        frame.pack(fill="x", padx=30, pady=4)

        btn = tk.Button(frame, text=text, command=command,
                        font=("Segoe UI", 13, "bold"), bg=color, fg="#ffffff",
                        activebackground=self._lighten(color), activeforeground="#ffffff",
                        relief="flat", pady=10, cursor="hand2", bd=0)
        btn.pack(fill="x")

        tk.Label(frame, text=subtitle, font=("Segoe UI", 9),
                 bg="#0d0d0d", fg="#555555").pack(anchor="w", padx=5)

        return btn

    def _lighten(self, hex_color):
        """Lighten a hex color slightly for hover"""
        try:
            r = int(hex_color[1:3], 16)
            g = int(hex_color[3:5], 16)
            b = int(hex_color[5:7], 16)
            r = min(255, r + 30)
            g = min(255, g + 30)
            b = min(255, b + 30)
            return f"#{r:02x}{g:02x}{b:02x}"
        except:
            return "#555555"

    # ──────────────────────────────────────────
    # ACTIONS
    # ──────────────────────────────────────────
    def open_ai(self):
        """Launch Aider in GUI mode in the default browser"""
        run_cmd_background(f"python -m aider --gui --model {AI_MODEL}", cwd=PROJECT_DIR)

    def play_local(self):
        """Ensure PM2 server is running, then open local game"""
        self.ensure_server_running()
        webbrowser.open(LOCAL_URL)

    def play_public(self):
        """Open the live public game"""
        webbrowser.open(GITHUB_REPO)
        messagebox.showinfo("Public Game",
            "Your public game is hosted on Render.\n\n"
            "If you haven't set up Render yet, ask your AI assistant to help you deploy!")

    def open_folder(self):
        """Open the project folder in Windows Explorer"""
        os.startfile(PROJECT_DIR)

    @threaded
    def publish_update(self):
        """Commit all changes and push to GitHub"""
        self.publish_btn.config(state="disabled")
        self.root.update()

        try:
            # Stage all changes
            run_cmd("git add -A", cwd=PROJECT_DIR)

            # Check if there are changes to commit
            ok, out, _ = run_cmd("git status --porcelain", cwd=PROJECT_DIR)
            if ok and out.strip():
                # There are uncommitted changes, commit them
                run_cmd('git commit -m "Update from World Maker Launcher"', cwd=PROJECT_DIR)

            # Push to GitHub
            ok, out, err = run_cmd("git push origin main", cwd=PROJECT_DIR)
            if ok:
                messagebox.showinfo("Published! ✅",
                    "Your update has been sent to the public server!\n\n"
                    "Your friends will see the changes in about 3 minutes.")
            else:
                if "Everything up-to-date" in (out + err):
                    messagebox.showinfo("Already Up To Date",
                        "Your public server already has the latest code!\n\n"
                        "No changes needed.")
                else:
                    messagebox.showerror("Publish Failed",
                        f"Something went wrong:\n\n{err}\n\nAsk your AI assistant for help!")
        except Exception as e:
            messagebox.showerror("Error", f"Publish failed:\n{e}")
        finally:
            self.publish_btn.config(state="normal")
            self.update_git_status()

    # ──────────────────────────────────────────
    # SERVER MANAGEMENT
    # ──────────────────────────────────────────
    def ensure_server_running(self):
        """Make sure PM2 has the local server running"""
        run_cmd("pm2 start ecosystem.config.cjs", cwd=PROJECT_DIR)

    @threaded
    def update_server_status(self):
        """Check if the local server is actually responding"""
        try:
            import urllib.request
            urllib.request.urlopen(LOCAL_URL, timeout=3)
            self.server_status.config(text="🟢 Local server is running", fg="#22c55e")
        except:
            # Try to start it
            self.ensure_server_running()
            time.sleep(2)
            try:
                import urllib.request
                urllib.request.urlopen(LOCAL_URL, timeout=3)
                self.server_status.config(text="🟢 Local server is running", fg="#22c55e")
            except:
                self.server_status.config(text="🔴 Local server is offline", fg="#ef4444")

    @threaded
    def update_git_status(self):
        """Check if there are unpublished local changes"""
        try:
            # Check for uncommitted changes
            ok1, uncommitted, _ = run_cmd("git status --porcelain", cwd=PROJECT_DIR)
            # Check for unpushed commits
            ok2, unpushed, _ = run_cmd("git log origin/main..HEAD --oneline", cwd=PROJECT_DIR)

            has_uncommitted = ok1 and uncommitted.strip() != ""
            has_unpushed = ok2 and unpushed.strip() != ""

            if has_uncommitted or has_unpushed:
                self.git_status.config(text="🟡 You have unpublished changes", fg="#eab308")
            else:
                self.git_status.config(text="🟢 Public server is up to date", fg="#22c55e")
        except:
            self.git_status.config(text="⚪ Could not check git status", fg="#666666")

    def auto_refresh(self):
        """Refresh status indicators every 10 seconds"""
        self.update_server_status()
        self.update_git_status()
        self.root.after(10000, self.auto_refresh)

    # ──────────────────────────────────────────
    # RUN
    # ──────────────────────────────────────────
    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = WorldMakerLauncher()
    app.run()
