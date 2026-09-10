"""Compatibility entry point: exercise the real app instead of an obsolete IPC mock."""
from continuity_smoke import OUT, run

if __name__ == "__main__":
    for viewport in [(1180, 760), (980, 640)]:
        run(*viewport)
    print(f"Visual and workflow evidence: {OUT}")
