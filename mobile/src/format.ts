export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function errorMessage(caught: unknown): string {
  if (caught instanceof Error) {
    return caught.message;
  }
  return "操作失败";
}
