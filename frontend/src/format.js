export const money = (cents) =>
  new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
  }).format(cents / 100);
export const integer = (value) => new Intl.NumberFormat("en-SG").format(value);
export const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-SG", {
        timeZone: "Asia/Singapore",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not yet";
export const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-SG", {
        timeZone: "Asia/Singapore",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No bank timestamp";
export const centsFrom = (value) =>
  /^\d+(\.\d{0,2})?$/.test(String(value))
    ? Math.round(Number(value) * 100)
    : NaN;
export const wholeFrom = (value) =>
  /^\d+$/.test(String(value)) ? Number(value) : NaN;
export const mailLink = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      [
        "outlook.live.com",
        "outlook.office.com",
        "outlook.office365.com",
      ].includes(url.hostname)
      ? value
      : null;
  } catch {
    return null;
  }
};
