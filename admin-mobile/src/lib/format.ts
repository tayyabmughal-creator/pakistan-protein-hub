export const formatCurrency = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const formatNumber = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const formatCompactNumber = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("en-PK", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

export const formatDate = (value?: string | null) => {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "N/A";
  return new Date(value).toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (segment: number) => String(segment).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const toIsoDateTime = (value?: string | null) => {
  if (!value) return new Date().toISOString();
  if (value.includes("T")) return new Date(value).toISOString();
  const normalized = value.replace(" ", "T");
  return new Date(normalized).toISOString();
};
