// Module-level store for a file chosen from the BottomNav camera FAB while on
// a non-capture page. CapturePage reads and clears this on mount.
let _file: File | null = null;

export function setPendingCaptureFile(file: File) {
  _file = file;
}

export function takePendingCaptureFile(): File | null {
  const f = _file;
  _file = null;
  return f;
}
