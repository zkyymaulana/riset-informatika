// utils/formatTime.js
export function formatTime(dateString) {
  const date = new Date(dateString);

  const options = {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };

  return date.toLocaleString("id-ID", options);
}
