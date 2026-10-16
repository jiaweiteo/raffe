"""Launch both views and keep the local server in this terminal."""
import time
import threading
import urllib.request
import webbrowser

import uvicorn


def open_views():
    for _ in range(120):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=1) as response:
                if response.status == 200:
                    webbrowser.open('http://127.0.0.1:8765/admin', new=1)
                    webbrowser.open('http://127.0.0.1:8765/display', new=1)
                    return
        except Exception:
            time.sleep(.5)


if __name__ == '__main__':
    import os
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    os.chdir(root)
    sys.path.insert(0, str(root))
    threading.Thread(target=open_views, daemon=True).start()
    uvicorn.run('backend.app:create_app', factory=True, host='127.0.0.1', port=8765, access_log=False)
