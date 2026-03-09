// netlify/functions/subscribe.js
// Netlify Function — proxy seguro para a API do Brevo
// A API key fica na variável de ambiente BREVO_API_KEY (configurada no painel do Netlify)

exports.handler = async (event) => {
  // Só aceita POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // CORS headers (permite chamadas da sua landing page)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const { email, firstName } = JSON.parse(event.body);

    // Validação básica
    if (!email || !firstName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Email and first name are required." }),
      };
    }

    // Chama a API do Brevo com a key segura
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: email,
        attributes: {
          FIRSTNAME: firstName,
        },
        listIds: [parseInt(process.env.BREVO_LIST_ID || "5")],
        updateEnabled: true,
      }),
    });

    const data = await response.json().catch(() => null);

    // Sucesso ou contato duplicado (ambos são OK)
    if (response.ok || response.status === 201 || response.status === 204) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true }),
      };
    }

    if (data && data.code === "duplicate_parameter") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, duplicate: true }),
      };
    }

    // Erro da API do Brevo
    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify({
        error: data?.message || "Something went wrong with the email service.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error. Please try again." }),
    };
  }
};
