async function sendWhatsAppTemplate({
  templateId,
  destinationNumber,
  params = [],
}) {
  if (!templateId || !destinationNumber) {
    throw new Error("Missing templateId or destinationNumber");
  }

  const endpoint = "https://api.gupshup.io/wa/api/v1/template/msg";
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Apikey: process.env.GUPSHUP_API_KEY,
  };

  const source = process.env.GUPSHUP_SOURCE || "919731093893";
  const srcName = process.env.GUPSHUP_SRC_NAME || "IndoAITechnologies";

  const normalizedDestination = destinationNumber.startsWith("91")
    ? destinationNumber
    : `91${destinationNumber}`;

  const payload = new URLSearchParams({
    channel: "whatsapp",
    source,
    "src.name": srcName,
    destination: normalizedDestination,
    template: JSON.stringify({
      id: templateId,
      params,
    }),
  });

  const fetch = (await import("node-fetch")).default;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: payload.toString(),
  });

  const result = await response.json();
  return result;
}

module.exports = {
  sendWhatsAppTemplate,
};
