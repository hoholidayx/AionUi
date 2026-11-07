#!/usr/bin/env python3
"""Manage the local production Web CLI extracted under out/web-production."""

import argparse
import fcntl
import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener


ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "out" / "web-production" / "aionui-web"
DATA = Path.home() / ".aionui-web"
STATE = DATA / "service" / "process.json"
LOG = DATA / "service" / "web.log"
HOST = "127.0.0.1"
PORT = 25808
URL = f"http://{HOST}:{PORT}"
HTTP = build_opener(ProxyHandler({}))


def command():
    return [str(APP / "aionui-web"), "start", "--no-open", "--port", str(PORT), "--data-dir", str(DATA)]


def identity(pid):
    result = subprocess.run(
        ["ps", "-ww", "-p", str(pid), "-o", "lstart=", "-o", "command="],
        env={**os.environ, "LC_ALL": "C"},
        capture_output=True,
        text=True,
        check=False,
    )
    fields = result.stdout.split(maxsplit=5)
    if not fields:
        return None
    return {"started": " ".join(fields[:5]), "command": fields[5].strip()}


def owned_process():
    if not STATE.exists():
        return None
    record = json.loads(STATE.read_text())
    pid = record["pid"]
    if type(pid) is not int or pid <= 1 or record["argv"] != command():
        raise RuntimeError(f"Unexpected process record in {STATE}")
    current = identity(pid)
    if current is None:
        return None
    if current != record["identity"] or current["command"] != " ".join(command()):
        raise RuntimeError(f"PID {pid} does not belong to this Web service")
    return pid


def port_available():
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listener.bind(("0.0.0.0", PORT))
            listener.listen(1)
        except OSError:
            return False
    return True


def healthy(pid):
    listener = subprocess.run(
        ["lsof", "-a", "-p", str(pid), f"-iTCP:{PORT}", "-sTCP:LISTEN", "-t"],
        capture_output=True,
        text=True,
        check=False,
    )
    if str(pid) not in listener.stdout.split():
        return False
    try:
        with HTTP.open(f"{URL}/api/auth/status", timeout=2) as response:
            payload = json.load(response)
            return response.status == 200 and isinstance(payload, dict) and isinstance(payload.get("needs_setup"), bool)
    except (URLError, TimeoutError, ValueError):
        return False


def finished_starting(log_offset):
    # The Web CLI prints this after first-run credential setup, just before registering SIGTERM.
    with LOG.open("rb") as log:
        log.seek(log_offset)
        return b"Press Ctrl+C to stop." in log.read()


def status():
    pid = owned_process()
    if pid is None:
        if not port_available():
            raise RuntimeError(f"Port {PORT} is occupied by an unmanaged process")
        print("Web service is stopped")
        return 1
    ready = healthy(pid)
    print(f"Web service {'is healthy' if ready else 'is running but unhealthy'} (PID {pid}) at {URL}\nLog: {LOG}")
    return 0 if ready else 1


def start():
    if owned_process() is not None:
        return status()
    if not port_available():
        raise RuntimeError(f"Port {PORT} is occupied by an unmanaged process")
    host = os.uname()
    arch = {"x86_64": "x64", "aarch64": "arm64"}.get(host.machine, host.machine)
    backend = APP / "bundled-aioncore" / f"{host.sysname.lower()}-{arch}" / "aioncore"
    if not (APP / "static" / "index.html").is_file() or not os.access(backend, os.X_OK):
        raise RuntimeError(f"Incomplete Web production bundle at {APP}")

    env = {**os.environ, "AIONUI_LOG_DIR": str(DATA / "logs")}
    env.setdefault("AIONUI_ALLOW_REMOTE", "1")
    env.pop("AIONUI_BACKEND_BIN", None)
    previous_handler = signal.signal(signal.SIGHUP, signal.SIG_IGN)
    try:
        with LOG.open("ab") as log:
            log_offset = log.tell()
            child = subprocess.Popen(
                command(),
                cwd=APP,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
    finally:
        signal.signal(signal.SIGHUP, previous_handler)

    try:
        current = identity(child.pid)
        if current is None or current["command"] != " ".join(command()):
            raise RuntimeError("Could not verify the launched Web CLI process")
        record = {"pid": child.pid, "identity": current, "argv": command(), "port": PORT, "log": str(LOG)}
        pending = STATE.with_suffix(".tmp")
        pending.write_text(json.dumps(record, indent=2) + "\n")
        pending.replace(STATE)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline and child.poll() is None:
            if finished_starting(log_offset) and healthy(child.pid):
                return status()
            time.sleep(0.25)
        raise RuntimeError(f"Web service did not become healthy. See {LOG}")
    except (OSError, RuntimeError, KeyboardInterrupt):
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=20)
        STATE.unlink(missing_ok=True)
        raise


def stop():
    pid = owned_process()
    if pid is not None:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 20
        while owned_process() == pid:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Timed out waiting for Web service PID {pid} to stop")
            time.sleep(0.25)
    if not port_available():
        raise RuntimeError(f"Port {PORT} is still occupied by an unmanaged process")
    STATE.unlink(missing_ok=True)
    print("Web service is stopped")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("start", "stop", "restart", "status"))
    action = parser.parse_args().action
    os.umask(0o077)
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with STATE.with_suffix(".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action == "restart":
            stop()
            return start()
        return {"start": start, "stop": stop, "status": status}[action]()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as error:
        sys.exit(f"Web service: {error}")
