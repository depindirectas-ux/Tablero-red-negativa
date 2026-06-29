const { getStore } = require("@netlify/blobs");

const STORE_NAME = "red-negativa-dashboard";
const SOURCE_KEY = "latest-source.json";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function response(statusCode, payload) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  };
}

function readToken(event) {
  return event.headers["x-update-token"] || event.headers["X-Update-Token"] || "";
}

exports.handler = async (event) => {
  const store = getStore(STORE_NAME);

  if (event.httpMethod === "GET") {
    const source = await store.get(SOURCE_KEY, { type: "json" });
    return response(200, { source: source || null });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { error: "Metodo no permitido." });
  }

  const requiredToken = process.env.RED_NEGATIVA_UPDATE_TOKEN || "";
  if (requiredToken && readToken(event) !== requiredToken) {
    return response(401, { error: "Clave de actualizacion incorrecta." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return response(400, { error: "JSON invalido." });
  }

  const source = payload.source;
  if (!source?.headers?.length || !source?.records?.length) {
    return response(400, { error: "La base no tiene el formato esperado." });
  }

  const savedSource = {
    ...source,
    sharedAt: new Date().toISOString(),
  };

  await store.setJSON(SOURCE_KEY, savedSource);
  return response(200, { ok: true, source: savedSource });
};
