export async function submitMovieExport(state) {
  const response = await fetch("/api/video-exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Could not start the export.");
  return result;
}
